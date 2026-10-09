use crate::{
    error::{AppError, AppResult},
    middleware::auth::AuthUser,
    paystack,
    state::AppState,
};
use axum::{
    extract::{Query, State},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/seller/profile", get(profile).put(update_profile))
        .route("/seller/banks", get(banks))
        .route("/seller/resolve-account", get(resolve_account))
        .route("/seller/bank", post(set_bank))
}

/// Seller must exist and be approved by admin.
pub async fn require_verified(s: &AppState, u: &AuthUser) -> AppResult<()> {
    u.require("seller")?;
    let verified: bool = sqlx::query_scalar("SELECT verified FROM sellers WHERE user_id = $1")
        .bind(u.id)
        .fetch_one(&s.db)
        .await?;
    if !verified {
        return Err(AppError::BadRequest("Your seller account is awaiting admin verification".into()));
    }
    Ok(())
}

async fn profile(u: AuthUser, State(s): State<AppState>) -> AppResult<Json<Value>> {
    u.require("seller")?;
    let r: (String, bool, Option<String>, Option<String>, Option<String>, Option<String>) = sqlx::query_as(
        "SELECT business_name, verified, paystack_subaccount_code, payout_bank_name, payout_account_name, payout_account_last4
         FROM sellers WHERE user_id = $1",
    )
    .bind(u.id)
    .fetch_one(&s.db)
    .await?;
    Ok(Json(json!({
        "business_name": r.0,
        "verified": r.1,
        "payout_ready": r.2.is_some(),
        "bank_name": r.3,
        "account_name": r.4,
        "account_last4": r.5
    })))
}

#[derive(Deserialize)]
struct UpdateProfile {
    business_name: String,
}

async fn update_profile(u: AuthUser, State(s): State<AppState>, Json(b): Json<UpdateProfile>) -> AppResult<Json<Value>> {
    u.require("seller")?;
    if b.business_name.trim().len() < 2 {
        return Err(AppError::BadRequest("Business name is required".into()));
    }
    sqlx::query("UPDATE sellers SET business_name = $1 WHERE user_id = $2")
        .bind(b.business_name.trim())
        .bind(u.id)
        .execute(&s.db)
        .await?;
    Ok(Json(json!({ "ok": true })))
}

/// List of Nigerian banks straight from Paystack.
async fn banks(u: AuthUser, State(s): State<AppState>) -> AppResult<Json<Value>> {
    u.require("seller")?;
    let mut list: Vec<Value> = Vec::new();
    let mut next: Option<String> = None;
    for _ in 0..8 {
        let v = {
            let mut q: Vec<(&str, &str)> = vec![("country", "nigeria"), ("use_cursor", "true"), ("perPage", "100")];
            if let Some(c) = next.as_deref() {
                q.push(("next", c));
            }
            paystack::get_raw(&s, "/bank", &q).await?
        };
        if let Some(arr) = v["data"].as_array() {
            for b in arr {
                if b["active"] == false {
                    continue;
                }
                if let (Some(name), Some(code)) = (b["name"].as_str(), b["code"].as_str()) {
                    list.push(json!({ "name": name, "code": code }));
                }
            }
        }
        next = v["meta"]["next"].as_str().map(String::from);
        if next.is_none() {
            break;
        }
    }
    list.sort_by(|a, b| a["name"].as_str().cmp(&b["name"].as_str()));
    Ok(Json(json!(list)))
}

async fn resolve_name(s: &AppState, bank_code: &str, account: &str) -> AppResult<String> {
    if account.len() != 10 || !account.chars().all(|c| c.is_ascii_digit()) {
        return Err(AppError::BadRequest("Account number must be 10 digits".into()));
    }
    let d = paystack::get(s, "/bank/resolve", &[("account_number", account), ("bank_code", bank_code)]).await?;
    d["account_name"]
        .as_str()
        .map(String::from)
        .ok_or_else(|| AppError::BadRequest("Could not find that account".into()))
}

#[derive(Deserialize)]
struct ResolveQ {
    bank_code: String,
    account_number: String,
}

/// Shows the account holder's name BEFORE saving, so wrong numbers are caught.
async fn resolve_account(u: AuthUser, State(s): State<AppState>, Query(q): Query<ResolveQ>) -> AppResult<Json<Value>> {
    u.require("seller")?;
    let name = resolve_name(&s, &q.bank_code, &q.account_number).await?;
    Ok(Json(json!({ "account_name": name })))
}

#[derive(Deserialize)]
struct BankReq {
    bank_code: String,
    bank_name: String,
    account_number: String,
}

/// Creates the seller's Paystack subaccount so payments split automatically.
async fn set_bank(u: AuthUser, State(s): State<AppState>, Json(b): Json<BankReq>) -> AppResult<Json<Value>> {
    u.require("seller")?;
    let account_name = resolve_name(&s, &b.bank_code, &b.account_number).await?;
    let biz: String = sqlx::query_scalar("SELECT business_name FROM sellers WHERE user_id = $1")
        .bind(u.id)
        .fetch_one(&s.db)
        .await?;
    let data = paystack::post(
        &s,
        "/subaccount",
        json!({
            "business_name": biz,
            "settlement_bank": b.bank_code,
            "account_number": b.account_number,
            "percentage_charge": s.config.platform_fee_percent
        }),
    )
    .await?;
    let code = data["subaccount_code"]
        .as_str()
        .ok_or_else(|| AppError::Internal("Paystack returned no subaccount code".into()))?;
    let last4 = b.account_number[b.account_number.len() - 4..].to_string();
    sqlx::query(
        "UPDATE sellers SET paystack_subaccount_code = $1, payout_bank_name = $2,
                payout_account_name = $3, payout_account_last4 = $4 WHERE user_id = $5",
    )
    .bind(code)
    .bind(&b.bank_name)
    .bind(&account_name)
    .bind(&last4)
    .bind(u.id)
    .execute(&s.db)
    .await?;
    Ok(Json(json!({
        "payout_ready": true,
        "bank_name": b.bank_name,
        "account_name": account_name,
        "account_last4": last4
    })))
}