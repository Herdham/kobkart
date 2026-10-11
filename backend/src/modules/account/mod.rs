use crate::{
    error::{AppError, AppResult},
    middleware::auth::AuthUser,
    modules::auth::{hash_password_async, verify_password},
    state::AppState,
};
use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::FromRow;
use uuid::Uuid;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/account", get(get_account).put(update_account))
        .route("/account/password", post(change_password))
}

#[derive(Serialize, FromRow)]
struct Account {
    id: Uuid,
    full_name: String,
    email: String,
    phone: String,
    role: String,
    referral_code: Option<String>,
    whatsapp: Option<String>,
    location: Option<String>,
    bio: Option<String>,
    instagram: Option<String>,
    facebook: Option<String>,
    x_handle: Option<String>,
    website: Option<String>,
}

async fn get_account(u: AuthUser, State(s): State<AppState>) -> AppResult<Json<Value>> {
    let a: Account = sqlx::query_as(
        "SELECT id, full_name, email, phone, role, referral_code, whatsapp, location, bio,
                instagram, facebook, x_handle, website FROM users WHERE id = $1",
    )
    .bind(u.id)
    .fetch_one(&s.db)
    .await?;
    let seller: Option<(String, bool)> = if a.role == "seller" {
        sqlx::query_as("SELECT business_name, verified FROM sellers WHERE user_id = $1")
            .bind(u.id)
            .fetch_optional(&s.db)
            .await?
    } else {
        None
    };
    Ok(Json(json!({
        "account": a,
        "seller": seller.map(|(n, v)| json!({ "business_name": n, "verified": v }))
    })))
}

#[derive(Deserialize)]
struct UpdateAccount {
    full_name: String,
    phone: String,
    whatsapp: Option<String>,
    location: Option<String>,
    bio: Option<String>,
    instagram: Option<String>,
    facebook: Option<String>,
    x_handle: Option<String>,
    website: Option<String>,
}

fn clean(v: Option<String>, max: usize) -> AppResult<Option<String>> {
    let t = v.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    if let Some(s) = &t {
        if s.chars().count() > max {
            return Err(AppError::BadRequest("One of the fields is too long".into()));
        }
    }
    Ok(t)
}

/// A handle (@name) or a full link. Other schemes like javascript: are refused.
fn link(v: Option<String>) -> AppResult<Option<String>> {
    let t = clean(v, 200)?;
    if let Some(s) = &t {
        let l = s.to_lowercase();
        if s.contains(char::is_whitespace) || (l.contains(':') && !(l.starts_with("http://") || l.starts_with("https://"))) {
            return Err(AppError::BadRequest(
                "Enter a handle like @yourname, or a full link starting with https://".into(),
            ));
        }
    }
    Ok(t)
}

async fn update_account(u: AuthUser, State(s): State<AppState>, Json(b): Json<UpdateAccount>) -> AppResult<Json<Value>> {
    let name = b.full_name.trim().to_string();
    if name.chars().count() < 2 || name.chars().count() > 80 {
        return Err(AppError::BadRequest("Enter your full name".into()));
    }
    let digits = b.phone.chars().filter(|c| c.is_ascii_digit()).count();
    if !(10..=13).contains(&digits) {
        return Err(AppError::BadRequest("Enter a valid phone number".into()));
    }
    sqlx::query(
        "UPDATE users SET full_name = $1, phone = $2, whatsapp = $3, location = $4, bio = $5,
                instagram = $6, facebook = $7, x_handle = $8, website = $9
         WHERE id = $10",
    )
    .bind(name)
    .bind(b.phone.trim())
    .bind(clean(b.whatsapp, 30)?)
    .bind(clean(b.location, 100)?)
    .bind(clean(b.bio, 400)?)
    .bind(link(b.instagram)?)
    .bind(link(b.facebook)?)
    .bind(link(b.x_handle)?)
    .bind(link(b.website)?)
    .bind(u.id)
    .execute(&s.db)
    .await?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
struct PasswordReq {
    current_password: String,
    new_password: String,
}

async fn change_password(u: AuthUser, State(s): State<AppState>, Json(b): Json<PasswordReq>) -> AppResult<Json<Value>> {
    if b.new_password.len() < 8 {
        return Err(AppError::BadRequest("New password must be at least 8 characters".into()));
    }
    let hash: String = sqlx::query_scalar("SELECT password_hash FROM users WHERE id = $1")
        .bind(u.id)
        .fetch_one(&s.db)
        .await?;
    let current = b.current_password.clone();
    let ok = tokio::task::spawn_blocking(move || verify_password(&current, &hash))
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    if !ok {
        return Err(AppError::BadRequest("Your current password is not correct".into()));
    }
    let new_hash = hash_password_async(b.new_password).await?;
    sqlx::query("UPDATE users SET password_hash = $1 WHERE id = $2")
        .bind(new_hash)
        .bind(u.id)
        .execute(&s.db)
        .await?;
    Ok(Json(json!({ "ok": true })))
}