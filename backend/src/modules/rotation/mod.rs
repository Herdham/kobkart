use crate::{
    error::{AppError, AppResult},
    middleware::auth::AuthUser,
    state::AppState,
};
use axum::{
    extract::{Path, State},
    routing::{delete, get, post, put},
    Json, Router,
};
use chrono::{Duration, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::FromRow;
use uuid::Uuid;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/rotation/{channel_id}", get(overview))
        .route("/rotation/{channel_id}/join", post(join))
        .route("/rotation/{channel_id}/order", put(set_order))
        .route("/rotation/{channel_id}/start", post(start))
        .route("/rotation/{channel_id}/rounds/{round_no}/collected", put(set_collected))
        .route("/rotation/{channel_id}/members/{member_id}", delete(remove_member))
        .route("/seller/collections", get(collections))
}

#[derive(FromRow)]
struct Grp {
    id: Uuid,
    seller_id: Uuid,
    name: String,
    description: Option<String>,
    contribution_amount: i64,
    frequency_days: i32,
    slots: Option<i32>,
    start_date: Option<NaiveDate>,
    rotation_status: String,
    kind: String,
    invite_code: String,
    category: String,
    is_public: bool,
    has_image: bool,
}

#[derive(FromRow)]
struct MemberRow {
    id: Uuid,
    user_id: Uuid,
    plan_id: Uuid,
    position: i32,
    name: String,
    phone: String,
    amount_paid: i64,
    next_due_date: NaiveDate,
    paid_count: i64,
}

#[derive(FromRow)]
struct RoundRow {
    round_no: i32,
    due_date: NaiveDate,
    collected: bool,
}

async fn load_group(s: &AppState, id: Uuid) -> AppResult<Grp> {
    let g: Grp = sqlx::query_as(
        "SELECT id, seller_id, name, description, contribution_amount, frequency_days, slots, start_date,
                rotation_status, kind, invite_code, category, is_public, (image_url IS NOT NULL) AS has_image
         FROM channels WHERE id = $1",
    )
    .bind(id)
    .fetch_one(&s.db)
    .await?;
    if g.kind != "rotation" {
        return Err(AppError::NotFound);
    }
    Ok(g)
}

async fn owner_group(s: &AppState, u: &AuthUser, id: Uuid) -> AppResult<Grp> {
    u.require("seller")?;
    let g = load_group(s, id).await?;
    if g.seller_id != u.id {
        return Err(AppError::Forbidden);
    }
    Ok(g)
}

/// Everything the group page needs. Phone numbers are only shown to the seller.
async fn overview(u: AuthUser, State(s): State<AppState>, Path(id): Path<Uuid>) -> AppResult<Json<Value>> {
    let g = load_group(&s, id).await?;
    let members: Vec<MemberRow> = sqlx::query_as(
        "SELECT m.id, m.user_id, m.plan_id, m.position, u.full_name AS name, u.phone,
                p.amount_paid, p.next_due_date,
                (SELECT COUNT(*) FROM payments py WHERE py.plan_id = p.id AND py.status = 'success') AS paid_count
         FROM rotation_members m
         JOIN users u ON u.id = m.user_id
         JOIN plans p ON p.id = m.plan_id
         WHERE m.channel_id = $1
         ORDER BY m.position",
    )
    .bind(id)
    .fetch_all(&s.db)
    .await?;

    let is_owner = g.seller_id == u.id;
    let me_id = members.iter().find(|m| m.user_id == u.id).map(|m| m.id);
    if !is_owner && me_id.is_none() && u.role != "admin" {
        return Err(AppError::Forbidden);
    }

    let rounds: Vec<RoundRow> = sqlx::query_as(
        "SELECT round_no, due_date, collected FROM rotation_rounds WHERE channel_id = $1 ORDER BY round_no",
    )
    .bind(id)
    .fetch_all(&s.db)
    .await?;
    let seller: String = sqlx::query_scalar("SELECT business_name FROM sellers WHERE user_id = $1")
        .bind(g.seller_id)
        .fetch_one(&s.db)
        .await?;

    let today = Utc::now().date_naive();
    let running = g.rotation_status != "open";
    let due_rounds = rounds.iter().filter(|r| r.due_date < today).count() as i64;

    let member_json: Vec<Value> = members
        .iter()
        .map(|m| {
            let phone = if is_owner { Some(m.phone.clone()) } else { None };
            let plan_id = if is_owner || m.user_id == u.id { Some(m.plan_id) } else { None };
            let late = running && m.paid_count < due_rounds;
            json!({
                "id": m.id,
                "position": m.position,
                "name": m.name,
                "phone": phone,
                "plan_id": plan_id,
                "paid_count": m.paid_count,
                "amount_paid": m.amount_paid,
                "next_due_date": m.next_due_date,
                "late": late,
                "is_me": m.user_id == u.id
            })
        })
        .collect();

    let round_json: Vec<Value> = rounds
        .iter()
        .map(|r| {
            let collector = members.iter().find(|m| m.position == r.round_no);
            let collector_id = collector.map(|c| c.id);
            let collector_name = collector.map(|c| c.name.clone());
            let paid = members.iter().filter(|m| m.paid_count >= r.round_no as i64).count();
            json!({
                "round_no": r.round_no,
                "due_date": r.due_date,
                "collected": r.collected,
                "collector_id": collector_id,
                "collector_name": collector_name,
                "paid_count": paid,
                "member_count": members.len()
            })
        })
        .collect();

    let current_round = rounds.iter().find(|r| !r.collected).map(|r| r.round_no);
    let size = if running { members.len() as i64 } else { g.slots.unwrap_or(0) as i64 };
    let channel = json!({
        "id": g.id,
        "name": g.name,
        "description": g.description,
        "contribution_amount": g.contribution_amount,
        "frequency_days": g.frequency_days,
        "slots": g.slots,
        "start_date": g.start_date,
        "status": g.rotation_status,
        "invite_code": g.invite_code,
        "category": g.category,
        "is_public": g.is_public,
        "has_image": g.has_image,
        "pot": g.contribution_amount * size
    });

    Ok(Json(json!({
        "channel": channel,
        "seller": seller,
        "is_owner": is_owner,
        "my_member_id": me_id,
        "members": member_json,
        "rounds": round_json,
        "current_round": current_round
    })))
}

/// A customer takes a place in an open group.
async fn join(u: AuthUser, State(s): State<AppState>, Path(id): Path<Uuid>) -> AppResult<Json<Value>> {
    u.require("customer")?;
    let mut tx = s.db.begin().await?;

    let row: Option<(i64, i32, Option<i32>, Option<NaiveDate>, String, String)> = sqlx::query_as(
        "SELECT contribution_amount, frequency_days, slots, start_date, rotation_status, kind
         FROM channels WHERE id = $1 FOR UPDATE",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?;
    let (contribution, freq, slots, start, status, kind) = row.ok_or(AppError::NotFound)?;
    if kind != "rotation" {
        return Err(AppError::NotFound);
    }
    if status != "open" {
        return Err(AppError::BadRequest("This group has already started and is not taking new members.".into()));
    }
    let slots = slots.unwrap_or(0);
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM rotation_members WHERE channel_id = $1")
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;
    if count >= slots as i64 {
        return Err(AppError::BadRequest("This group is full.".into()));
    }
    let already: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM rotation_members WHERE channel_id = $1 AND user_id = $2)",
    )
    .bind(id)
    .bind(u.id)
    .fetch_one(&mut *tx)
    .await?;
    if already {
        return Err(AppError::BadRequest("You are already in this group.".into()));
    }

    let due = start.unwrap_or_else(|| Utc::now().date_naive() + Duration::days(freq as i64));
    let plan_id: Uuid = sqlx::query_scalar(
        "INSERT INTO plans (customer_id, channel_id, locked_price, installment_amount, next_due_date)
         VALUES ($1, $2, $3, $4, $5) RETURNING id",
    )
    .bind(u.id)
    .bind(id)
    .bind(contribution * slots as i64)
    .bind(contribution)
    .bind(due)
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query("INSERT INTO rotation_members (channel_id, user_id, plan_id, position) VALUES ($1, $2, $3, $4)")
        .bind(id)
        .bind(u.id)
        .bind(plan_id)
        .bind((count + 1) as i32)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(json!({ "ok": true, "position": count + 1 })))
}

#[derive(Deserialize)]
struct OrderReq {
    member_ids: Vec<Uuid>,
}

/// Seller sets who collects in which round (only before the group starts).
async fn set_order(u: AuthUser, State(s): State<AppState>, Path(id): Path<Uuid>, Json(b): Json<OrderReq>) -> AppResult<Json<Value>> {
    let g = owner_group(&s, &u, id).await?;
    if g.rotation_status != "open" {
        return Err(AppError::BadRequest("The order is locked once the group has started.".into()));
    }
    let mut tx = s.db.begin().await?;
    let mut existing: Vec<Uuid> = sqlx::query_scalar("SELECT id FROM rotation_members WHERE channel_id = $1")
        .bind(id)
        .fetch_all(&mut *tx)
        .await?;
    let mut sent = b.member_ids.clone();
    existing.sort();
    sent.sort();
    if existing != sent {
        return Err(AppError::BadRequest("The member list changed. Refresh the page and try again.".into()));
    }
    for (i, mid) in b.member_ids.iter().enumerate() {
        sqlx::query("UPDATE rotation_members SET position = $1 WHERE id = $2 AND channel_id = $3")
            .bind((i + 1) as i32)
            .bind(mid)
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
struct StartReq {
    start_date: NaiveDate,
}

/// Locks the order and creates one round per member, every `frequency_days`.
async fn start(u: AuthUser, State(s): State<AppState>, Path(id): Path<Uuid>, Json(b): Json<StartReq>) -> AppResult<Json<Value>> {
    let g = owner_group(&s, &u, id).await?;
    if g.rotation_status != "open" {
        return Err(AppError::BadRequest("This group has already started.".into()));
    }
    if b.start_date < Utc::now().date_naive() {
        return Err(AppError::BadRequest("Choose today or a future date for the first collection.".into()));
    }
    let mut tx = s.db.begin().await?;
    let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM rotation_members WHERE channel_id = $1")
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;
    if n < 2 {
        return Err(AppError::BadRequest("You need at least 2 members to start.".into()));
    }
    for r in 1..=n {
        sqlx::query("INSERT INTO rotation_rounds (channel_id, round_no, due_date) VALUES ($1, $2, $3)")
            .bind(id)
            .bind(r as i32)
            .bind(b.start_date + Duration::days((r - 1) * g.frequency_days as i64))
            .execute(&mut *tx)
            .await?;
    }
    sqlx::query("UPDATE channels SET rotation_status = 'running', start_date = $1, slots = $2 WHERE id = $3")
        .bind(b.start_date)
        .bind(n as i32)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    // every member now pays (members x rounds) in total, one contribution per round
    sqlx::query(
        "UPDATE plans SET locked_price = $1, next_due_date = $2
         WHERE id IN (SELECT plan_id FROM rotation_members WHERE channel_id = $3)",
    )
    .bind(g.contribution_amount * n)
    .bind(b.start_date)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(json!({ "ok": true, "rounds": n })))
}

#[derive(Deserialize)]
struct CollectedReq {
    collected: bool,
}

/// Seller marks a round as collected (the "CL" in the WhatsApp list).
async fn set_collected(
    u: AuthUser,
    State(s): State<AppState>,
    Path((id, round_no)): Path<(Uuid, i32)>,
    Json(b): Json<CollectedReq>,
) -> AppResult<Json<Value>> {
    let g = owner_group(&s, &u, id).await?;
    if g.rotation_status == "open" {
        return Err(AppError::BadRequest("Start the group first.".into()));
    }
    let res = sqlx::query(
        "UPDATE rotation_rounds SET collected = $1, collected_at = CASE WHEN $1 THEN now() ELSE NULL END
         WHERE channel_id = $2 AND round_no = $3",
    )
    .bind(b.collected)
    .bind(id)
    .bind(round_no)
    .execute(&s.db)
    .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    sqlx::query(
        "UPDATE channels SET rotation_status = CASE
            WHEN NOT EXISTS (SELECT 1 FROM rotation_rounds WHERE channel_id = $1 AND NOT collected) THEN 'finished'
            ELSE 'running' END
         WHERE id = $1 AND rotation_status IN ('running', 'finished')",
    )
    .bind(id)
    .execute(&s.db)
    .await?;
    Ok(Json(json!({ "ok": true })))
}

/// Seller removes a member before the group starts.
async fn remove_member(
    u: AuthUser,
    State(s): State<AppState>,
    Path((id, member_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<Value>> {
    let g = owner_group(&s, &u, id).await?;
    if g.rotation_status != "open" {
        return Err(AppError::BadRequest("Members cannot be removed after the group has started.".into()));
    }
    let mut tx = s.db.begin().await?;
    let plan_id: Option<Uuid> =
        sqlx::query_scalar("DELETE FROM rotation_members WHERE id = $1 AND channel_id = $2 RETURNING plan_id")
            .bind(member_id)
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let plan_id = plan_id.ok_or(AppError::NotFound)?;
    sqlx::query("DELETE FROM plans WHERE id = $1").bind(plan_id).execute(&mut *tx).await?;
    sqlx::query(
        "UPDATE rotation_members m SET position = sub.rn::int
         FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY position) AS rn FROM rotation_members WHERE channel_id = $1) sub
         WHERE m.id = sub.id",
    )
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Serialize, FromRow)]
struct CollectionRow {
    channel_id: Uuid,
    channel_name: String,
    round_no: i32,
    due_date: NaiveDate,
    collected: bool,
    collector_name: String,
    collector_phone: String,
    pot: i64,
    paid_count: i64,
    member_count: i64,
}

/// Every collection round across the seller's groups: who is due the goods and how much has come in.
async fn collections(u: AuthUser, State(s): State<AppState>) -> AppResult<Json<Vec<CollectionRow>>> {
    u.require("seller")?;
    let rows: Vec<CollectionRow> = sqlx::query_as(
        "SELECT c.id AS channel_id, c.name AS channel_name, r.round_no, r.due_date, r.collected,
                u.full_name AS collector_name, u.phone AS collector_phone,
                (c.contribution_amount * (SELECT COUNT(*) FROM rotation_members x WHERE x.channel_id = c.id))::BIGINT AS pot,
                (SELECT COUNT(*) FROM rotation_members m3 WHERE m3.channel_id = c.id
                   AND (SELECT COUNT(*) FROM payments py WHERE py.plan_id = m3.plan_id AND py.status = 'success') >= r.round_no) AS paid_count,
                (SELECT COUNT(*) FROM rotation_members m4 WHERE m4.channel_id = c.id) AS member_count
         FROM rotation_rounds r
         JOIN channels c ON c.id = r.channel_id
         JOIN rotation_members m ON m.channel_id = r.channel_id AND m.position = r.round_no
         JOIN users u ON u.id = m.user_id
         WHERE c.seller_id = $1 AND c.kind = 'rotation'
         ORDER BY r.collected, r.due_date",
    )
    .bind(u.id)
    .fetch_all(&s.db)
    .await?;
    Ok(Json(rows))
}