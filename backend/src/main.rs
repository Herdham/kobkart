mod config;
mod db;
mod email;
mod error;
mod middleware;
mod modules;
mod paystack;
mod state;

use axum::{
    http::{
        header::{AUTHORIZATION, CONTENT_TYPE},
        HeaderValue, Method,
    },
    routing::get,
    Router,
};
use std::sync::Arc;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info,tower_http=debug")),
        )
        .init();

    let config = Arc::new(config::Config::from_env());
    let pool = db::connect(&config.database_url).await?;
    sqlx::migrate!().run(&pool).await?;

    let state = state::AppState {
        db: pool,
        config: config.clone(),
        http: reqwest::Client::new(),
    };

    let cors = CorsLayer::new()
        .allow_origin(config.frontend_url.parse::<HeaderValue>()?)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::OPTIONS])
        .allow_headers([AUTHORIZATION, CONTENT_TYPE]);

    let app = Router::new()
        .route("/health", get(|| async { "ok" }))
        .nest("/auth", modules::auth::routes())
        .merge(modules::sellers::routes())
        .merge(modules::channels::routes())
        .merge(modules::products::routes())
        .merge(modules::plans::routes())
        .merge(modules::payments::routes())
        .merge(modules::dashboard::routes())
        .merge(modules::admin::routes())
        .merge(modules::rotation::routes())
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", config.port)).await?;
    tracing::info!("Kobkart API running on port {}", config.port);
    axum::serve(listener, app).await?;
    Ok(())
}
