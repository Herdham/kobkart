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
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::FromRow;
use uuid::Uuid;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/admin/overview", get(overview))
        .route("/admin/sellers", get(sellers))
        .route("/admin/sellers/{id}/verify", put(verify_seller))
        .route("/admin/payments", get(payments))
}

#[derive(Serialize, FromRow)]
struct AdminSeller {
    user_id: Uuid,
    business_name: String,
    verified: bool,
    full_name: String,
    email: String,
    phone: String,
    payout_ready: bool,
}

async fn overview(u: AuthUser, State(s): State<AppState>) -> AppResult<Json<Value>> {
    u.require("admin")?;
    let users: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users").fetch_one(&s.db).await?;
    let sellers: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sellers").fetch_one(&s.db).await?;
    let pending: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sellers WHERE NOT verified")
        .fetch_one(&s.db)
        .await?;
    let (volume, fees): (i64, i64) = sqlx::query_as(
        "SELECT COALESCE(SUM(amount), 0)::BIGINT, COALESCE(SUM(platform_fee), 0)::BIGINT
         FROM payments WHERE status = 'success'",
    )
    .fetch_one(&s.db)
    .await?;
    Ok(Json(json!({
        "users": users,
        "sellers": sellers,
        "pending_sellers": pending,
        "total_volume": volume,
        "platform_income": fees
    })))
}

async fn sellers(u: AuthUser, State(s): State<AppState>) -> AppResult<Json<Vec<AdminSeller>>> {
    u.require("admin")?;
    let rows: Vec<AdminSeller> = sqlx::query_as(
        "SELECT s.user_id, s.business_name, s.verified, us.full_name, us.email, us.phone,
                (s.paystack_subaccount_code IS NOT NULL) AS payout_ready
         FROM sellers s JOIN users us ON us.id = s.user_id
         ORDER BY s.verified, s.created_at DESC",
    )
    .fetch_all(&s.db)
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
struct VerifyReq {
    verified: bool,
}

async fn verify_seller(
    u: AuthUser,
    State(s): State<AppState>,
    Path(id): Path<Uuid>,
    Json(b): Json<VerifyReq>,
) -> AppResult<Json<Value>> {
    u.require("admin")?;
    let res = sqlx::query("UPDATE sellers SET verified = $1 WHERE user_id = $2")
        .bind(b.verified)
        .bind(id)
        .execute(&s.db)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(json!({ "ok": true })))
}

async fn payments(u: AuthUser, State(s): State<AppState>) -> AppResult<Json<Vec<PaymentRow>>> {
    u.require("admin")?;
    let rows: Vec<PaymentRow> = sqlx::query_as(&format!(
        "SELECT {PAY_COLS} FROM payments py ORDER BY py.created_at DESC LIMIT 200"
    ))
    .fetch_all(&s.db)
    .await?;
    Ok(Json(rows))
}
