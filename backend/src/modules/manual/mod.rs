use crate::{
    error::{AppError, AppResult},
    middleware::auth::AuthUser,
    state::AppState,
};
use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use chrono::{Duration, NaiveDate, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/claim/{token}", get(claim_info).post(claim))
        .route("/seller/guest-plans", post(add_guest_plan))
        .route("/rotation/{channel_id}/guests", post(add_guest_member))
        .route("/seller/payments/manual", post(record_payment))
        .route("/seller/payments/{id}/void", post(void_payment))
}

const METHODS: [&str; 3] = ["transfer", "cash", "other"];

fn guest(name: &str, phone: &str) -> AppResult<(String, String)> {
    let n = name.trim().to_string();
    if n.chars().count() < 2 || n.chars().count() > 80 {
        return Err(AppError::BadRequest("Enter the person's name".into()));
    }
    let digits = phone.chars().filter(|c| c.is_ascii_digit()).count();
    if digits > 0 && !(10..=13).contains(&digits) {
        return Err(AppError::BadRequest("Enter a valid phone number, or leave it empty".into()));
    }
    Ok((n, phone.trim().to_string()))
}

#[derive(Deserialize)]
struct GuestReq {
    name: String,
    phone: String,
}

#[derive(Deserialize)]
struct GuestPlanReq {
    product_id: Uuid,
    name: String,
    phone: String,
}

/// Save & Collect: the seller adds someone who has no account yet.
async fn add_guest_plan(u: AuthUser, State(s): State<AppState>, Json(b): Json<GuestPlanReq>) -> AppResult<Json<Value>> {
    u.require("seller")?;
    let (name, phone) = guest(&b.name, &b.phone)?;
    let (channel_id, price, contribution, freq, active, seller_id): (Uuid, i64, i64, i32, bool, Uuid) = sqlx::query_as(
        "SELECT p.channel_id, p.price, c.contribution_amount, c.frequency_days, p.active, c.seller_id
         FROM products p JOIN channels c ON c.id = p.channel_id WHERE p.id = $1",
    )
    .bind(b.product_id)
    .fetch_one(&s.db)
    .await?;
    if seller_id != u.id {
        return Err(AppError::Forbidden);
    }
    if !active {
        return Err(AppError::BadRequest("This product is no longer available".into()));
    }
    crate::modules::billing::ensure_capacity(&s, u.id, 1).await?;
    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO plans (channel_id, product_id, locked_price, installment_amount, next_due_date, guest_name, guest_phone)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
    )
    .bind(channel_id)
    .bind(b.product_id)
    .bind(price)
    .bind(contribution.min(price))
    .bind(Utc::now().date_naive() + Duration::days(freq as i64))
    .bind(name)
    .bind(phone)
    .fetch_one(&s.db)
    .await?;
    Ok(Json(json!({ "plan_id": id })))
}

/// Group Rotation: the seller adds a member without an account, before the group starts.
async fn add_guest_member(
    u: AuthUser,
    State(s): State<AppState>,
    Path(id): Path<Uuid>,
    Json(b): Json<GuestReq>,
) -> AppResult<Json<Value>> {
    u.require("seller")?;
    let (name, phone) = guest(&b.name, &b.phone)?;
    let mut tx = s.db.begin().await?;
    let row: Option<(Uuid, i64, i32, Option<i32>, Option<NaiveDate>, String, String)> = sqlx::query_as(
        "SELECT seller_id, contribution_amount, frequency_days, slots, start_date, rotation_status, kind
         FROM channels WHERE id = $1 FOR UPDATE",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?;
    let (seller_id, contribution, freq, slots, start, status, kind) = row.ok_or(AppError::NotFound)?;
    if seller_id != u.id {
        return Err(AppError::Forbidden);
    }
    if kind != "rotation" {
        return Err(AppError::NotFound);
    }
    if status != "open" {
        return Err(AppError::BadRequest("Members can only be added before the group starts.".into()));
    }
    crate::modules::billing::ensure_capacity(&s, u.id, 1).await?;
    let slots = slots.unwrap_or(0);
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM rotation_members WHERE channel_id = $1")
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;
    if count >= slots as i64 {
        return Err(AppError::BadRequest("This group is full.".into()));
    }
    let due = start.unwrap_or_else(|| Utc::now().date_naive() + Duration::days(freq as i64));
    let plan_id: Uuid = sqlx::query_scalar(
        "INSERT INTO plans (channel_id, locked_price, installment_amount, next_due_date, guest_name, guest_phone)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
    )
    .bind(id)
    .bind(contribution * slots as i64)
    .bind(contribution)
    .bind(due)
    .bind(name)
    .bind(phone)
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query("INSERT INTO rotation_members (channel_id, plan_id, position) VALUES ($1, $2, $3)")
        .bind(id)
        .bind(plan_id)
        .bind((count + 1) as i32)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(json!({ "ok": true, "position": count + 1 })))
}

#[derive(Deserialize)]
pub struct ManualReq {
    pub plan_id: Uuid,
    pub amount: i64, // kobo
    pub method: Option<String>,
    pub note: Option<String>,
}

/// The seller records a payment the member made outside the app (transfer or cash).
pub async fn record_payment(u: AuthUser, State(s): State<AppState>, Json(b): Json<ManualReq>) -> AppResult<Json<Value>> {
    u.require("seller")?;
    let method = b.method.as_deref().unwrap_or("transfer").trim().to_lowercase();
    if !METHODS.contains(&method.as_str()) {
        return Err(AppError::BadRequest("Method must be transfer, cash or other".into()));
    }
    let note = b.note.map(|n| n.trim().to_string()).filter(|n| !n.is_empty());
    if note.as_deref().map_or(false, |n| n.chars().count() > 200) {
        return Err(AppError::BadRequest("The note is too long".into()));
    }

    let mut tx = s.db.begin().await?;
    let row: Option<(i64, i64, i64, String, Uuid, String, String)> = sqlx::query_as(
        "SELECT p.locked_price, p.installment_amount, p.amount_paid, p.status, c.seller_id, c.kind, c.rotation_status
         FROM plans p JOIN channels c ON c.id = p.channel_id WHERE p.id = $1 FOR UPDATE OF p",
    )
    .bind(b.plan_id)
    .fetch_optional(&mut *tx)
    .await?;
    let (locked, installment, paid, status, seller_id, kind, rstatus) = row.ok_or(AppError::NotFound)?;
    if seller_id != u.id {
        return Err(AppError::Forbidden);
    }
    if status != "active" {
        return Err(AppError::BadRequest("This plan is not active".into()));
    }
    let remaining = locked - paid;
    let amount = if kind == "rotation" {
        if rstatus != "running" {
            return Err(AppError::BadRequest("Start the group before recording payments.".into()));
        }
        installment.min(remaining) // exactly one round
    } else {
        if b.amount < 10_000 {
            return Err(AppError::BadRequest("The smallest payment you can record is N100".into()));
        }
        if b.amount > remaining {
            return Err(AppError::BadRequest("That is more than the customer still owes".into()));
        }
        b.amount
    };
    if amount <= 0 {
        return Err(AppError::BadRequest("Nothing left to pay".into()));
    }

    sqlx::query(
        "INSERT INTO payments (plan_id, amount, platform_fee, reference, status, paid_at, method, note, recorded_by)
         VALUES ($1, $2, 0, $3, 'success', now(), $4, $5, $6)",
    )
    .bind(b.plan_id)
    .bind(amount)
    .bind(format!("MAN-{}", Uuid::new_v4().simple()))
    .bind(&method)
    .bind(note)
    .bind(u.id)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "UPDATE plans SET
            next_due_date = next_due_date + (SELECT frequency_days FROM channels c WHERE c.id = plans.channel_id),
            status = CASE WHEN amount_paid + $1 >= locked_price THEN 'completed' ELSE status END,
            amount_paid = amount_paid + $1
         WHERE id = $2",
    )
    .bind(amount)
    .bind(b.plan_id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(json!({ "ok": true })))
}

/// Undo a payment the seller recorded by mistake. Online payments cannot be voided here.
async fn void_payment(u: AuthUser, State(s): State<AppState>, Path(id): Path<Uuid>) -> AppResult<Json<Value>> {
    u.require("seller")?;
    let mut tx = s.db.begin().await?;
    let row: Option<(Uuid, i64, String, String, Uuid, String)> = sqlx::query_as(
        "SELECT py.plan_id, py.amount, py.status, py.method, c.seller_id, p.status
         FROM payments py
         JOIN plans p ON p.id = py.plan_id
         JOIN channels c ON c.id = p.channel_id
         WHERE py.id = $1 FOR UPDATE OF py",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?;
    let (plan_id, amount, status, method, seller_id, plan_status) = row.ok_or(AppError::NotFound)?;
    if seller_id != u.id {
        return Err(AppError::Forbidden);
    }
    if method == "online" {
        return Err(AppError::BadRequest("Online payments are confirmed by Paystack and cannot be voided here.".into()));
    }
    if status != "success" {
        return Err(AppError::BadRequest("This payment is already voided.".into()));
    }
    if plan_status == "delivered" {
        return Err(AppError::BadRequest("This order was already delivered.".into()));
    }
    sqlx::query("UPDATE payments SET status = 'failed', note = trim(COALESCE(note, '') || ' [voided by seller]') WHERE id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "UPDATE plans SET
            amount_paid = amount_paid - $1,
            status = CASE WHEN status = 'completed' THEN 'active' ELSE status END,
            next_due_date = next_due_date - (SELECT frequency_days FROM channels c WHERE c.id = plans.channel_id)
         WHERE id = $2",
    )
    .bind(amount)
    .bind(plan_id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(json!({ "ok": true })))
}
#[derive(sqlx::FromRow)]
struct ClaimRow {
    package: String,
    seller: String,
    kind: String,
    item: String,
    guest_name: Option<String>,
    claimable: bool,
}

/// Public: what a "link my account" link is for. Only the first name is shown.
async fn claim_info(State(s): State<AppState>, Path(token): Path<String>) -> AppResult<Json<Value>> {
    let r: ClaimRow = sqlx::query_as(
        "SELECT c.name AS package, sl.business_name AS seller, c.kind, COALESCE(pr.name, c.name) AS item,
                p.guest_name, (p.customer_id IS NULL) AS claimable
         FROM plans p
         JOIN channels c ON c.id = p.channel_id
         JOIN sellers sl ON sl.user_id = c.seller_id
         LEFT JOIN products pr ON pr.id = p.product_id
         WHERE p.claim_token = $1",
    )
    .bind(&token)
    .fetch_one(&s.db)
    .await?;
    let first = r
        .guest_name
        .as_deref()
        .and_then(|n| n.split_whitespace().next())
        .unwrap_or("there")
        .to_string();
    Ok(Json(json!({
        "package": r.package, "seller": r.seller, "kind": r.kind, "item": r.item,
        "first_name": first, "claimable": r.claimable
    })))
}

/// A customer attaches a seller-created record to their own account.
async fn claim(u: AuthUser, State(s): State<AppState>, Path(token): Path<String>) -> AppResult<Json<Value>> {
    u.require("customer")?;
    let mut tx = s.db.begin().await?;
    let row: Option<(Uuid, Uuid, Option<Uuid>, String)> = sqlx::query_as(
        "SELECT p.id, p.channel_id, p.customer_id, c.kind
         FROM plans p JOIN channels c ON c.id = p.channel_id
         WHERE p.claim_token = $1 FOR UPDATE OF p",
    )
    .bind(&token)
    .fetch_optional(&mut *tx)
    .await?;
    let (plan_id, channel_id, customer_id, kind) = row.ok_or(AppError::NotFound)?;
    if customer_id.is_some() {
        return Err(AppError::BadRequest("This link has already been used.".into()));
    }
    if kind == "rotation" {
        let already: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM rotation_members WHERE channel_id = $1 AND user_id = $2)",
        )
        .bind(channel_id)
        .bind(u.id)
        .fetch_one(&mut *tx)
        .await?;
        if already {
            return Err(AppError::BadRequest("You are already in this group with your account.".into()));
        }
        sqlx::query("UPDATE rotation_members SET user_id = $1 WHERE plan_id = $2")
            .bind(u.id)
            .bind(plan_id)
            .execute(&mut *tx)
            .await?;
    }
    sqlx::query("UPDATE plans SET customer_id = $1, claim_token = md5(gen_random_uuid()::text) WHERE id = $2")
        .bind(u.id)
        .bind(plan_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(json!({ "kind": kind, "plan_id": plan_id, "channel_id": channel_id })))
}
