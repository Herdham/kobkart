use crate::{
    error::{AppError, AppResult},
    state::AppState,
};
use hmac::{Hmac, Mac};
use serde_json::Value;
use sha2::Sha512;

fn key(state: &AppState) -> AppResult<&str> {
    if state.config.paystack_secret.is_empty() {
        return Err(AppError::BadRequest(
            "Payments are not set up yet. Add PAYSTACK_SECRET_KEY to the backend .env file.".into(),
        ));
    }
    Ok(&state.config.paystack_secret)
}

fn check(ok: bool, v: Value) -> AppResult<Value> {
    if !ok || v["status"] != true {
        let msg = v["message"].as_str().unwrap_or("Payment provider error").to_string();
        return Err(AppError::BadRequest(msg));
    }
    Ok(v)
}

/// POST to Paystack and return the `data` part of the response.
pub async fn post(state: &AppState, path: &str, body: Value) -> AppResult<Value> {
    let res = state
        .http
        .post(format!("https://api.paystack.co{path}"))
        .bearer_auth(key(state)?)
        .json(&body)
        .send()
        .await?;
    let ok = res.status().is_success();
    let v: Value = res.json().await?;
    Ok(check(ok, v)?["data"].clone())
}

/// GET from Paystack and return the whole response (data + meta).
pub async fn get_raw(state: &AppState, path: &str, query: &[(&str, &str)]) -> AppResult<Value> {
    let res = state
        .http
        .get(format!("https://api.paystack.co{path}"))
        .bearer_auth(key(state)?)
        .query(query)
        .send()
        .await?;
    let ok = res.status().is_success();
    let v: Value = res.json().await?;
    check(ok, v)
}

/// GET from Paystack and return the `data` part.
pub async fn get(state: &AppState, path: &str, query: &[(&str, &str)]) -> AppResult<Value> {
    Ok(get_raw(state, path, query).await?["data"].clone())
}

/// Check that a webhook really came from Paystack.
pub fn verify_signature(secret: &str, body: &[u8], signature: &str) -> bool {
    let Ok(sig) = hex::decode(signature) else { return false };
    let Ok(mut mac) = Hmac::<Sha512>::new_from_slice(secret.as_bytes()) else { return false };
    mac.update(body);
    mac.verify_slice(&sig).is_ok()
}