use crate::{
    error::{AppError, AppResult},
    middleware::auth::AuthUser,
    modules::sellers::require_verified,
    state::AppState,
};
use axum::{
    extract::{Path, State},
    routing::{get, post, put},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/seller/channels/{id}/state", get(state))
        .route("/seller/channels/{id}/archive", put(archive))
        .route("/seller/channels/{id}/clone", post(clone_channel))
}

struct Info {
    kind: String,
    status: String,
    archived: bool,
    active: i64,
}

async fn info(s: &AppState, u: &AuthUser, id: Uuid) -> AppResult<Info> {
    u.require("seller")?;
    let row: (Uuid, String, String, bool) = sqlx::query_as(
        "SELECT seller_id, kind, rotation_status, archived_at IS NOT NULL FROM channels WHERE id = $1",
    )
    .bind(id)
    .fetch_one(&s.db)
    .await?;
    if row.0 != u.id {
        return Err(AppError::Forbidden);
    }
    let active: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM plans WHERE channel_id = $1 AND status = 'active'")
        .bind(id)
        .fetch_one(&s.db)
        .await?;
    Ok(Info { kind: row.1, status: row.2, archived: row.3, active })
}

/// Why a package cannot be archived yet, if there is a reason.
fn blocker(i: &Info) -> Option<String> {
    if i.kind == "rotation" {
        if i.status != "finished" {
            return Some("A group can be archived once every round has been collected.".into());
        }
    } else if i.active > 0 {
        return Some(format!(
            "{} customer{} still paying. Archive it when everyone has finished.",
            i.active,
            if i.active == 1 { " is" } else { "s are" }
        ));
    }
    None
}

async fn state(u: AuthUser, State(s): State<AppState>, Path(id): Path<Uuid>) -> AppResult<Json<Value>> {
    let i = info(&s, &u, id).await?;
    let reason = if i.archived { None } else { blocker(&i) };
    Ok(Json(json!({
        "kind": i.kind,
        "status": i.status,
        "archived": i.archived,
        "active": i.active,
        "can_archive": !i.archived && reason.is_none(),
        "reason": reason
    })))
}

#[derive(Deserialize)]
struct ArchiveReq {
    archived: bool,
}

async fn archive(u: AuthUser, State(s): State<AppState>, Path(id): Path<Uuid>, Json(b): Json<ArchiveReq>) -> AppResult<Json<Value>> {
    let i = info(&s, &u, id).await?;
    if b.archived {
        if let Some(r) = blocker(&i) {
            return Err(AppError::BadRequest(r));
        }
    }
    sqlx::query(
        "UPDATE channels SET archived_at = CASE WHEN $1 THEN now() ELSE NULL END,
                is_public = CASE WHEN $1 THEN FALSE ELSE is_public END
         WHERE id = $2",
    )
    .bind(b.archived)
    .bind(id)
    .execute(&s.db)
    .await?;
    Ok(Json(json!({ "ok": true })))
}

/// Same settings, brand new and private. Item packages also copy their active products.
async fn clone_channel(u: AuthUser, State(s): State<AppState>, Path(id): Path<Uuid>) -> AppResult<Json<Value>> {
    require_verified(&s, &u).await?;
    let i = info(&s, &u, id).await?;
    let c: (String, Option<String>, i64, i32, Option<String>, String, Option<i32>) = sqlx::query_as(
        "SELECT name, description, contribution_amount, frequency_days, image_url, category, slots FROM channels WHERE id = $1",
    )
    .bind(id)
    .fetch_one(&s.db)
    .await?;
    let suffix = if i.kind == "rotation" && i.status == "finished" { "(new round)" } else { "(copy)" };
    let code = Uuid::new_v4().simple().to_string()[..8].to_uppercase();

    let mut tx = s.db.begin().await?;
    let new_id: Uuid = sqlx::query_scalar(
        "INSERT INTO channels (seller_id, name, description, contribution_amount, frequency_days, invite_code,
                               image_url, category, is_public, kind, slots)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, $9, $10) RETURNING id",
    )
    .bind(u.id)
    .bind(format!("{} {}", c.0, suffix))
    .bind(c.1)
    .bind(c.2)
    .bind(c.3)
    .bind(code)
    .bind(c.4)
    .bind(c.5)
    .bind(i.kind.clone())
    .bind(c.6)
    .fetch_one(&mut *tx)
    .await?;
    if i.kind == "save" {
        sqlx::query(
            "INSERT INTO products (channel_id, name, description, price, image_url)
             SELECT $1, name, description, price, image_url FROM products WHERE channel_id = $2 AND active",
        )
        .bind(new_id)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(Json(json!({ "id": new_id, "kind": i.kind })))
}