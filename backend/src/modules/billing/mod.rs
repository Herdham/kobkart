use crate::{
    error::{AppError, AppResult},
    middleware::auth::AuthUser,
    paystack,
    state::AppState,
};
use axum::{
    extract::{Path, State},
    routing::{get, post, put},
    Json, Router,
};
use chrono::NaiveDate;
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/billing", get(overview))
        .route("/billing/checkout", post(checkout))
        .route("/billing/verify/{reference}", get(verify))
        .route("/admin/sellers/{id}/plan", put(admin_set_plan))
}

/// (key, label, monthly price in kobo, active-member limit). Change prices and limits here.
pub const PLANS: [(&str, &str, i64, i64); 3] = [
    ("free", "Free", 0, 15),
    ("standard", "Standard", 300_000, 40),
    ("plus", "Plus", 600_000, 100),
];

pub fn limit_of(plan: &str) -> i64 {
    PLANS.iter().find(|p| p.0 == plan).map(|p| p.3).unwrap_or(15)
}

/// The amount to charge so Kobkart still receives the full price after Paystack's fee
/// (1.5% plus N100 from N2,500 upward), rounded up to a whole naira.
pub fn gross_up(price: i64) -> i64 {
    if price <= 0 {
        return 0;
    }
    let flat = if price >= 250_000 { 10_000 } else { 0 };
    let kobo = ((price + flat) * 1000 + 984) / 985;
    (kobo + 99) / 100 * 100
}

// A plan that is past its end date (plus 3 days of grace) falls back to Free.
const EFFECTIVE: &str =
    "CASE WHEN s.plan <> 'free' AND s.plan_expires_at IS NOT NULL AND s.plan_expires_at + 3 >= CURRENT_DATE THEN s.plan ELSE 'free' END";

async fn status(s: &AppState, seller_id: Uuid) -> AppResult<(String, i64, i64)> {
    let plan: String = sqlx::query_scalar(&format!("SELECT {EFFECTIVE} FROM sellers s WHERE s.user_id = $1"))
        .bind(seller_id)
        .fetch_one(&s.db)
        .await?;
    let used: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM plans p JOIN channels c ON c.id = p.channel_id WHERE c.seller_id = $1 AND p.status = 'active'",
    )
    .bind(seller_id)
    .fetch_one(&s.db)
    .await?;
    let limit = limit_of(&plan);
    Ok((plan, limit, used))
}

/// When the SELLER adds people (import, add without account, approve).
pub async fn ensure_capacity(s: &AppState, seller_id: Uuid, adding: i64) -> AppResult<()> {
    let (plan, limit, used) = status(s, seller_id).await?;
    if adding > 0 && used + adding > limit {
        return Err(AppError::BadRequest(format!(
            "Your {plan} plan allows {limit} active members and you have {used}. Upgrade in Plan & billing to add more people."
        )));
    }
    Ok(())
}

/// When a CUSTOMER joins: they get a friendly message, not billing details.
pub async fn ensure_capacity_channel(s: &AppState, channel_id: Uuid, adding: i64) -> AppResult<()> {
    let seller_id: Uuid = sqlx::query_scalar("SELECT seller_id FROM channels WHERE id = $1")
        .bind(channel_id)
        .fetch_one(&s.db)
        .await?;
    let (_, limit, used) = status(s, seller_id).await?;
    if adding > 0 && used + adding > limit {
        return Err(AppError::BadRequest(
            "This seller is not taking new members right now. Please contact them directly.".into(),
        ));
    }
    Ok(())
}

async fn overview(u: AuthUser, State(s): State<AppState>) -> AppResult<Json<Value>> {
    u.require("seller")?;
    let (stored, expires): (String, Option<NaiveDate>) =
        sqlx::query_as("SELECT plan, plan_expires_at FROM sellers WHERE user_id = $1")
            .bind(u.id)
            .fetch_one(&s.db)
            .await?;
    let (plan, limit, used) = status(&s, u.id).await?;
    let plans: Vec<Value> = PLANS
        .iter()
        .map(|(k, l, price, lim)| json!({ "key": k, "label": l, "price": price, "charge": gross_up(*price), "limit": lim }))
        .collect();
    Ok(Json(json!({
        "plan": plan,
        "stored_plan": stored,
        "expires_at": expires,
        "limit": limit,
        "used": used,
        "plans": plans,
        "online": s.config.online_payments,
        "transfer": if s.config.pay_account_number.is_empty() {
            Value::Null
        } else {
            json!({
                "bank": s.config.pay_bank,
                "account_number": s.config.pay_account_number,
                "account_name": s.config.pay_account_name,
                "whatsapp": s.config.support_whatsapp
            })
        }
    })))
}

#[derive(Deserialize)]
struct CheckoutReq {
    plan: String,
}

async fn checkout(u: AuthUser, State(s): State<AppState>, Json(b): Json<CheckoutReq>) -> AppResult<Json<Value>> {
    u.require("seller")?;
    if !s.config.online_payments {
        return Err(AppError::BadRequest(
            "Online payment is not open yet. Pay by bank transfer, message Kobkart support, and your plan will be activated.".into(),
        ));
    }
    let (_, _, price, _) = *PLANS
        .iter()
        .find(|p| p.0 == b.plan && p.2 > 0)
        .ok_or_else(|| AppError::BadRequest("Choose the Standard or Plus plan".into()))?;
    let charge = gross_up(price);
    let email: String = sqlx::query_scalar("SELECT email FROM users WHERE id = $1")
        .bind(u.id)
        .fetch_one(&s.db)
        .await?;
    let reference = format!("SUB-{}", Uuid::new_v4().simple());
    sqlx::query(
        "INSERT INTO plan_payments (seller_id, plan, amount, charged, method, reference) VALUES ($1, $2, $3, $4, 'online', $5)",
    )
    .bind(u.id)
    .bind(&b.plan)
    .bind(price)
    .bind(charge)
    .bind(&reference)
    .execute(&s.db)
    .await?;
    let data = paystack::post(
        &s,
        "/transaction/initialize",
        json!({
            "email": email,
            "amount": charge,
            "reference": reference,
            "callback_url": format!("{}/billing/callback", s.config.frontend_url),
            "metadata": { "plan": b.plan, "seller_id": u.id }
        }),
    )
    .await?;
    Ok(Json(json!({ "authorization_url": data["authorization_url"], "reference": reference })))
}

/// Sets the plan and adds the months. Renewing the same plan extends it; a new plan starts today.
async fn apply_plan(conn: &mut sqlx::PgConnection, seller_id: Uuid, plan: &str, months: i32) -> AppResult<()> {
    sqlx::query(
        "UPDATE sellers SET
           plan_expires_at = (CASE WHEN plan = $1 THEN GREATEST(COALESCE(plan_expires_at, CURRENT_DATE), CURRENT_DATE)
                                   ELSE CURRENT_DATE END + make_interval(months => $2::int))::date,
           plan = $1
         WHERE user_id = $3",
    )
    .bind(plan)
    .bind(months)
    .bind(seller_id)
    .execute(conn)
    .await?;
    Ok(())
}

/// Called by the Paystack webhook and by verify. Safe to run twice.
pub async fn record_sub_success(s: &AppState, reference: &str, charged: i64) -> AppResult<()> {
    let mut tx = s.db.begin().await?;
    let row: Option<(Uuid, String, i32)> = sqlx::query_as(
        "UPDATE plan_payments SET status = 'success', paid_at = now()
         WHERE reference = $1 AND status = 'pending' AND charged = $2
         RETURNING seller_id, plan, months",
    )
    .bind(reference)
    .bind(charged)
    .fetch_optional(&mut *tx)
    .await?;
    if let Some((seller_id, plan, months)) = row {
        apply_plan(&mut *tx, seller_id, &plan, months).await?;
    }
    tx.commit().await?;
    Ok(())
}

async fn verify(u: AuthUser, State(s): State<AppState>, Path(reference): Path<String>) -> AppResult<Json<Value>> {
    u.require("seller")?;
    let owner: Uuid = sqlx::query_scalar("SELECT seller_id FROM plan_payments WHERE reference = $1")
        .bind(&reference)
        .fetch_one(&s.db)
        .await?;
    if owner != u.id {
        return Err(AppError::Forbidden);
    }
    let data = paystack::get(&s, &format!("/transaction/verify/{reference}"), &[]).await?;
    if data["status"] == "success" {
        record_sub_success(&s, &reference, data["amount"].as_i64().unwrap_or(0)).await?;
    }
    let (status, plan): (String, String) = sqlx::query_as("SELECT status, plan FROM plan_payments WHERE reference = $1")
        .bind(&reference)
        .fetch_one(&s.db)
        .await?;
    Ok(Json(json!({ "status": status, "plan": plan, "paystack_status": data["status"] })))
}

#[derive(Deserialize)]
struct SetPlan {
    plan: String,
    months: Option<i32>,
    paid: Option<bool>,
    note: Option<String>,
}

/// Admin: activate a plan after a bank transfer, or comp a seller (paid = false).
async fn admin_set_plan(u: AuthUser, State(s): State<AppState>, Path(id): Path<Uuid>, Json(b): Json<SetPlan>) -> AppResult<Json<Value>> {
    u.require("admin")?;
    let price = PLANS
        .iter()
        .find(|p| p.0 == b.plan)
        .map(|p| p.2)
        .ok_or_else(|| AppError::BadRequest("Unknown plan".into()))?;
    let months = b.months.unwrap_or(1).clamp(1, 12);
    let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM sellers WHERE user_id = $1)")
        .bind(id)
        .fetch_one(&s.db)
        .await?;
    if !exists {
        return Err(AppError::NotFound);
    }
    let mut tx = s.db.begin().await?;
    if b.plan == "free" {
        sqlx::query("UPDATE sellers SET plan = 'free', plan_expires_at = NULL WHERE user_id = $1")
            .bind(id)
            .execute(&mut *tx)
            .await?;
    } else {
        apply_plan(&mut *tx, id, &b.plan, months).await?;
        let amount = if b.paid.unwrap_or(true) { price * months as i64 } else { 0 };
        sqlx::query(
            "INSERT INTO plan_payments (seller_id, plan, months, amount, charged, method, reference, status, note, paid_at)
             VALUES ($1, $2, $3, $4, $4, 'transfer', 'ADM-' || md5(random()::text || $1::text), 'success', $5, now())",
        )
        .bind(id)
        .bind(&b.plan)
        .bind(months)
        .bind(amount)
        .bind(b.note.as_deref().map(str::trim).filter(|n| !n.is_empty()))
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(Json(json!({ "ok": true })))
}