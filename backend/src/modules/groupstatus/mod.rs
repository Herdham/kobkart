use crate::{
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
use chrono::{NaiveDate, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::FromRow;
use uuid::Uuid;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/public/g/{code}", get(public_status))
        .route("/public/g/{code}/claim", post(public_claim))
        .route("/seller/groups/{id}/status", get(seller_status))
        .route("/seller/guest-claims", get(list_claims))
        .route("/seller/guest-claims/{id}/confirm", post(confirm))
        .route("/seller/guest-claims/{id}/reject", post(reject))
}

fn bad<T>(m: &str) -> AppResult<T> {
    Err(AppError::BadRequest(m.into()))
}

#[derive(FromRow)]
struct Mem {
    position: i32,
    name: Option<String>,
    plan_id: Uuid,
    paid: i64,
    pending: bool,
}

/// Everything the status page needs. Phone numbers are never included.
async fn build(s: &AppState, channel_id: Uuid) -> AppResult<Value> {
    let (seller_id, name, description, contribution, freq, status, code, seller_name): (
        Uuid,
        String,
        Option<String>,
        i64,
        i32,
        Option<String>,
        String,
        String,
    ) = sqlx::query_as(
        "SELECT c.seller_id, c.name, c.description, c.contribution_amount, c.frequency_days,
                c.rotation_status, c.invite_code, sl.business_name
         FROM channels c JOIN sellers sl ON sl.user_id = c.seller_id
         WHERE c.id = $1 AND c.kind = 'rotation'",
    )
    .bind(channel_id)
    .fetch_optional(&s.db)
    .await?
    .ok_or(AppError::NotFound)?;

    let rounds: Vec<(i32, NaiveDate, bool)> = sqlx::query_as(
        "SELECT round_no, due_date, collected FROM rotation_rounds WHERE channel_id = $1 ORDER BY round_no",
    )
    .bind(channel_id)
    .fetch_all(&s.db)
    .await?;

    let members: Vec<Mem> = sqlx::query_as(
        "SELECT m.position, COALESCE(p.guest_name, us.full_name) AS name, p.id AS plan_id,
                (p.amount_paid / GREATEST(p.installment_amount, 1))::bigint AS paid,
                EXISTS (SELECT 1 FROM guest_claims g WHERE g.plan_id = p.id AND g.status = 'pending') AS pending
         FROM rotation_members m
         JOIN plans p ON p.id = m.plan_id
         LEFT JOIN users us ON us.id = p.customer_id
         WHERE m.channel_id = $1 ORDER BY m.position",
    )
    .bind(channel_id)
    .fetch_all(&s.db)
    .await?;

    let n = members.len() as i64;
    let today = Utc::now().date_naive();
    let due = (rounds.iter().filter(|r| r.1 <= today).count() as i64).min(n);
    let current = rounds.iter().find(|r| !r.2);
    let next_collector = current
        .and_then(|r| members.iter().find(|m| m.position == r.0))
        .and_then(|m| m.name.clone());

    let members_json: Vec<Value> = members
        .iter()
        .map(|m| {
            json!({
                "position": m.position, "name": m.name, "plan_id": m.plan_id,
                "paid": m.paid, "pending": m.pending, "behind": m.paid < due
            })
        })
        .collect();
    let up_to_date = members.iter().filter(|m| m.paid >= due).count();

    // the seller's bank details; columns are read by name so this works with the existing payout columns
    let raw: Option<String> = sqlx::query_scalar("SELECT to_jsonb(sl)::text FROM sellers sl WHERE sl.user_id = $1")
        .bind(seller_id)
        .fetch_optional(&s.db)
        .await?;
    let obj: Value = raw.and_then(|t| serde_json::from_str(&t).ok()).unwrap_or(Value::Null);
    let text = |k: &str| obj.get(k).and_then(|v| v.as_str()).filter(|x| !x.is_empty()).map(String::from);
    let bank_name = obj.as_object().and_then(|o| {
        o.iter()
            .find(|(k, v)| k.starts_with("payout_") && k.contains("bank") && v.is_string())
            .and_then(|(_, v)| v.as_str().map(String::from))
    });

    Ok(json!({
        "invite_code": code,
        "name": name,
        "description": description,
        "seller": seller_name,
        "contribution": contribution,
        "frequency_days": freq,
        "status": status,
        "members_count": n,
        "pot": contribution * n,
        "current_round": current.map(|r| r.0),
        "next_date": current.map(|r| r.1.to_string()),
        "next_collector": next_collector,
        "rounds_due": due,
        "up_to_date": up_to_date,
        "members": members_json,
        "rounds": rounds.iter().map(|r| json!({"round": r.0, "date": r.1.to_string(), "collected": r.2})).collect::<Vec<_>>(),
        "bank": { "bank_name": bank_name, "account_name": text("payout_account_name"), "account_number": text("payout_account_number") }
    }))
}

async fn channel_by_code(s: &AppState, code: &str) -> AppResult<Uuid> {
    sqlx::query_scalar("SELECT id FROM channels WHERE invite_code = $1 AND kind = 'rotation'")
        .bind(code.trim().to_uppercase())
        .fetch_optional(&s.db)
        .await?
        .ok_or(AppError::NotFound)
}

async fn public_status(State(s): State<AppState>, Path(code): Path<String>) -> AppResult<Json<Value>> {
    let id = channel_by_code(&s, &code).await?;
    Ok(Json(build(&s, id).await?))
}

async fn seller_status(u: AuthUser, State(s): State<AppState>, Path(id): Path<Uuid>) -> AppResult<Json<Value>> {
    u.require("seller")?;
    let owner: Uuid = sqlx::query_scalar("SELECT seller_id FROM channels WHERE id = $1")
        .bind(id)
        .fetch_one(&s.db)
        .await?;
    if owner != u.id {
        return Err(AppError::Forbidden);
    }
    Ok(Json(build(&s, id).await?))
}

#[derive(Deserialize)]
struct ClaimReq {
    plan_id: Uuid,
    rounds: Option<i64>,
}

/// A member says "I have paid". Nothing changes until the seller confirms.
async fn public_claim(State(s): State<AppState>, Path(code): Path<String>, Json(b): Json<ClaimReq>) -> AppResult<Json<Value>> {
    let channel_id = channel_by_code(&s, &code).await?;
    let (seller_id, status): (Uuid, Option<String>) =
        sqlx::query_as("SELECT seller_id, rotation_status FROM channels WHERE id = $1")
            .bind(channel_id)
            .fetch_one(&s.db)
            .await?;
    if status.as_deref() != Some("running") {
        return bad("This group is not running right now.");
    }
    let (inst, locked, paid): (i64, i64, i64) = sqlx::query_as(
        "SELECT p.installment_amount, p.locked_price, p.amount_paid
         FROM plans p JOIN rotation_members m ON m.plan_id = p.id
         WHERE p.id = $1 AND m.channel_id = $2 AND p.status = 'active'",
    )
    .bind(b.plan_id)
    .bind(channel_id)
    .fetch_optional(&s.db)
    .await?
    .ok_or_else(|| AppError::BadRequest("We could not find that member".into()))?;
    let remaining = locked - paid;
    if remaining <= 0 {
        return bad("This member has already paid everything.");
    }
    let waiting: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM guest_claims WHERE channel_id = $1 AND status = 'pending'")
        .bind(channel_id)
        .fetch_one(&s.db)
        .await?;
    if waiting >= 60 {
        return bad("Too many payments are waiting for the organizer. Please try again later.");
    }
    let amount = (inst * b.rounds.unwrap_or(1).clamp(1, 20)).min(remaining);
    let id: Option<Uuid> = sqlx::query_scalar(
        "INSERT INTO guest_claims (plan_id, channel_id, seller_id, amount) VALUES ($1, $2, $3, $4)
         ON CONFLICT (plan_id) WHERE status = 'pending' DO NOTHING RETURNING id",
    )
    .bind(b.plan_id)
    .bind(channel_id)
    .bind(seller_id)
    .bind(amount)
    .fetch_optional(&s.db)
    .await?;
    if id.is_none() {
        return bad("Your payment is already waiting for the organizer to confirm.");
    }
    Ok(Json(json!({ "ok": true, "amount": amount })))
}

#[derive(FromRow, serde::Serialize)]
struct ClaimRow {
    id: Uuid,
    amount: i64,
    name: Option<String>,
    group_name: String,
    sent: String,
}

async fn list_claims(u: AuthUser, State(s): State<AppState>) -> AppResult<Json<Vec<ClaimRow>>> {
    u.require("seller")?;
    let rows: Vec<ClaimRow> = sqlx::query_as(
        "SELECT g.id, g.amount, COALESCE(p.guest_name, us.full_name) AS name, c.name AS group_name,
                to_char(g.created_at, 'DD Mon HH24:MI') AS sent
         FROM guest_claims g
         JOIN plans p ON p.id = g.plan_id
         JOIN channels c ON c.id = g.channel_id
         LEFT JOIN users us ON us.id = p.customer_id
         WHERE g.seller_id = $1 AND g.status = 'pending' ORDER BY g.created_at",
    )
    .bind(u.id)
    .fetch_all(&s.db)
    .await?;
    Ok(Json(rows))
}

async fn confirm(u: AuthUser, State(s): State<AppState>, Path(id): Path<Uuid>) -> AppResult<Json<Value>> {
    u.require("seller")?;
    let row: Option<(Uuid, i64)> = sqlx::query_as(
        "UPDATE guest_claims SET status = 'confirmed', decided_at = now()
         WHERE id = $1 AND seller_id = $2 AND status = 'pending' RETURNING plan_id, amount",
    )
    .bind(id)
    .bind(u.id)
    .fetch_optional(&s.db)
    .await?;
    let (plan_id, amount) = row.ok_or_else(|| AppError::BadRequest("This one was already handled".into()))?;
    let res = record_payment(
        u,
        State(s.clone()),
        Json(ManualReq {
            plan_id,
            amount,
            method: Some("transfer".into()),
            note: Some("Confirmed from the group status page".into()),
        }),
    )
    .await;
    match res {
        Ok(_) => Ok(Json(json!({ "ok": true }))),
        Err(e) => {
            sqlx::query("UPDATE guest_claims SET status = 'pending', decided_at = NULL WHERE id = $1")
                .bind(id)
                .execute(&s.db)
                .await?;
            Err(e)
        }
    }
}

async fn reject(u: AuthUser, State(s): State<AppState>, Path(id): Path<Uuid>) -> AppResult<Json<Value>> {
    u.require("seller")?;
    let n = sqlx::query(
        "UPDATE guest_claims SET status = 'rejected', decided_at = now()
         WHERE id = $1 AND seller_id = $2 AND status = 'pending'",
    )
    .bind(id)
    .bind(u.id)
    .execute(&s.db)
    .await?
    .rows_affected();
    if n == 0 {
        return bad("This one was already handled");
    }
    Ok(Json(json!({ "ok": true })))
}
