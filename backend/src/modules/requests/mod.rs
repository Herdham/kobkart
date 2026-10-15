use crate::{
    email::{card, esc, send_html},
    error::{AppError, AppResult},
    middleware::auth::AuthUser,
    state::AppState,
};
use axum::{
    extract::{Path, State},
    routing::{get, post, put},
    Json, Router,
};
use chrono::{DateTime, Duration, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::FromRow;
use uuid::Uuid;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/rotation/{channel_id}/requests", get(list))
        .route("/rotation/{channel_id}/requests/{rid}/approve", post(approve))
        .route("/rotation/{channel_id}/requests/{rid}/decline", post(decline))
        .route("/rotation/{channel_id}/join-mode", put(set_mode))
        .route("/rotation/{channel_id}/my-request", get(my_request))
}

async fn owner(s: &AppState, u: &AuthUser, id: Uuid) -> AppResult<()> {
    u.require("seller")?;
    let o: Uuid = sqlx::query_scalar("SELECT seller_id FROM channels WHERE id = $1 AND kind = 'rotation'")
        .bind(id)
        .fetch_one(&s.db)
        .await?;
    if o != u.id {
        return Err(AppError::Forbidden);
    }
    Ok(())
}

#[derive(Serialize, FromRow)]
struct ReqRow {
    id: Uuid,
    name: String,
    phone: String,
    created_at: DateTime<Utc>,
    location: Option<String>,
    instagram: Option<String>,
    facebook: Option<String>,
    x_handle: Option<String>,
    website: Option<String>,
}

async fn list(u: AuthUser, State(s): State<AppState>, Path(id): Path<Uuid>) -> AppResult<Json<Value>> {
    owner(&s, &u, id).await?;
    let mode: String = sqlx::query_scalar("SELECT join_mode FROM channels WHERE id = $1")
        .bind(id)
        .fetch_one(&s.db)
        .await?;
    let rows: Vec<ReqRow> = sqlx::query_as(
        "SELECT r.id, u.full_name AS name, u.phone, r.created_at, u.location, u.instagram, u.facebook, u.x_handle, u.website
         FROM join_requests r JOIN users u ON u.id = r.user_id
         WHERE r.channel_id = $1 AND r.status = 'pending' ORDER BY r.created_at",
    )
    .bind(id)
    .fetch_all(&s.db)
    .await?;
    Ok(Json(json!({ "mode": mode, "requests": rows })))
}

#[derive(Deserialize)]
struct ModeReq {
    mode: String,
}

async fn set_mode(u: AuthUser, State(s): State<AppState>, Path(id): Path<Uuid>, Json(b): Json<ModeReq>) -> AppResult<Json<Value>> {
    owner(&s, &u, id).await?;
    if b.mode != "open" && b.mode != "approval" {
        return Err(AppError::BadRequest("Choose open or approval".into()));
    }
    sqlx::query("UPDATE channels SET join_mode = $1 WHERE id = $2")
        .bind(&b.mode)
        .bind(id)
        .execute(&s.db)
        .await?;
    Ok(Json(json!({ "ok": true })))
}

/// A customer asks to join. Nothing is reserved until the seller approves.
pub async fn create_request(s: &AppState, u: &AuthUser, id: Uuid) -> AppResult<Json<Value>> {
    let st: Option<(String, i64, Option<i32>)> = sqlx::query_as(
        "SELECT c.rotation_status, (SELECT COUNT(*) FROM rotation_members m WHERE m.channel_id = c.id), c.slots
         FROM channels c WHERE c.id = $1",
    )
    .bind(id)
    .fetch_optional(&s.db)
    .await?;
    let (status, count, slots) = st.ok_or(AppError::NotFound)?;
    if status != "open" {
        return Err(AppError::BadRequest("This group has already started and is not taking new members.".into()));
    }
    if count >= slots.unwrap_or(0) as i64 {
        return Err(AppError::BadRequest("This group is full.".into()));
    }
    let member: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM rotation_members WHERE channel_id = $1 AND user_id = $2)")
        .bind(id)
        .bind(u.id)
        .fetch_one(&s.db)
        .await?;
    if member {
        return Err(AppError::BadRequest("You are already in this group.".into()));
    }
    let res = sqlx::query("INSERT INTO join_requests (channel_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING")
        .bind(id)
        .bind(u.id)
        .execute(&s.db)
        .await?;
    if res.rows_affected() == 1 {
        tell_seller(s, id, u.id).await;
    }
    Ok(Json(json!({ "status": "requested" })))
}

async fn approve(u: AuthUser, State(s): State<AppState>, Path((id, rid)): Path<(Uuid, Uuid)>) -> AppResult<Json<Value>> {
    owner(&s, &u, id).await?;
    let mut tx = s.db.begin().await?;
    let row: Option<(i64, i32, Option<i32>, Option<NaiveDate>, String)> = sqlx::query_as(
        "SELECT contribution_amount, frequency_days, slots, start_date, rotation_status FROM channels WHERE id = $1 FOR UPDATE",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?;
    let (contribution, freq, slots, start, status) = row.ok_or(AppError::NotFound)?;
    if status != "open" {
        return Err(AppError::BadRequest("The group has already started, so new members cannot be added.".into()));
    }
    let req: Option<(Uuid, DateTime<Utc>)> = sqlx::query_as(
        "SELECT user_id, created_at FROM join_requests WHERE id = $1 AND channel_id = $2 AND status = 'pending' FOR UPDATE",
    )
    .bind(rid)
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?;
    let (user_id, asked_at) = req.ok_or_else(|| AppError::BadRequest("This request was already handled.".into()))?;
    crate::modules::billing::ensure_capacity(&s, u.id, 1).await?;
    let slots = slots.unwrap_or(0);
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM rotation_members WHERE channel_id = $1")
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;
    if count >= slots as i64 {
        return Err(AppError::BadRequest("This group is full. Decline the request, or remove someone first.".into()));
    }
    let already: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM rotation_members WHERE channel_id = $1 AND user_id = $2)")
        .bind(id)
        .bind(user_id)
        .fetch_one(&mut *tx)
        .await?;
    if !already {
        let due = start.unwrap_or_else(|| Utc::now().date_naive() + Duration::days(freq as i64));
        let plan_id: Uuid = sqlx::query_scalar(
            "INSERT INTO plans (customer_id, channel_id, locked_price, installment_amount, next_due_date)
             VALUES ($1, $2, $3, $4, $5) RETURNING id",
        )
        .bind(user_id)
        .bind(id)
        .bind(contribution * slots as i64)
        .bind(contribution)
        .bind(due)
        .fetch_one(&mut *tx)
        .await?;
        sqlx::query("INSERT INTO rotation_members (channel_id, user_id, plan_id, position, committed_at) VALUES ($1, $2, $3, $4, $5)")
            .bind(id)
            .bind(user_id)
            .bind(plan_id)
            .bind((count + 1) as i32)
            .bind(asked_at)
            .execute(&mut *tx)
            .await?;
    }
    sqlx::query("UPDATE join_requests SET status = 'approved', decided_at = now() WHERE id = $1")
        .bind(rid)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    tell_member(&s, user_id, id, true).await;
    Ok(Json(json!({ "ok": true })))
}

async fn decline(u: AuthUser, State(s): State<AppState>, Path((id, rid)): Path<(Uuid, Uuid)>) -> AppResult<Json<Value>> {
    owner(&s, &u, id).await?;
    let user_id: Option<Uuid> = sqlx::query_scalar(
        "UPDATE join_requests SET status = 'declined', decided_at = now()
         WHERE id = $1 AND channel_id = $2 AND status = 'pending' RETURNING user_id",
    )
    .bind(rid)
    .bind(id)
    .fetch_optional(&s.db)
    .await?;
    let user_id = user_id.ok_or_else(|| AppError::BadRequest("This request was already handled.".into()))?;
    tell_member(&s, user_id, id, false).await;
    Ok(Json(json!({ "ok": true })))
}

async fn my_request(u: AuthUser, State(s): State<AppState>, Path(id): Path<Uuid>) -> AppResult<Json<Value>> {
    let member: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM rotation_members WHERE channel_id = $1 AND user_id = $2)")
        .bind(id)
        .bind(u.id)
        .fetch_one(&s.db)
        .await?;
    let status: Option<String> = sqlx::query_scalar(
        "SELECT status FROM join_requests WHERE channel_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1",
    )
    .bind(id)
    .bind(u.id)
    .fetch_optional(&s.db)
    .await?;
    Ok(Json(json!({ "member": member, "status": status })))
}

/* ---------------- emails (best effort: a failed email never blocks the action) ---------------- */

async fn tell_seller(s: &AppState, channel_id: Uuid, requester: Uuid) {
    let r: Result<Option<(String, String, String, String)>, _> = sqlx::query_as(
        "SELECT su.email, sl.business_name, c.name, ru.full_name
         FROM channels c JOIN sellers sl ON sl.user_id = c.seller_id JOIN users su ON su.id = c.seller_id
         JOIN users ru ON ru.id = $2 WHERE c.id = $1",
    )
    .bind(channel_id)
    .bind(requester)
    .fetch_optional(&s.db)
    .await;
    let Ok(Some((to, seller, group, who))) = r else { return };
    let body = format!(
        "<p>Hi {}, <b>{}</b> asked to join your group <b>{}</b>.</p><p>Open the group to see who they are and approve or decline.</p>",
        esc(&seller),
        esc(&who),
        esc(&group)
    );
    let url = format!("{}/groups/{}", s.config.frontend_url, channel_id);
    let html = card("New join request", &body, Some(("Review request", &url)));
    if let Err(e) = send_html(s, &to, "Someone wants to join your group", html).await {
        tracing::warn!("join request email failed: {e:?}");
    }
}

async fn tell_member(s: &AppState, user_id: Uuid, channel_id: Uuid, approved: bool) {
    let r: Result<Option<(String, String, String, String)>, _> = sqlx::query_as(
        "SELECT u.email, u.full_name, c.name, sl.business_name
         FROM users u JOIN channels c ON c.id = $2 JOIN sellers sl ON sl.user_id = c.seller_id WHERE u.id = $1",
    )
    .bind(user_id)
    .bind(channel_id)
    .fetch_optional(&s.db)
    .await;
    let Ok(Some((to, name, group, seller))) = r else { return };
    let first = esc(name.split_whitespace().next().unwrap_or("there"));
    let base = &s.config.frontend_url;
    let (subject, heading, body, url, label) = if approved {
        (
            "You are in the group",
            "You were approved",
            format!("<p>Hi {first}, {} approved you in <b>{}</b>. Open Kobkart to see your place in the order.</p>", esc(&seller), esc(&group)),
            format!("{base}/groups/{channel_id}"),
            "Open the group",
        )
    } else {
        (
            "About your join request",
            "Request not approved",
            format!("<p>Hi {first}, {} could not add you to <b>{}</b> this time. You can contact them directly, or look at other packages.</p>", esc(&seller), esc(&group)),
            format!("{base}/browse"),
            "Browse packages",
        )
    };
    let html = card(heading, &body, Some((label, &url)));
    if let Err(e) = send_html(s, &to, subject, html).await {
        tracing::warn!("join decision email failed: {e:?}");
    }
}