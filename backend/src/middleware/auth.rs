use crate::{error::AppError, state::AppState};
use axum::{
    extract::FromRequestParts,
    http::{header::AUTHORIZATION, request::Parts},
};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub role: String,
    pub exp: usize,
}

/// Add `u: AuthUser` to any handler to make it login-protected.
pub struct AuthUser {
    pub id: Uuid,
    pub role: String,
}

impl AuthUser {
    pub fn require(&self, role: &str) -> Result<(), AppError> {
        if self.role == role {
            Ok(())
        } else {
            Err(AppError::Forbidden)
        }
    }
}

pub fn create_token(user_id: Uuid, role: &str, secret: &str) -> Result<String, AppError> {
    let exp = (chrono::Utc::now() + chrono::Duration::days(7)).timestamp() as usize;
    let claims = Claims { sub: user_id.to_string(), role: role.to_string(), exp };
    encode(&Header::default(), &claims, &EncodingKey::from_secret(secret.as_bytes()))
        .map_err(|e| AppError::Internal(e.to_string()))
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let header = parts
            .headers
            .get(AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .ok_or(AppError::Unauthorized)?;
        let token = header.strip_prefix("Bearer ").ok_or(AppError::Unauthorized)?;
        let data = decode::<Claims>(
            token,
            &DecodingKey::from_secret(state.config.jwt_secret.as_bytes()),
            &Validation::default(),
        )
        .map_err(|_| AppError::Unauthorized)?;
        let id = Uuid::parse_str(&data.claims.sub).map_err(|_| AppError::Unauthorized)?;
        Ok(AuthUser { id, role: data.claims.role })
    }
}
