use crate::{
    email::{card, esc, send_html},
    error::{AppError, AppResult},
    middleware::auth::AuthUser,
    modules::manual::{record_payment, ManualReq},
    state::AppState,
};
use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::{json, Value};
use uuid::Uuid;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/plans/{id}/claim", post(create_claim))
        .route("/claims", get(list_claims))
        .route("/claims/{id}/confirm", post(confirm))
        .route("/claims/{id}/reject", post(reject))
}

/// Customer: "I have paid by transfer". Tells the seller; no money is recorded yet.
async fn create_claim(u: AuthUser, State(s): State<AppState>, Path(plan_id): Path<Uuid>) -> AppResult<Json<Value>> {
    u.require("customer")?;
    let (locked, installment, paid, status, seller_id, kind, rstatus): (i64, i64, i64, String, Uuid, String, String) =
        sqlx::query_as(
            "SELECT p.locked_price, p.installment_amount, p.amount_paid, p.status, c.seller_id, c.kind, c.rotation_status
             FROM plans p JOIN channels c ON c.id = p.channel_id
             WHERE p.id = $1 AND p.customer_id = $2",
        )
        .bind(plan_id)
        .bind(u.id)
        .fetch_one(&s.db)
        .await?;

    if status != "active" {
        return Err(AppError::BadRequest("This plan is not active".into()));
    }
    if kind == "rotation" && rstatus != "running" {
        return Err(AppError::BadRequest("This group has not started yet".into()));
    }
    let amount = installment.min(locked - paid);
    if amount <= 0 {
        return Err(AppError::BadRequest("Nothing left to pay".into()));
    }
    let waiting: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM transfer_claims WHERE plan_id = $1 AND status = 'pending')")
        .bind(plan_id)
        .fetch_one(&s.db)
        .await?;
    if waiting {
        return Err(AppError::BadRequest(
            "You already told the seller. They will confirm once they see the money.".into(),
        ));
    }

    sqlx::query("INSERT INTO transfer_claims (plan_id, customer_id, seller_id, amount) VALUES ($1, $2, $3, $4)")
        .bind(plan_id)
        .bind(u.id)
        .bind(seller_id)
        .bind(amount)
        .execute(&s.db)
        .await?;

    // Email the seller. A failed email never blocks the notice, which they will also see in the app.
    let seller_email: String = sqlx::query_scalar("SELECT email FROM users WHERE id = $1")
        .bind(seller_id)
        .fetch_one(&s.db)
        .await?;
    let customer: String = sqlx::query_scalar("SELECT full_name FROM users WHERE id = $1")
        .bind(u.id)
        .fetch_one(&s.db)
        .await?;
    let url = format!("{}/payments", s.config.frontend_url.trim_end_matches('/'));
    let body = format!(
        "<p><b>{}</b> says they paid <b>₦{}</b> by bank transfer.</p>\
         <p>Check your bank app. If the money is there, tap Confirm in Kobkart so their balance updates.</p>",
        esc(&customer),
        amount / 100
    );
    let html = card("A transfer is waiting for you", &body, Some(("Confirm payment", &url)));
    if let Err(e) = send_html(&s, &seller_email, "A customer says they paid you", html).await {
        tracing::warn!("claim email failed: {e:?}");
    }
    Ok(Json(json!({ "ok": true })))
}

#[derive(Serialize, sqlx::FromRow)]
struct ClaimRow {
    id: Uuid,
    amount: i64,
    created_at: DateTime<Utc>,
    full_name: String,
    phone: String,
    channel_name: String,
    kind: String,
    product_name: Option<String>,
}

/// Seller: transfers waiting to be confirmed.
async fn list_claims(u: AuthUser, State(s): State<AppState>) -> AppResult<Json<Vec<ClaimRow>>> {
    u.require("seller")?;
    let rows = sqlx::query_as::<_, ClaimRow>(
        "SELECT t.id, t.amount, t.created_at, us.full_name, us.phone,
                c.name AS channel_name, c.kind, pr.name AS product_name
         FROM transfer_claims t
         JOIN users us ON us.id = t.customer_id
         JOIN plans p ON p.id = t.plan_id
         JOIN channels c ON c.id = p.channel_id
         LEFT JOIN products pr ON pr.id = p.product_id
         WHERE t.seller_id = $1 AND t.status = 'pending'
         ORDER BY t.created_at",
    )
    .bind(u.id)
    .fetch_all(&s.db)
    .await?;
    Ok(Json(rows))
}

/// Seller: "I received it". Marks the notice done, then records the payment the normal way.
async fn confirm(u: AuthUser, State(s): State<AppState>, Path(id): Path<Uuid>) -> AppResult<Json<Value>> {
    u.require("seller")?;
    let uid = u.id;
    // This UPDATE only matches once, so a double tap cannot record the money twice.
    let row: Option<(Uuid, i64)> = sqlx::query_as(
        "UPDATE transfer_claims SET status = 'confirmed', decided_at = now()
         WHERE id = $1 AND seller_id = $2 AND status = 'pending'
         RETURNING plan_id, amount",
    )
    .bind(id)
    .bind(uid)
    .fetch_optional(&s.db)
    .await?;
    let (plan_id, amount) = row.ok_or_else(|| AppError::BadRequest("This was already handled".into()))?;

    let res = record_payment(
        u,
        State(s.clone()),
        Json(ManualReq {
            plan_id,
            amount,
            method: Some("transfer".into()),
            note: Some("Customer's transfer, confirmed by seller".into()),
        }),
    )
    .await;
    if let Err(e) = res {
        // recording failed, so put the notice back and let the seller see why
        sqlx::query("UPDATE transfer_claims SET status = 'pending', decided_at = NULL WHERE id = $1")
            .bind(id)
            .execute(&s.db)
            .await?;
        return Err(e);
    }
    Ok(Json(json!({ "ok": true })))
}

/// Seller: "I did not receive this".
async fn reject(u: AuthUser, State(s): State<AppState>, Path(id): Path<Uuid>) -> AppResult<Json<Value>> {
    u.require("seller")?;
    let r = sqlx::query(
        "UPDATE transfer_claims SET status = 'rejected', decided_at = now()
         WHERE id = $1 AND seller_id = $2 AND status = 'pending'",
    )
    .bind(id)
    .bind(u.id)
    .execute(&s.db)
    .await?;
    if r.rows_affected() == 0 {
        return Err(AppError::BadRequest("This was already handled".into()));
    }
    Ok(Json(json!({ "ok": true })))
}
