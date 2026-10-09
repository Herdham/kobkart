use crate::{
    email as mailer,
    error::{AppError, AppResult},
    middleware::auth::{create_token, AuthUser},
    state::AppState,
};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::FromRow;
use uuid::Uuid;

const CODE_TTL_MINUTES: i32 = 15;
const MAX_ATTEMPTS: i32 = 5;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/register", post(register))
        .route("/login", post(login))
        .route("/me", get(me))
        .route("/send-code", post(send_code))
        .route("/verify-code", post(verify_code))
        .route("/reset-password", post(reset_password))
}

#[derive(Serialize, FromRow)]
struct UserOut {
    id: Uuid,
    full_name: String,
    email: String,
    phone: String,
    role: String,
    referral_code: Option<String>,
}

/* ---------------- helpers ---------------- */

fn hash_password(pw: &str) -> Result<String, AppError> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(pw.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| AppError::Internal(e.to_string()))
}

fn verify_password(pw: &str, hash: &str) -> bool {
    PasswordHash::new(hash)
        .map(|p| Argon2::default().verify_password(pw.as_bytes(), &p).is_ok())
        .unwrap_or(false)
}

async fn hash_password_async(pw: String) -> AppResult<String> {
    tokio::task::spawn_blocking(move || hash_password(&pw))
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
}

fn hash_code(secret: &str, email: &str, purpose: &str, code: &str) -> String {
    let mut h = Sha256::new();
    h.update(format!("{secret}:{email}:{purpose}:{code}"));
    hex::encode(h.finalize())
}

fn new_code() -> String {
    format!("{:06}", Uuid::new_v4().as_u128() % 1_000_000)
}

fn new_referral_code() -> String {
    Uuid::new_v4().simple().to_string()[..8].to_uppercase()
}

fn check_purpose(p: &str) -> AppResult<()> {
    if p == "verify" || p == "reset" {
        Ok(())
    } else {
        Err(AppError::BadRequest("Invalid request".into()))
    }
}

/// Creates a new 6-digit code (old ones stop working) and emails it.
async fn issue_code(s: &AppState, email: &str, name: &str, purpose: &str) -> AppResult<()> {
    let (recent, last_hour): (i64, i64) = sqlx::query_as(
        "SELECT COUNT(*) FILTER (WHERE created_at > now() - interval '30 seconds'), COUNT(*)
         FROM email_codes
         WHERE email = $1 AND purpose = $2 AND created_at > now() - interval '1 hour'",
    )
    .bind(email)
    .bind(purpose)
    .fetch_one(&s.db)
    .await?;
    if recent > 0 {
        return Err(AppError::BadRequest("Please wait 30 seconds before asking for another code".into()));
    }
    if last_hour >= 5 {
        return Err(AppError::BadRequest("Too many code requests. Please try again in an hour.".into()));
    }

    let code = new_code();
    sqlx::query("UPDATE email_codes SET used = TRUE WHERE email = $1 AND purpose = $2 AND NOT used")
        .bind(email)
        .bind(purpose)
        .execute(&s.db)
        .await?;
    sqlx::query(
        "INSERT INTO email_codes (email, purpose, code_hash, expires_at)
         VALUES ($1, $2, $3, now() + make_interval(mins => $4::int))",
    )
    .bind(email)
    .bind(purpose)
    .bind(hash_code(&s.config.jwt_secret, email, purpose, &code))
    .bind(CODE_TTL_MINUTES)
    .execute(&s.db)
    .await?;

    mailer::send_code(s, email, name, &code, purpose).await
}

/// Checks the latest code. Wrong guesses are counted; after 5 the code is dead.
async fn check_code(s: &AppState, email: &str, purpose: &str, code: &str) -> AppResult<Uuid> {
    let row: Option<(Uuid, String, i32)> = sqlx::query_as(
        "SELECT id, code_hash, attempts FROM email_codes
         WHERE email = $1 AND purpose = $2 AND NOT used AND expires_at > now()
         ORDER BY created_at DESC LIMIT 1",
    )
    .bind(email)
    .bind(purpose)
    .fetch_optional(&s.db)
    .await?;

    let (id, stored, attempts) =
        row.ok_or_else(|| AppError::BadRequest("This code has expired. Please request a new one.".into()))?;
    if attempts >= MAX_ATTEMPTS {
        return Err(AppError::BadRequest("Too many wrong attempts. Please request a new code.".into()));
    }
    if stored != hash_code(&s.config.jwt_secret, email, purpose, code) {
        sqlx::query("UPDATE email_codes SET attempts = attempts + 1 WHERE id = $1")
            .bind(id)
            .execute(&s.db)
            .await?;
        return Err(AppError::BadRequest("That code is not correct. Please try again.".into()));
    }
    Ok(id)
}

/* ---------------- register ---------------- */

#[derive(Deserialize)]
struct RegisterReq {
    full_name: String,
    email: String,
    phone: String,
    password: String,
    role: String, // "customer" or "seller"
    business_name: Option<String>,
    referral_code: Option<String>,
}

async fn register(State(s): State<AppState>, Json(r): Json<RegisterReq>) -> AppResult<Json<Value>> {
    if r.password.len() < 8 {
        return Err(AppError::BadRequest("Password must be at least 8 characters".into()));
    }
    if r.role != "customer" && r.role != "seller" {
        return Err(AppError::BadRequest("Role must be customer or seller".into()));
    }
    if r.full_name.trim().is_empty() || r.phone.trim().is_empty() || !r.email.contains('@') {
        return Err(AppError::BadRequest("Name, phone and a valid email are required".into()));
    }
    let email = r.email.trim().to_lowercase();

    // Optional referral code
    let referrer: Option<Uuid> = match r.referral_code.as_deref().map(str::trim).filter(|c| !c.is_empty()) {
        Some(code) => Some(
            sqlx::query_scalar::<_, Uuid>("SELECT id FROM users WHERE referral_code = $1")
                .bind(code.to_uppercase())
                .fetch_optional(&s.db)
                .await?
                .ok_or_else(|| AppError::BadRequest("Referral code not found".into()))?,
        ),
        None => None,
    };

    let hash = hash_password_async(r.password.clone()).await?;

    let mut tx = s.db.begin().await?;
    let user: UserOut = sqlx::query_as(
        "INSERT INTO users (full_name, email, phone, password_hash, role, referral_code, referred_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, full_name, email, phone, role, referral_code",
    )
    .bind(r.full_name.trim())
    .bind(&email)
    .bind(r.phone.trim())
    .bind(hash)
    .bind(&r.role)
    .bind(new_referral_code())
    .bind(referrer)
    .fetch_one(&mut *tx)
    .await?;

    if user.role == "seller" {
        let biz = r
            .business_name
            .as_deref()
            .map(str::trim)
            .filter(|b| !b.is_empty())
            .map(String::from)
            .unwrap_or_else(|| user.full_name.clone());
        sqlx::query("INSERT INTO sellers (user_id, business_name) VALUES ($1, $2)")
            .bind(user.id)
            .bind(biz)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;

    // If the email fails, the account still exists and the user can tap "Resend code".
    if let Err(e) = issue_code(&s, &email, &user.full_name, "verify").await {
        tracing::error!("could not send verification code to {email}: {e:?}");
    }

    Ok(Json(json!({ "email": email, "message": "Account created. Check your email for the 6-digit code." })))
}

/* ---------------- login ---------------- */

#[derive(Deserialize)]
struct LoginReq {
    identifier: String, // email or phone
    password: String,
}

#[derive(FromRow)]
struct LoginRow {
    id: Uuid,
    full_name: String,
    email: String,
    phone: String,
    role: String,
    referral_code: Option<String>,
    password_hash: String,
    email_verified: bool,
}

async fn login(State(s): State<AppState>, Json(r): Json<LoginReq>) -> AppResult<Json<Value>> {
    let ident = r.identifier.trim().to_lowercase();
    let row: Option<LoginRow> = sqlx::query_as(
        "SELECT id, full_name, email, phone, role, referral_code, password_hash, email_verified
         FROM users WHERE email = $1 OR phone = $2",
    )
    .bind(&ident)
    .bind(r.identifier.trim())
    .fetch_optional(&s.db)
    .await?;

    let row = row.ok_or(AppError::Unauthorized)?;
    let (pw, hash) = (r.password, row.password_hash.clone());
    let ok = tokio::task::spawn_blocking(move || verify_password(&pw, &hash))
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    if !ok {
        return Err(AppError::Unauthorized);
    }
    if !row.email_verified {
        return Err(AppError::EmailNotVerified(row.email));
    }

    let token = create_token(row.id, &row.role, &s.config.jwt_secret)?;
    let user = UserOut {
        id: row.id,
        full_name: row.full_name,
        email: row.email,
        phone: row.phone,
        role: row.role,
        referral_code: row.referral_code,
    };
    Ok(Json(json!({ "token": token, "user": user })))
}

async fn me(u: AuthUser, State(s): State<AppState>) -> AppResult<Json<Value>> {
    let user: UserOut = sqlx::query_as(
        "SELECT id, full_name, email, phone, role, referral_code FROM users WHERE id = $1",
    )
    .bind(u.id)
    .fetch_one(&s.db)
    .await?;
    Ok(Json(json!({ "user": user })))
}

/* ---------------- email codes ---------------- */

#[derive(Deserialize)]
struct SendCodeReq {
    email: String,
    purpose: String, // "verify" or "reset"
}

/// Always answers "ok" so nobody can use it to find out who has an account.
async fn send_code(State(s): State<AppState>, Json(r): Json<SendCodeReq>) -> AppResult<Json<Value>> {
    check_purpose(&r.purpose)?;
    let email = r.email.trim().to_lowercase();
    let user: Option<(String, bool)> =
        sqlx::query_as("SELECT full_name, email_verified FROM users WHERE email = $1")
            .bind(&email)
            .fetch_optional(&s.db)
            .await?;
    if let Some((name, verified)) = user {
        if r.purpose == "reset" || !verified {
            issue_code(&s, &email, &name, &r.purpose).await?;
        }
    }
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
struct VerifyCodeReq {
    email: String,
    code: String,
    purpose: String,
}

async fn verify_code(State(s): State<AppState>, Json(r): Json<VerifyCodeReq>) -> AppResult<Json<Value>> {
    check_purpose(&r.purpose)?;
    let email = r.email.trim().to_lowercase();
    let code_id = check_code(&s, &email, &r.purpose, r.code.trim()).await?;

    if r.purpose == "verify" {
        sqlx::query("UPDATE email_codes SET used = TRUE WHERE id = $1")
            .bind(code_id)
            .execute(&s.db)
            .await?;
        let user: UserOut = sqlx::query_as(
            "UPDATE users SET email_verified = TRUE WHERE email = $1
             RETURNING id, full_name, email, phone, role, referral_code",
        )
        .bind(&email)
        .fetch_one(&s.db)
        .await?;
        let token = create_token(user.id, &user.role, &s.config.jwt_secret)?;
        return Ok(Json(json!({ "token": token, "user": user })));
    }
    // 'reset': code is only checked here, it is used up by /reset-password
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
struct ResetReq {
    email: String,
    code: String,
    password: String,
}

async fn reset_password(State(s): State<AppState>, Json(r): Json<ResetReq>) -> AppResult<Json<Value>> {
    if r.password.len() < 8 {
        return Err(AppError::BadRequest("Password must be at least 8 characters".into()));
    }
    let email = r.email.trim().to_lowercase();
    let code_id = check_code(&s, &email, "reset", r.code.trim()).await?;
    let hash = hash_password_async(r.password).await?;

    let mut tx = s.db.begin().await?;
    sqlx::query("UPDATE users SET password_hash = $1, email_verified = TRUE WHERE email = $2")
        .bind(hash)
        .bind(&email)
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE email_codes SET used = TRUE WHERE id = $1")
        .bind(code_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(json!({ "ok": true })))
}