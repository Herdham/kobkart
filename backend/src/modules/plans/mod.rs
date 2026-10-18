use crate::{
    error::{AppError, AppResult},
    middleware::auth::AuthUser,
    modules::payments::{PaymentRow, PAY_COLS},
    state::AppState,
};
use axum::{
    extract::{Path, State},
    routing::{get, put},
    Json, Router,
};
use chrono::{DateTime, NaiveDate, Utc};
use serde::Serialize;
use serde_json::{json, Value};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Serialize, FromRow)]
pub struct PlanView {
    id: Uuid,
    channel_id: Uuid,
    channel_name: String,
    seller_name: String,
    product_id: Option<Uuid>,
    product_name: String,
    image_url: Option<String>,
    locked_price: i64,
    installment_amount: i64,
    frequency_days: i32,
    amount_paid: i64,
    remaining: i64,
    payments_made: i64,
    payments_total: i64,
    next_due_date: NaiveDate,
    status: String,
    kind: String,
    created_at: DateTime<Utc>,
}

const PLAN_SELECT: &str = "SELECT p.id, p.channel_id, c.name AS channel_name, sl.business_name AS seller_name,
    p.product_id,
    (COALESCE(pr.name, c.name) || COALESCE(' (' || NULLIF(concat_ws(', ', p.choice_color, p.choice_size, CASE WHEN p.quantity > 1 THEN 'Qty ' || p.quantity END, 'Note: ' || p.choice_note), '') || ')', '')) AS product_name,
    COALESCE(pr.image_url, c.image_url) AS image_url,
    p.locked_price, p.installment_amount, c.frequency_days, p.amount_paid,
    (p.locked_price - p.amount_paid) AS remaining,
    (SELECT COUNT(*) FROM payments py WHERE py.plan_id = p.id AND py.status = 'success') AS payments_made,
    CEIL(p.locked_price::numeric / p.installment_amount)::BIGINT AS payments_total,
    p.next_due_date, p.status, c.kind, p.created_at
    FROM plans p
    JOIN channels c ON c.id = p.channel_id
    JOIN sellers sl ON sl.user_id = c.seller_id
    LEFT JOIN products pr ON pr.id = p.product_id";

#[derive(Serialize, FromRow)]
struct SellerPlanView {
    id: Uuid,
    channel_id: Uuid,
    channel_name: String,
    customer_name: String,
    customer_phone: String,
    product_name: String,
    locked_price: i64,
    installment_amount: i64,
    amount_paid: i64,
    next_due_date: NaiveDate,
    status: String,
    kind: String,
    late: bool,
    is_guest: bool,
    claim_token: Option<String>,
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/plans", get(my_plans))
        .route("/plans/{id}", get(plan_detail))
        .route("/plans/{id}/delivered", put(mark_delivered))
        .route("/seller/plans", get(seller_plans))
}



async fn my_plans(u: AuthUser, State(s): State<AppState>) -> AppResult<Json<Vec<PlanView>>> {
    u.require("customer")?;
    let sql = format!("{PLAN_SELECT} WHERE p.customer_id = $1 ORDER BY p.created_at DESC");
    let rows: Vec<PlanView> = sqlx::query_as(&sql).bind(u.id).fetch_all(&s.db).await?;
    Ok(Json(rows))
}

async fn plan_detail(u: AuthUser, State(s): State<AppState>, Path(id): Path<Uuid>) -> AppResult<Json<Value>> {
    let (customer_id, seller_id): (Option<Uuid>, Uuid) = sqlx::query_as(
        "SELECT p.customer_id, c.seller_id FROM plans p JOIN channels c ON c.id = p.channel_id WHERE p.id = $1",
    )
    .bind(id)
    .fetch_one(&s.db)
    .await?;
    if Some(u.id) != customer_id && u.id != seller_id && u.role != "admin" {
        return Err(AppError::Forbidden);
    }
    let plan: PlanView = sqlx::query_as(&format!("{PLAN_SELECT} WHERE p.id = $1"))
        .bind(id)
        .fetch_one(&s.db)
        .await?;
    let payments: Vec<PaymentRow> = sqlx::query_as(&format!(
        "SELECT {PAY_COLS} FROM payments py WHERE py.plan_id = $1 ORDER BY py.created_at DESC"
    ))
    .bind(id)
    .fetch_all(&s.db)
    .await?;
    Ok(Json(json!({ "plan": plan, "payments": payments })))
}

async fn mark_delivered(u: AuthUser, State(s): State<AppState>, Path(id): Path<Uuid>) -> AppResult<Json<Value>> {
    u.require("seller")?;
    let res = sqlx::query(
        "UPDATE plans SET status = 'delivered'
         WHERE id = $1 AND status = 'completed' AND product_id IS NOT NULL
           AND channel_id IN (SELECT id FROM channels WHERE seller_id = $2)",
    )
    .bind(id)
    .bind(u.id)
    .execute(&s.db)
    .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::BadRequest("Plan not found, not yours, or not fully paid yet".into()));
    }
    Ok(Json(json!({ "ok": true })))
}

/// Every contributor across the seller's packages, with late flag.
async fn seller_plans(u: AuthUser, State(s): State<AppState>) -> AppResult<Json<Vec<SellerPlanView>>> {
    u.require("seller")?;
    let rows: Vec<SellerPlanView> = sqlx::query_as(
        "SELECT p.id, p.channel_id, c.name AS channel_name,
                COALESCE(us.full_name, p.guest_name) AS customer_name, COALESCE(us.phone, p.guest_phone) AS customer_phone, (p.customer_id IS NULL) AS is_guest, (CASE WHEN p.customer_id IS NULL THEN p.claim_token END) AS claim_token,
                ((COALESCE(pr.name, c.name) || COALESCE(' (' || NULLIF(concat_ws(', ', p.choice_color, p.choice_size, CASE WHEN p.quantity > 1 THEN 'Qty ' || p.quantity END, 'Note: ' || p.choice_note), '') || ')', '')) || COALESCE(' (' || NULLIF(concat_ws(', ', p.choice_color, p.choice_size, CASE WHEN p.quantity > 1 THEN 'Qty ' || p.quantity END, 'Note: ' || p.choice_note), '') || ')', '')) AS product_name,
                p.locked_price, p.installment_amount, p.amount_paid, p.next_due_date, p.status, c.kind,
                (p.status = 'active' AND p.next_due_date < CURRENT_DATE) AS late
         FROM plans p
         JOIN channels c ON c.id = p.channel_id
         LEFT JOIN users us ON us.id = p.customer_id
         LEFT JOIN products pr ON pr.id = p.product_id
         WHERE c.seller_id = $1
         ORDER BY late DESC, p.next_due_date",
    )
    .bind(u.id)
    .fetch_all(&s.db)
    .await?;
    Ok(Json(rows))
}
