use std::env;

#[derive(Clone)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub paystack_secret: String,
    pub platform_fee_percent: i64,
    pub frontend_url: String,
    pub port: u16,
    pub resend_api_key: String,
    pub email_from: String,
}

impl Config {
    pub fn from_env() -> Self {
        let need = |k: &str| env::var(k).unwrap_or_else(|_| panic!("{k} must be set in .env"));
        let opt = |k: &str, d: &str| {
            env::var(k).ok().filter(|v| !v.trim().is_empty()).unwrap_or_else(|| d.to_string())
        };
        Self {
            database_url: need("DATABASE_URL"),
            jwt_secret: need("JWT_SECRET"),
            paystack_secret: opt("PAYSTACK_SECRET_KEY", ""),
            platform_fee_percent: env::var("PLATFORM_FEE_PERCENT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(3),
            frontend_url: opt("FRONTEND_URL", "http://localhost:5173"),
            port: env::var("PORT").ok().and_then(|v| v.parse().ok()).unwrap_or(3000),
            resend_api_key: opt("RESEND_API_KEY", ""),
            email_from: opt("EMAIL_FROM", "Kobkart <onboarding@resend.dev>"),
        }
    }
}