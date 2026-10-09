use crate::{
    error::{AppError, AppResult},
    middleware::auth::AuthUser,
    state::AppState,
};
use axum::{
    extract::{Path, State},
    routing::{delete, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Serialize, FromRow)]
pub struct Product {
    pub id: Uuid,
    pub channel_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub price: i64,
    pub image_url: Option<String>,
    pub active: bool,
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/channels/{channel_id}/products", post(create))
        .route("/products/{id}", delete(remove))
}

async fn owns_channel(s: &AppState, u: &AuthUser, channel_id: Uuid) -> AppResult<()> {
    u.require("seller")?;
    let owner: Uuid = sqlx::query_scalar("SELECT seller_id FROM channels WHERE id = $1")
        .bind(channel_id)
        .fetch_one(&s.db)
        .await?;
    if owner != u.id {
        return Err(AppError::Forbidden);
    }
    Ok(())
}

#[derive(Deserialize)]
struct NewProduct {
    name: String,
    description: Option<String>,
    price: i64, // kobo
    image_url: Option<String>,
}

async fn create(
    u: AuthUser,
    State(s): State<AppState>,
    Path(channel_id): Path<Uuid>,
    Json(b): Json<NewProduct>,
) -> AppResult<Json<Product>> {
    owns_channel(&s, &u, channel_id).await?;
    if b.name.trim().is_empty() || b.price <= 0 {
        return Err(AppError::BadRequest("Product needs a name and a price".into()));
    }
    let p: Product = sqlx::query_as(
        "INSERT INTO products (channel_id, name, description, price, image_url)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, channel_id, name, description, price, image_url, active",
    )
    .bind(channel_id)
    .bind(b.name.trim())
    .bind(b.description)
    .bind(b.price)
    .bind(b.image_url)
    .fetch_one(&s.db)
    .await?;
    Ok(Json(p))
}

/// Soft delete: existing plans keep working, new plans can't start.
async fn remove(u: AuthUser, State(s): State<AppState>, Path(id): Path<Uuid>) -> AppResult<Json<Value>> {
    let channel_id: Uuid = sqlx::query_scalar("SELECT channel_id FROM products WHERE id = $1")
        .bind(id)
        .fetch_one(&s.db)
        .await?;
    owns_channel(&s, &u, channel_id).await?;
    sqlx::query("UPDATE products SET active = FALSE WHERE id = $1")
        .bind(id)
        .execute(&s.db)
        .await?;
    Ok(Json(json!({ "ok": true })))
}
