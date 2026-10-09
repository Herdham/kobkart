use crate::{
    error::{AppError, AppResult},
    middleware::auth::AuthUser,
    modules::{products::Product, sellers::require_verified},
    state::AppState,
};
use axum::{
    extract::{Path, Query, State},
    http::header::{CACHE_CONTROL, CONTENT_TYPE},
    response::{IntoResponse, Response},
    routing::{get, put},
    Json, Router,
};
use base64::Engine as _;
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::FromRow;
use uuid::Uuid;

const COLS: &str = "id, seller_id, name, description, contribution_amount, frequency_days, invite_code, image_url, category, is_public, kind, slots, start_date, rotation_status, created_at";
const CATEGORIES: [&str; 8] = ["fashion", "shoes_bags", "kitchen", "electronics", "beauty", "food", "kids", "other"];

#[derive(Serialize, FromRow)]
pub struct Channel {
    pub id: Uuid,
    pub seller_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub contribution_amount: i64,
    pub frequency_days: i32,
    pub invite_code: String,
    pub image_url: Option<String>,
    pub category: String,
    pub is_public: bool,
    pub kind: String,
    pub slots: Option<i32>,
    pub start_date: Option<NaiveDate>,
    pub rotation_status: String,
    pub created_at: DateTime<Utc>,
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/seller/channels", get(my_channels).post(create_channel))
        .route("/seller/channels/{id}", put(update_channel))
        .route("/channels/code/{code}", get(by_code))
        .route("/channels/{id}", get(by_id))
        .route("/channels/{id}/image", get(channel_image))
        .route("/browse", get(browse))
}

fn check_category(c: &str) -> AppResult<()> {
    if CATEGORIES.contains(&c) {
        Ok(())
    } else {
        Err(AppError::BadRequest("Please choose a valid category".into()))
    }
}

#[derive(Deserialize)]
struct NewChannel {
    name: String,
    description: Option<String>,
    contribution_amount: i64, // kobo
    frequency_days: i32,
    image_url: Option<String>,
    category: Option<String>,
    is_public: Option<bool>,
    kind: Option<String>,
    slots: Option<i32>,
}

async fn create_channel(u: AuthUser, State(s): State<AppState>, Json(b): Json<NewChannel>) -> AppResult<Json<Channel>> {
    require_verified(&s, &u).await?;
    if b.name.trim().is_empty() {
        return Err(AppError::BadRequest("Package name is required".into()));
    }
    if b.contribution_amount < 10_000 {
        return Err(AppError::BadRequest("Minimum contribution is N100".into()));
    }
    if !(1..=90).contains(&b.frequency_days) {
        return Err(AppError::BadRequest("Frequency must be between 1 and 90 days".into()));
    }
    if b.image_url.as_deref().map_or(false, |i| i.len() > 700_000) {
        return Err(AppError::BadRequest("That photo is too large. Try a smaller one.".into()));
    }
    let category = b.category.as_deref().unwrap_or("other").to_string();
    check_category(&category)?;

    let kind = b.kind.as_deref().unwrap_or("save").to_string();
    if kind != "save" && kind != "rotation" {
        return Err(AppError::BadRequest("Invalid package type".into()));
    }
    let slots = if kind == "rotation" {
        let n = b.slots.unwrap_or(0);
        if !(2..=100).contains(&n) {
            return Err(AppError::BadRequest("Group size must be between 2 and 100".into()));
        }
        Some(n)
    } else {
        None
    };

    let code = Uuid::new_v4().simple().to_string()[..8].to_uppercase();
    let ch: Channel = sqlx::query_as(&format!(
        "INSERT INTO channels (seller_id, name, description, contribution_amount, frequency_days, invite_code,
                               image_url, category, is_public, kind, slots)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING {COLS}"
    ))
    .bind(u.id)
    .bind(b.name.trim())
    .bind(b.description)
    .bind(b.contribution_amount)
    .bind(b.frequency_days)
    .bind(code)
    .bind(b.image_url)
    .bind(category)
    .bind(b.is_public.unwrap_or(false))
    .bind(kind)
    .bind(slots)
    .fetch_one(&s.db)
    .await?;
    Ok(Json(ch))
}

#[derive(Deserialize)]
struct UpdateChannel {
    is_public: Option<bool>,
    category: Option<String>,
}

/// Seller switches public listing on/off or changes the category.
async fn update_channel(
    u: AuthUser,
    State(s): State<AppState>,
    Path(id): Path<Uuid>,
    Json(b): Json<UpdateChannel>,
) -> AppResult<Json<Value>> {
    u.require("seller")?;
    if let Some(c) = &b.category {
        check_category(c)?;
    }
    let res = sqlx::query(
        "UPDATE channels SET is_public = COALESCE($1, is_public), category = COALESCE($2, category)
         WHERE id = $3 AND seller_id = $4",
    )
    .bind(b.is_public)
    .bind(b.category)
    .bind(id)
    .bind(u.id)
    .execute(&s.db)
    .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(json!({ "ok": true })))
}

async fn my_channels(u: AuthUser, State(s): State<AppState>) -> AppResult<Json<Vec<Channel>>> {
    u.require("seller")?;
    let rows: Vec<Channel> = sqlx::query_as(&format!(
        "SELECT {COLS} FROM channels WHERE seller_id = $1 ORDER BY created_at DESC"
    ))
    .bind(u.id)
    .fetch_all(&s.db)
    .await?;
    Ok(Json(rows))
}

async fn with_products(s: &AppState, ch: Channel) -> AppResult<Json<Value>> {
    let products: Vec<Product> = sqlx::query_as(
        "SELECT id, channel_id, name, description, price, image_url, active
         FROM products WHERE channel_id = $1 AND active ORDER BY price",
    )
    .bind(ch.id)
    .fetch_all(&s.db)
    .await?;
    let (seller, verified): (String, bool) =
        sqlx::query_as("SELECT business_name, verified FROM sellers WHERE user_id = $1")
            .bind(ch.seller_id)
            .fetch_one(&s.db)
            .await?;
    let rotation = if ch.kind == "rotation" {
        let filled: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM rotation_members WHERE channel_id = $1")
            .bind(ch.id)
            .fetch_one(&s.db)
            .await?;
        Some(json!({
            "slots": ch.slots,
            "filled": filled,
            "status": ch.rotation_status,
            "start_date": ch.start_date,
            "pot": ch.contribution_amount * ch.slots.unwrap_or(0) as i64
        }))
    } else {
        None
    };
    Ok(Json(json!({
        "channel": ch,
        "seller": seller,
        "seller_verified": verified,
        "products": products,
        "rotation": rotation
    })))
}

async fn by_id(State(s): State<AppState>, Path(id): Path<Uuid>) -> AppResult<Json<Value>> {
    let ch: Channel = sqlx::query_as(&format!("SELECT {COLS} FROM channels WHERE id = $1"))
        .bind(id)
        .fetch_one(&s.db)
        .await?;
    with_products(&s, ch).await
}

async fn by_code(State(s): State<AppState>, Path(code): Path<String>) -> AppResult<Json<Value>> {
    let ch: Channel = sqlx::query_as(&format!("SELECT {COLS} FROM channels WHERE invite_code = $1"))
        .bind(code.trim().to_uppercase())
        .fetch_one(&s.db)
        .await?;
    with_products(&s, ch).await
}

/// Serves a package cover as a normal image file so phones can cache it.
async fn channel_image(State(s): State<AppState>, Path(id): Path<Uuid>) -> AppResult<Response> {
    let url: Option<String> = sqlx::query_scalar("SELECT image_url FROM channels WHERE id = $1")
        .bind(id)
        .fetch_one(&s.db)
        .await?;
    let url = url.ok_or(AppError::NotFound)?;
    let (head, data) = url.split_once(',').ok_or(AppError::NotFound)?;
    let mime = head
        .strip_prefix("data:")
        .and_then(|h| h.split(';').next())
        .unwrap_or("image/jpeg")
        .to_string();
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|_| AppError::NotFound)?;
    Ok(([(CONTENT_TYPE, mime), (CACHE_CONTROL, "public, max-age=3600".to_string())], bytes).into_response())
}

/* ---------------- public browse ---------------- */

#[derive(Deserialize)]
struct BrowseQ {
    q: Option<String>,
    category: Option<String>,
    max: Option<i64>, // kobo
    limit: Option<i64>,
}

#[derive(Serialize, FromRow)]
struct BrowseItem {
    id: Uuid,
    name: String,
    description: Option<String>,
    category: String,
    invite_code: String,
    contribution_amount: i64,
    frequency_days: i32,
    has_image: bool,
    seller_name: String,
    participants: i64,
    product_count: i64,
    min_price: Option<i64>,
    kind: String,
    slots: Option<i32>,
    filled: i64,
}

/// Public list: approved sellers only, only packages the seller chose to list.
/// Item packages need a product. Groups must still have free places.
async fn browse(State(s): State<AppState>, Query(q): Query<BrowseQ>) -> AppResult<Json<Vec<BrowseItem>>> {
    let pattern = q
        .q
        .as_deref()
        .map(|t| t.trim().replace(['%', '_', '\\'], ""))
        .filter(|t| !t.is_empty())
        .map(|t| format!("%{t}%"));
    let category = q.category.filter(|c| CATEGORIES.contains(&c.as_str()));
    let limit = q.limit.unwrap_or(24).clamp(1, 48);

    let rows: Vec<BrowseItem> = sqlx::query_as(
        "SELECT c.id, c.name, c.description, c.category, c.invite_code, c.contribution_amount, c.frequency_days,
                (c.image_url IS NOT NULL) AS has_image,
                s.business_name AS seller_name,
                (SELECT COUNT(*) FROM plans p WHERE p.channel_id = c.id) AS participants,
                (SELECT COUNT(*) FROM products x WHERE x.channel_id = c.id AND x.active) AS product_count,
                (SELECT MIN(price) FROM products x WHERE x.channel_id = c.id AND x.active) AS min_price,
                c.kind, c.slots,
                (SELECT COUNT(*) FROM rotation_members rm WHERE rm.channel_id = c.id) AS filled
         FROM channels c
         JOIN sellers s ON s.user_id = c.seller_id
         WHERE c.is_public AND s.verified
           AND (
                (c.kind = 'save' AND EXISTS (SELECT 1 FROM products x WHERE x.channel_id = c.id AND x.active))
             OR (c.kind = 'rotation' AND c.rotation_status = 'open'
                 AND (SELECT COUNT(*) FROM rotation_members rm WHERE rm.channel_id = c.id) < COALESCE(c.slots, 0))
           )
           AND ($1::text IS NULL OR c.category = $1)
           AND ($2::text IS NULL OR c.name ILIKE $2 OR c.description ILIKE $2 OR s.business_name ILIKE $2
                OR EXISTS (SELECT 1 FROM products x WHERE x.channel_id = c.id AND x.active AND x.name ILIKE $2))
           AND ($3::bigint IS NULL OR c.contribution_amount <= $3)
         ORDER BY participants DESC, c.created_at DESC
         LIMIT $4",
    )
    .bind(category)
    .bind(pattern)
    .bind(q.max)
    .bind(limit)
    .fetch_all(&s.db)
    .await?;
    Ok(Json(rows))
}