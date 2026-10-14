use crate::{
    error::{AppError, AppResult},
    middleware::auth::AuthUser,
    email,
    paystack,
    state::AppState,
};
use axum::{
    body::Bytes,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::{json, Value};
use sqlx::FromRow;
use uuid::Uuid;

pub const PAY_COLS: &str =
    "py.id, py.plan_id, py.amount, py.platform_fee, py.reference, py.status, py.paid_at, py.created_at, py.method, py.note";

#[derive(Serialize, FromRow)]
pub struct PaymentRow {
    pub id: Uuid,
    pub plan_id: Uuid,
    pub amount: i64,
    pub platform_fee: i64,
    pub reference: String,
    pub status: String,
    pub paid_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub method: String,
    pub note: Option<String>,
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/plans/{id}/pay", post(pay))
        .route("/payments", get(history))
        .route("/payments/webhook", post(webhook))
        .route("/payments/verify/{reference}", get(verify))
}

/// Customer taps "Pay now": we create a pending payment and get a Paystack checkout link.
async fn pay(u: AuthUser, State(s): State<AppState>, Path(plan_id): Path<Uuid>) -> AppResult<Json<Value>> {
    u.require("customer")?;
    if !s.config.online_payments {
        return Err(AppError::BadRequest("Online payment is not open yet. Please pay your organizer directly and ask them to record it.".into()));
    }
    let (locked, installment, paid, status, channel_id): (i64, i64, i64, String, Uuid) = sqlx::query_as(
        "SELECT locked_price, installment_amount, amount_paid, status, channel_id
         FROM plans WHERE id = $1 AND customer_id = $2",
    )
    .bind(plan_id)
    .bind(u.id)
    .fetch_one(&s.db)
    .await?;

    if status != "active" {
        return Err(AppError::BadRequest("This plan is not active".into()));
    }
    let not_started: bool =
        sqlx::query_scalar("SELECT kind = 'rotation' AND rotation_status <> 'running' FROM channels WHERE id = $1")
            .bind(channel_id)
            .fetch_one(&s.db)
            .await?;
    if not_started {
        return Err(AppError::BadRequest("This group has not started yet. You can pay once your seller starts it.".into()));
    }
    let seller_suspended: bool = sqlx::query_scalar(
        "SELECT su.suspended_at IS NOT NULL FROM channels c JOIN users su ON su.id = c.seller_id WHERE c.id = $1",
    )
    .bind(channel_id)
    .fetch_one(&s.db)
    .await?;
    if seller_suspended {
        return Err(AppError::BadRequest("This seller is currently unavailable.".into()));
    }
    let amount = installment.min(locked - paid);
    if amount <= 0 {
        return Err(AppError::BadRequest("Nothing left to pay".into()));
    }

    let subaccount: Option<String> = sqlx::query_scalar(
        "SELECT s.paystack_subaccount_code FROM channels c
         JOIN sellers s ON s.user_id = c.seller_id WHERE c.id = $1",
    )
    .bind(channel_id)
    .fetch_one(&s.db)
    .await?;
    let subaccount = subaccount
        .ok_or_else(|| AppError::BadRequest("This seller has not set up payouts yet".into()))?;

    let email: String = sqlx::query_scalar("SELECT email FROM users WHERE id = $1")
        .bind(u.id)
        .fetch_one(&s.db)
        .await?;

    let fee = amount * s.config.platform_fee_percent / 100;
    let reference = format!("KOB-{}", Uuid::new_v4().simple());

    sqlx::query("INSERT INTO payments (plan_id, amount, platform_fee, reference) VALUES ($1, $2, $3, $4)")
        .bind(plan_id)
        .bind(amount)
        .bind(fee)
        .bind(&reference)
        .execute(&s.db)
        .await?;

    let data = paystack::post(
        &s,
        "/transaction/initialize",
        json!({
            "email": email,
            "amount": amount,
            "reference": reference,
            "subaccount": subaccount,
            "transaction_charge": fee,
            "bearer": "subaccount",
            "callback_url": format!("{}/payment/callback", s.config.frontend_url),
            "metadata": { "plan_id": plan_id }
        }),
    )
    .await?;

    Ok(Json(json!({
        "authorization_url": data["authorization_url"],
        "reference": reference
    })))
}

/// Paystack calls this after every successful charge. Safe to receive twice.
async fn webhook(State(s): State<AppState>, headers: HeaderMap, body: Bytes) -> StatusCode {
    let sig = headers
        .get("x-paystack-signature")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if !paystack::verify_signature(&s.config.paystack_secret, &body, sig) {
        return StatusCode::UNAUTHORIZED;
    }
    let Ok(event) = serde_json::from_slice::<Value>(&body) else {
        return StatusCode::BAD_REQUEST;
    };
    if event["event"] == "charge.success" {
        let reference = event["data"]["reference"].as_str().unwrap_or("");
        let amount = event["data"]["amount"].as_i64().unwrap_or(0);
        if let Err(e) = record_success(&s, reference, amount).await {
            tracing::error!("webhook failed for {reference}: {e:?}");
            return StatusCode::INTERNAL_SERVER_ERROR; // Paystack will retry
        }
    }
    StatusCode::OK
}

async fn record_success(s: &AppState, reference: &str, amount: i64) -> AppResult<()> {
    let mut tx = s.db.begin().await?;

    // Only flips pending -> success once, so duplicate webhooks do nothing.
    let row: Option<(Uuid, i64)> = sqlx::query_as(
        "UPDATE payments SET status = 'success', paid_at = now()
         WHERE reference = $1 AND status = 'pending' AND amount = $2
         RETURNING plan_id, amount",
    )
    .bind(reference)
    .bind(amount)
    .fetch_optional(&mut *tx)
    .await?;

    let paid = row;
    match row {
        Some((plan_id, amt)) => {
            sqlx::query(
                "UPDATE plans SET
                    next_due_date = next_due_date + (SELECT frequency_days FROM channels c WHERE c.id = plans.channel_id),
                    status = CASE WHEN amount_paid + $1 >= locked_price THEN 'completed' ELSE status END,
                    amount_paid = amount_paid + $1
                 WHERE id = $2",
            )
            .bind(amt)
            .bind(plan_id)
            .execute(&mut *tx)
            .await?;
        }
        None => tracing::warn!("webhook: nothing to update for {reference} (already done or mismatch)"),
    }
    tx.commit().await?;
    if let Some((plan_id, amt)) = paid {
        if let Err(e) = send_receipt(s, plan_id, amt, reference).await {
            tracing::warn!("receipt email failed: {e:?}");
        }
    }
    Ok(())
}

/// Payment history: customers see theirs, sellers see payments into their channels.
async fn history(u: AuthUser, State(s): State<AppState>) -> AppResult<Json<Vec<PaymentRow>>> {
    let sql = match u.role.as_str() {
        "customer" => format!(
            "SELECT {PAY_COLS} FROM payments py JOIN plans p ON p.id = py.plan_id
             WHERE p.customer_id = $1 ORDER BY py.created_at DESC LIMIT 200"
        ),
        "seller" => format!(
            "SELECT {PAY_COLS} FROM payments py JOIN plans p ON p.id = py.plan_id
             JOIN channels c ON c.id = p.channel_id
             WHERE c.seller_id = $1 ORDER BY py.created_at DESC LIMIT 200"
        ),
        _ => return Err(AppError::Forbidden),
    };
    let rows: Vec<PaymentRow> = sqlx::query_as(&sql).bind(u.id).fetch_all(&s.db).await?;
    Ok(Json(rows))
}

/// The confirmation page calls this. It asks Paystack directly, so it works
/// on your phone (where Paystack can't reach the webhook) and online too.
async fn verify(u: AuthUser, State(s): State<AppState>, Path(reference): Path<String>) -> AppResult<Json<Value>> {
    let owner: Option<Uuid> = sqlx::query_scalar(
        "SELECT p.customer_id FROM payments py JOIN plans p ON p.id = py.plan_id WHERE py.reference = $1",
    )
    .bind(&reference)
    .fetch_one(&s.db)
    .await?;
    if owner != Some(u.id) {
        return Err(AppError::Forbidden);
    }

    let data = paystack::get(&s, &format!("/transaction/verify/{reference}"), &[]).await?;
    if data["status"] == "success" {
        let amount = data["amount"].as_i64().unwrap_or(0);
        record_success(&s, &reference, amount).await?;
    }

    let row: (String, i64, Uuid, String) = sqlx::query_as(
        "SELECT py.status, py.amount, py.plan_id, (COALESCE(pr.name, c.name) || COALESCE(' (' || NULLIF(concat_ws(', ', p.choice_color, p.choice_size), '') || ')', ''))
         FROM payments py
         JOIN plans p ON p.id = py.plan_id
         JOIN channels c ON c.id = p.channel_id
         LEFT JOIN products pr ON pr.id = p.product_id
         WHERE py.reference = $1",
    )
    .bind(&reference)
    .fetch_one(&s.db)
    .await?;

    Ok(Json(json!({
        "status": row.0,
        "amount": row.1,
        "plan_id": row.2,
        "product_name": row.3,
        "paystack_status": data["status"]
    })))
}

/// Emails the customer a receipt after a confirmed online payment. People without an account are skipped.
async fn send_receipt(s: &AppState, plan_id: Uuid, amount: i64, reference: &str) -> AppResult<()> {
    let r: Option<(String, String, String, String, i64, i64)> = sqlx::query_as(
        "SELECT u.email, u.full_name, (COALESCE(pr.name, c.name) || COALESCE(' (' || NULLIF(concat_ws(', ', p.choice_color, p.choice_size), '') || ')', '')), sl.business_name, p.amount_paid, p.locked_price
         FROM plans p
         JOIN users u ON u.id = p.customer_id
         JOIN channels c ON c.id = p.channel_id
         JOIN sellers sl ON sl.user_id = c.seller_id
         LEFT JOIN products pr ON pr.id = p.product_id
         WHERE p.id = $1",
    )
    .bind(plan_id)
    .fetch_optional(&s.db)
    .await?;
    let Some((to, name, item, seller, paid, total)) = r else { return Ok(()) };
    let first = email::esc(name.split_whitespace().next().unwrap_or("there"));
    let body = format!(
        "<p>Hi {first}, we received your payment. Thank you!</p><p><b>{}</b> for {}<br>Seller: {}<br>Paid so far: {} of {}<br>Reference: {}</p>",
        email::naira(amount),
        email::esc(&item),
        email::esc(&seller),
        email::naira(paid),
        email::naira(total),
        email::esc(reference)
    );
    let url = format!("{}/dashboard", s.config.frontend_url);
    let html = email::card("Payment received", &body, Some(("View your orders", &url)));
    email::send_html(s, &to, "Your Kobkart payment receipt", html).await
}
