use crate::{
    error::{AppError, AppResult},
    middleware::auth::AuthUser,
    state::AppState,
};
use axum::{
    extract::{DefaultBodyLimit, Path, State},
    http::header::{CACHE_CONTROL, CONTENT_TYPE},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use base64::Engine as _;
use chrono::{Duration, Utc};
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
        .route(
            "/products/{id}",
            get(detail).put(update).delete(remove).layer(DefaultBodyLimit::max(4 * 1024 * 1024)),
        )
        .route("/product-images/{id}", get(image))
        .route("/catalog/join", post(join_item))
}

fn bad<T>(m: &str) -> AppResult<T> {
    Err(AppError::BadRequest(m.into()))
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

/* ---------------- create / remove ---------------- */

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
        return bad("Product needs a name and a price");
    }
    if b.image_url.as_deref().map_or(false, |i| i.len() > 700_000) {
        return bad("That photo is too large. Try a smaller one.");
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
    .bind(b.image_url.clone())
    .fetch_one(&s.db)
    .await?;
    if let Some(img) = b.image_url.as_deref() {
        sqlx::query("INSERT INTO product_images (product_id, data, position) VALUES ($1, $2, 0)")
            .bind(p.id)
            .bind(img)
            .execute(&s.db)
            .await?;
    }
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

/* ---------------- public product page ---------------- */

async fn detail(State(s): State<AppState>, Path(id): Path<Uuid>) -> AppResult<Json<Value>> {
    let p: (Uuid, Uuid, String, Option<String>, Option<String>, i64) = sqlx::query_as(
        "SELECT id, channel_id, name, description, brand, price FROM products WHERE id = $1 AND active",
    )
    .bind(id)
    .fetch_one(&s.db)
    .await?;
    let c: (Uuid, String, String, i64, i32, String, Uuid, bool, String, bool, Option<i64>, bool) = sqlx::query_as(
        "SELECT c.id, c.name, c.kind, c.contribution_amount, c.frequency_days, c.invite_code, c.seller_id,
                c.archived_at IS NOT NULL, sl.business_name, sl.verified, c.basket_budget, sl.official
         FROM channels c JOIN sellers sl ON sl.user_id = c.seller_id WHERE c.id = $1",
    )
    .bind(p.1)
    .fetch_one(&s.db)
    .await?;
    let opts: Vec<(String, String, bool)> = sqlx::query_as(
        "SELECT kind, label, sold_out FROM product_options WHERE product_id = $1 ORDER BY position, label",
    )
    .bind(id)
    .fetch_all(&s.db)
    .await?;
    let images: Vec<(Uuid, Option<String>)> = sqlx::query_as(
        "SELECT id, color FROM product_images WHERE product_id = $1 ORDER BY position, created_at",
    )
    .bind(id)
    .fetch_all(&s.db)
    .await?;
    let list = |k: &str| -> Vec<Value> {
        opts.iter()
            .filter(|o| o.0 == k)
            .map(|o| json!({ "label": o.1, "sold_out": o.2 }))
            .collect()
    };
    let payments = (p.5 + c.3 - 1) / c.3.max(1);
    Ok(Json(json!({
        "product": { "id": p.0, "name": p.2, "description": p.3, "brand": p.4, "price": p.5 },
        "colors": list("color"),
        "sizes": list("size"),
        "images": images.iter().map(|i| json!({ "id": i.0, "color": i.1 })).collect::<Vec<_>>(),
        "package": {
            "id": c.0, "name": c.1, "kind": c.2, "contribution_amount": c.3, "frequency_days": c.4,
            "invite_code": c.5, "seller_id": c.6, "closed": c.7, "seller": c.8, "seller_verified": c.9, "budget": c.10, "seller_official": c.11
        },
        "payments": payments,
        "days": payments * c.4 as i64
    })))
}

/// A photo as a real image file, so phones can cache it.
async fn image(State(s): State<AppState>, Path(id): Path<Uuid>) -> AppResult<Response> {
    let data: String = sqlx::query_scalar("SELECT data FROM product_images WHERE id = $1")
        .bind(id)
        .fetch_one(&s.db)
        .await?;
    let (head, b64) = data.split_once(',').ok_or(AppError::NotFound)?;
    let mime = head
        .strip_prefix("data:")
        .and_then(|h| h.split(';').next())
        .unwrap_or("image/jpeg")
        .to_string();
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|_| AppError::NotFound)?;
    Ok(([(CONTENT_TYPE, mime), (CACHE_CONTROL, "public, max-age=86400".to_string())], bytes).into_response())
}

/* ---------------- seller edit ---------------- */

#[derive(Deserialize)]
struct OptionIn {
    label: String,
    sold_out: Option<bool>,
}

#[derive(Deserialize)]
struct ImageIn {
    id: Option<Uuid>,
    data: Option<String>,
    color: Option<String>,
}

#[derive(Deserialize)]
struct UpdateProduct {
    name: String,
    brand: Option<String>,
    description: Option<String>,
    price: i64, // kobo
    colors: Vec<OptionIn>,
    sizes: Vec<OptionIn>,
    images: Vec<ImageIn>,
}

fn clean(v: Option<String>, max: usize) -> AppResult<Option<String>> {
    let t = v.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    if t.as_ref().map_or(false, |s| s.chars().count() > max) {
        return bad("One of the fields is too long");
    }
    Ok(t)
}

fn labels(v: Vec<OptionIn>, max: usize) -> AppResult<Vec<(String, bool)>> {
    if v.len() > max {
        return bad("Too many colours or sizes");
    }
    let mut out: Vec<(String, bool)> = Vec::new();
    for o in v {
        let l = o.label.trim().to_string();
        if l.is_empty() {
            continue;
        }
        if l.chars().count() > 30 {
            return bad("Colour and size names must be short");
        }
        if out.iter().any(|x| x.0.to_lowercase() == l.to_lowercase()) {
            continue;
        }
        out.push((l, o.sold_out.unwrap_or(false)));
    }
    Ok(out)
}

async fn update(u: AuthUser, State(s): State<AppState>, Path(id): Path<Uuid>, Json(b): Json<UpdateProduct>) -> AppResult<Json<Value>> {
    let channel_id: Uuid = sqlx::query_scalar("SELECT channel_id FROM products WHERE id = $1 AND active")
        .bind(id)
        .fetch_one(&s.db)
        .await?;
    owns_channel(&s, &u, channel_id).await?;

    let name = b.name.trim().to_string();
    if !(2..=80).contains(&name.chars().count()) {
        return bad("Enter the product name");
    }
    if b.price < 10_000 {
        return bad("The smallest price is N100");
    }
    let brand = clean(b.brand, 60)?;
    let description = clean(b.description, 600)?;
    let colors = labels(b.colors, 12)?;
    let sizes = labels(b.sizes, 15)?;
    if b.images.len() > 6 {
        return bad("You can add up to 6 photos");
    }

    let mut tx = s.db.begin().await?;
    sqlx::query("UPDATE products SET name = $1, brand = $2, description = $3, price = $4 WHERE id = $5")
        .bind(name)
        .bind(brand)
        .bind(description)
        .bind(b.price)
        .bind(id)
        .execute(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM product_options WHERE product_id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    for (kind, list) in [("color", &colors), ("size", &sizes)] {
        for (i, (label, sold_out)) in list.iter().enumerate() {
            sqlx::query("INSERT INTO product_options (product_id, kind, label, sold_out, position) VALUES ($1, $2, $3, $4, $5)")
                .bind(id)
                .bind(kind)
                .bind(label)
                .bind(*sold_out)
                .bind(i as i32)
                .execute(&mut *tx)
                .await?;
        }
    }

    let keep: Vec<Uuid> = b.images.iter().filter_map(|i| i.id).collect();
    sqlx::query("DELETE FROM product_images WHERE product_id = $1 AND NOT (id = ANY($2))")
        .bind(id)
        .bind(keep)
        .execute(&mut *tx)
        .await?;
    for (pos, img) in b.images.iter().enumerate() {
        let color: Option<String> = img
            .color
            .as_deref()
            .map(str::trim)
            .filter(|c| !c.is_empty())
            .and_then(|c| colors.iter().find(|x| x.0.to_lowercase() == c.to_lowercase()).map(|x| x.0.clone()));
        match (&img.id, &img.data) {
            (Some(iid), _) => {
                let r = sqlx::query("UPDATE product_images SET color = $1, position = $2 WHERE id = $3 AND product_id = $4")
                    .bind(&color)
                    .bind(pos as i32)
                    .bind(*iid)
                    .bind(id)
                    .execute(&mut *tx)
                    .await?;
                if r.rows_affected() == 0 {
                    return bad("A photo could not be found. Refresh the page and try again.");
                }
            }
            (None, Some(data)) => {
                if !data.starts_with("data:image/") || data.len() > 450_000 {
                    return bad("One of the photos is not valid or is too large");
                }
                sqlx::query("INSERT INTO product_images (product_id, data, color, position) VALUES ($1, $2, $3, $4)")
                    .bind(id)
                    .bind(data)
                    .bind(&color)
                    .bind(pos as i32)
                    .execute(&mut *tx)
                    .await?;
            }
            _ => {}
        }
    }
    if !b.images.is_empty() {
        sqlx::query(
            "UPDATE products SET image_url =
               (SELECT data FROM product_images WHERE product_id = $1 ORDER BY position, created_at LIMIT 1)
             WHERE id = $1",
        )
        .bind(id)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(Json(json!({ "ok": true })))
}

/* ---------------- customer joins an item with a colour and size ---------------- */

#[derive(Deserialize)]
struct JoinReq {
    product_id: Uuid,
    color: Option<String>,
    size: Option<String>,
    quantity: Option<i32>,
    note: Option<String>,
}

pub fn pick(opts: &[(String, String, bool)], kind: &str, chosen: Option<&str>) -> AppResult<Option<String>> {
    let mine: Vec<&(String, String, bool)> = opts.iter().filter(|o| o.0 == kind).collect();
    if mine.is_empty() {
        return Ok(None);
    }
    let want = chosen.map(|c| c.trim().to_lowercase()).filter(|c| !c.is_empty());
    let Some(want) = want else {
        return bad(if kind == "color" { "Please choose a colour" } else { "Please choose a size" });
    };
    match mine.iter().find(|o| o.1.to_lowercase() == want) {
        Some(o) if !o.2 => Ok(Some(o.1.clone())),
        Some(_) => bad("That option is sold out"),
        None => {
            let raw = chosen.unwrap_or("").trim();
            if raw.chars().count() > 30 {
                bad("Size and colour names must be short")
            } else {
                Ok(Some(raw.to_string()))
            }
        }
    }
}

async fn join_item(u: AuthUser, State(s): State<AppState>, Json(b): Json<JoinReq>) -> AppResult<Json<Value>> {
    u.require("customer")?;
    if crate::modules::rotation::has_defaulted(&s, u.id).await? {
        return bad("You have overdue payments in a group. Please catch up before joining a new package.");
    }
    let (channel_id, price, contribution, freq, active, closed): (Uuid, i64, i64, i32, bool, bool) = sqlx::query_as(
        "SELECT p.channel_id, p.price, c.contribution_amount, c.frequency_days, p.active, c.archived_at IS NOT NULL
         FROM products p JOIN channels c ON c.id = p.channel_id
         WHERE p.id = $1 AND c.kind = 'save'",
    )
    .bind(b.product_id)
    .fetch_one(&s.db)
    .await?;
    if !active {
        return bad("This product is no longer available");
    }
    if closed {
        return bad("This package is closed and not taking new customers.");
    }
    crate::modules::billing::ensure_capacity_channel(&s, channel_id, 1).await?;
    let opts: Vec<(String, String, bool)> =
        sqlx::query_as("SELECT kind, label, sold_out FROM product_options WHERE product_id = $1")
            .bind(b.product_id)
            .fetch_all(&s.db)
            .await?;
    let color = pick(&opts, "color", b.color.as_deref())?;
    let size = pick(&opts, "size", b.size.as_deref())?;

    let is_basket: bool = sqlx::query_scalar("SELECT basket_budget IS NOT NULL FROM channels WHERE id = $1")
        .bind(channel_id)
        .fetch_one(&s.db)
        .await?;
    if is_basket {
        return bad("This package uses a basket. Please add items to your basket instead.");
    }
    let already: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM plans WHERE customer_id = $1 AND product_id = $2
                       AND status IN ('active', 'completed')
                       AND choice_color IS NOT DISTINCT FROM $3 AND choice_size IS NOT DISTINCT FROM $4)",
    )
    .bind(u.id)
    .bind(b.product_id)
    .bind(&color)
    .bind(&size)
    .fetch_one(&s.db)
    .await?;
    if already {
        return bad("You already joined this item with the same choices. Check My Orders.");
    }

    let qty = b.quantity.unwrap_or(1);
    if !(1..=50).contains(&qty) {
        return bad("Quantity must be between 1 and 50");
    }
    let note = clean(b.note, 120)?;
    let price = price * qty as i64;
    let installment = contribution.min(price);
    let next_due = Utc::now().date_naive() + Duration::days(freq as i64);
    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO plans (customer_id, channel_id, product_id, locked_price, installment_amount, next_due_date, choice_color, choice_size, quantity, choice_note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id",
    )
    .bind(u.id)
    .bind(channel_id)
    .bind(b.product_id)
    .bind(price)
    .bind(installment)
    .bind(next_due)
    .bind(&color)
    .bind(&size)
    .bind(qty)
    .bind(&note)
    .fetch_one(&s.db)
    .await?;
    Ok(Json(json!({ "plan_id": id })))
}