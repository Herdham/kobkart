use crate::{error::AppResult, middleware::auth::AuthUser, state::AppState};
use axum::{extract::State, routing::get, Json, Router};
use chrono::{DateTime, NaiveDate, Utc};
use serde::Serialize;
use serde_json::{json, Value};
use sqlx::FromRow;
use uuid::Uuid;

pub fn routes() -> Router<AppState> {
    Router::new().route("/orders", get(orders))
}

#[derive(Serialize, FromRow)]
struct ItemOrder {
    plan_id: Uuid,
    product_name: String,
    image_url: Option<String>,
    channel_name: String,
    seller_name: String,
    seller_contact: Option<String>,
    locked_price: i64,
    amount_paid: i64,
    payments_made: i64,
    payments_total: i64,
    status: String,
    joined_at: DateTime<Utc>,
    paid_at: Option<DateTime<Utc>>,
}

#[derive(Serialize, FromRow)]
struct GroupOrder {
    channel_id: Uuid,
    channel_name: String,
    seller_name: String,
    seller_contact: Option<String>,
    contribution_amount: i64,
    group_status: String,
    position: i32,
    turn_date: Option<NaiveDate>,
    collected: bool,
    member_count: i64,
    paid_count: i64,
}

/// Everything a customer is waiting for: items they are paying for and group turns.
async fn orders(u: AuthUser, State(s): State<AppState>) -> AppResult<Json<Value>> {
    u.require("customer")?;
    let items: Vec<ItemOrder> = sqlx::query_as(
        "SELECT p.id AS plan_id, pr.name AS product_name, pr.image_url, c.name AS channel_name,
                sl.business_name AS seller_name, COALESCE(su.whatsapp, su.phone) AS seller_contact,
                p.locked_price, p.amount_paid,
                (SELECT COUNT(*) FROM payments py WHERE py.plan_id = p.id AND py.status = 'success') AS payments_made,
                CEIL(p.locked_price::numeric / p.installment_amount)::BIGINT AS payments_total,
                p.status, p.created_at AS joined_at,
                (SELECT MAX(py.paid_at) FROM payments py WHERE py.plan_id = p.id AND py.status = 'success') AS paid_at
         FROM plans p
         JOIN products pr ON pr.id = p.product_id
         JOIN channels c ON c.id = p.channel_id
         JOIN sellers sl ON sl.user_id = c.seller_id
         JOIN users su ON su.id = c.seller_id
         WHERE p.customer_id = $1 AND c.kind = 'save'
         ORDER BY p.created_at DESC",
    )
    .bind(u.id)
    .fetch_all(&s.db)
    .await?;

    let groups: Vec<GroupOrder> = sqlx::query_as(
        "SELECT c.id AS channel_id, c.name AS channel_name, sl.business_name AS seller_name,
                COALESCE(su.whatsapp, su.phone) AS seller_contact,
                c.contribution_amount, c.rotation_status AS group_status, m.position,
                r.due_date AS turn_date, COALESCE(r.collected, FALSE) AS collected,
                (SELECT COUNT(*) FROM rotation_members x WHERE x.channel_id = c.id) AS member_count,
                (SELECT COUNT(*) FROM payments py WHERE py.plan_id = m.plan_id AND py.status = 'success') AS paid_count
         FROM rotation_members m
         JOIN channels c ON c.id = m.channel_id
         JOIN sellers sl ON sl.user_id = c.seller_id
         JOIN users su ON su.id = c.seller_id
         LEFT JOIN rotation_rounds r ON r.channel_id = m.channel_id AND r.round_no = m.position
         WHERE m.user_id = $1
         ORDER BY m.joined_at DESC",
    )
    .bind(u.id)
    .fetch_all(&s.db)
    .await?;

    Ok(Json(json!({ "items": items, "groups": groups })))
}