use crate::{error::AppResult, middleware::auth::AuthUser, state::AppState};
use axum::{extract::State, routing::get, Json, Router};
use serde_json::{json, Value};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/dashboard/customer", get(customer))
        .route("/dashboard/seller", get(seller))
}

async fn customer(u: AuthUser, State(s): State<AppState>) -> AppResult<Json<Value>> {
    u.require("customer")?;
    let (total_paid, active, done, remaining): (i64, i64, i64, i64) = sqlx::query_as(
        "SELECT COALESCE(SUM(amount_paid), 0)::BIGINT,
                COUNT(*) FILTER (WHERE status = 'active'),
                COUNT(*) FILTER (WHERE status IN ('completed', 'delivered')),
                COALESCE(SUM(locked_price - amount_paid) FILTER (WHERE status = 'active'), 0)::BIGINT
         FROM plans WHERE customer_id = $1",
    )
    .bind(u.id)
    .fetch_one(&s.db)
    .await?;
    Ok(Json(json!({
        "total_paid": total_paid,
        "active_plans": active,
        "completed_plans": done,
        "total_remaining": remaining
    })))
}

async fn seller(u: AuthUser, State(s): State<AppState>) -> AppResult<Json<Value>> {
    u.require("seller")?;
    let (collected, fees): (i64, i64) = sqlx::query_as(
        "SELECT COALESCE(SUM(py.amount), 0)::BIGINT, COALESCE(SUM(py.platform_fee), 0)::BIGINT
         FROM payments py JOIN plans p ON p.id = py.plan_id JOIN channels c ON c.id = p.channel_id
         WHERE c.seller_id = $1 AND py.status = 'success'",
    )
    .bind(u.id)
    .fetch_one(&s.db)
    .await?;
    let (members, active, late, ready): (i64, i64, i64, i64) = sqlx::query_as(
        "SELECT COUNT(*),
                COUNT(*) FILTER (WHERE p.status = 'active'),
                COUNT(*) FILTER (WHERE p.status = 'active' AND p.next_due_date < CURRENT_DATE),
                COUNT(*) FILTER (WHERE p.status = 'completed' AND p.product_id IS NOT NULL)
         FROM plans p JOIN channels c ON c.id = p.channel_id WHERE c.seller_id = $1",
    )
    .bind(u.id)
    .fetch_one(&s.db)
    .await?;
    Ok(Json(json!({
        "total_collected": collected,
        "platform_fees": fees,
        "net_to_seller": collected - fees,
        "total_members": members,
        "active_plans": active,
        "late_plans": late,
        "ready_for_delivery": ready
    })))
}
