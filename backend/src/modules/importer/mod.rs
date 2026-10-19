use crate::{
    error::{AppError, AppResult},
    middleware::auth::AuthUser,
    modules::sellers::require_verified,
    state::AppState,
};
use axum::{extract::{Path, State}, routing::{get, post, put}, Json, Router};
use chrono::{Duration, NaiveDate, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/seller/import-group", post(import_group))
        .route("/seller/groups/{id}/members", get(edit_list))
        .route("/seller/groups/{id}/members/{plan_id}", put(edit_member))
        .route("/seller/channels/{id}/details", get(get_details).put(edit_details))
}

const CATEGORIES: [&str; 8] = ["fashion", "shoes_bags", "kitchen", "electronics", "beauty", "food", "kids", "other"];

#[derive(Deserialize)]
struct MemberIn {
    name: String,
    phone: Option<String>,
    paid: i32,
    collected: bool,
}

#[derive(Deserialize)]
struct ImportReq {
    name: String,
    description: Option<String>,
    category: Option<String>,
    contribution_amount: i64, // kobo
    frequency_days: i32,
    start_date: NaiveDate, // date of round 1
    members: Vec<MemberIn>,
}

fn bad<T>(m: &str) -> AppResult<T> {
    Err(AppError::BadRequest(m.into()))
}

/// Creates a whole running group from a list the organizer already keeps in WhatsApp.
/// No money moves: each tick becomes a payment recorded as "imported".
async fn import_group(u: AuthUser, State(s): State<AppState>, Json(b): Json<ImportReq>) -> AppResult<Json<Value>> {
    require_verified(&s, &u).await?;
    let n = b.members.len();
    if b.name.trim().chars().count() < 2 {
        return bad("Give the group a name");
    }
    if b.contribution_amount < 10_000 {
        return bad("Minimum contribution is N100");
    }
    if !(1..=90).contains(&b.frequency_days) {
        return bad("Frequency must be between 1 and 90 days");
    }
    if !(2..=100).contains(&n) {
        return bad("A group needs between 2 and 100 members");
    }
    let today = Utc::now().date_naive();
    if b.start_date < today - Duration::days(800) || b.start_date > today + Duration::days(400) {
        return bad("Check the date of round 1");
    }
    let category = b.category.as_deref().unwrap_or("other");
    if !CATEGORIES.contains(&category) {
        return bad("Choose a valid category");
    }
    for m in &b.members {
        if !(2..=80).contains(&m.name.trim().chars().count()) {
            return bad("Every member needs a name (2 to 80 letters)");
        }
        if m.paid < 0 || m.paid as usize > n {
            return bad("A member cannot have paid more rounds than the group has");
        }
        let digits = m.phone.as_deref().unwrap_or("").chars().filter(|c| c.is_ascii_digit()).count();
        if digits > 0 && !(10..=13).contains(&digits) {
            return bad("Check the phone numbers, or leave them empty");
        }
    }

    let adding = b.members.iter().filter(|m| (m.paid as usize) < n).count() as i64;
    crate::modules::billing::ensure_capacity(&s, u.id, adding).await?;
    let freq = b.frequency_days as i64;
    let contribution = b.contribution_amount;
    let nn = n as i64;
    let status = if b.members.iter().all(|m| m.collected) { "finished" } else { "running" };
    let code = Uuid::new_v4().simple().to_string()[..8].to_uppercase();
    let description = b.description.as_deref().map(str::trim).filter(|d| !d.is_empty());

    let mut tx = s.db.begin().await?;
    let channel_id: Uuid = sqlx::query_scalar(
        "INSERT INTO channels (seller_id, name, description, contribution_amount, frequency_days, invite_code,
                               category, is_public, kind, slots, start_date, rotation_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, 'rotation', $8, $9, $10) RETURNING id",
    )
    .bind(u.id)
    .bind(b.name.trim())
    .bind(description)
    .bind(contribution)
    .bind(b.frequency_days)
    .bind(code)
    .bind(category)
    .bind(n as i32)
    .bind(b.start_date)
    .bind(status)
    .fetch_one(&mut *tx)
    .await?;

    for (i, m) in b.members.iter().enumerate() {
        let paid = m.paid as i64;
        let plan_status = if paid >= nn { "completed" } else { "active" };
        let next_due = b.start_date + Duration::days(paid * freq);
        let phone = m.phone.as_deref().unwrap_or("").trim().to_string();
        let plan_id: Uuid = sqlx::query_scalar(
            "INSERT INTO plans (channel_id, locked_price, installment_amount, amount_paid, next_due_date, status, guest_name, guest_phone)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
        )
        .bind(channel_id)
        .bind(contribution * nn)
        .bind(contribution)
        .bind(contribution * paid)
        .bind(next_due)
        .bind(plan_status)
        .bind(m.name.trim())
        .bind(phone)
        .fetch_one(&mut *tx)
        .await?;
        sqlx::query("INSERT INTO rotation_members (channel_id, plan_id, position) VALUES ($1, $2, $3)")
            .bind(channel_id)
            .bind(plan_id)
            .bind((i + 1) as i32)
            .execute(&mut *tx)
            .await?;
        if paid > 0 {
            sqlx::query(
                "INSERT INTO payments (plan_id, amount, platform_fee, reference, status, paid_at, method, note, recorded_by)
                 SELECT $1::uuid, $2::bigint, 0, 'IMP-' || md5($1::uuid::text || g::text || random()::text), 'success',
                        LEAST(($3::date + ((g - 1) * $4::int))::timestamptz, now()),
                        'imported', 'Imported from WhatsApp list', $5::uuid
                 FROM generate_series(1, $6::int) g",
            )
            .bind(plan_id)
            .bind(contribution)
            .bind(b.start_date)
            .bind(b.frequency_days)
            .bind(u.id)
            .bind(m.paid)
            .execute(&mut *tx)
            .await?;
        }
    }

    for r in 1..=n {
        let due = b.start_date + Duration::days((r as i64 - 1) * freq);
        sqlx::query(
            "INSERT INTO rotation_rounds (channel_id, round_no, due_date, collected, collected_at)
             VALUES ($1, $2, $3, $4, CASE WHEN $4 THEN now() ELSE NULL END)",
        )
        .bind(channel_id)
        .bind(r as i32)
        .bind(due)
        .bind(b.members[r - 1].collected)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(Json(json!({ "channel_id": channel_id, "members": n })))
}
/* ---------- editing a group after it was imported ---------- */

async fn owned(s: &AppState, u: &AuthUser, id: Uuid) -> AppResult<()> {
    u.require("seller")?;
    let owner: Uuid = sqlx::query_scalar("SELECT seller_id FROM channels WHERE id = $1")
        .bind(id)
        .fetch_one(&s.db)
        .await?;
    if owner != u.id {
        return Err(AppError::Forbidden);
    }
    Ok(())
}

#[derive(sqlx::FromRow, serde::Serialize)]
struct MemberRow {
    plan_id: Uuid,
    position: i32,
    name: Option<String>,
    phone: Option<String>,
    paid: i64,
    is_guest: bool,
    collected: bool,
}

async fn edit_list(u: AuthUser, State(s): State<AppState>, Path(id): Path<Uuid>) -> AppResult<Json<Value>> {
    owned(&s, &u, id).await?;
    let rows: Vec<MemberRow> = sqlx::query_as(
        "SELECT p.id AS plan_id, m.position, COALESCE(p.guest_name, us.full_name) AS name, p.guest_phone AS phone,
                (p.amount_paid / GREATEST(p.installment_amount, 1))::bigint AS paid,
                p.customer_id IS NULL AS is_guest, COALESCE(r.collected, FALSE) AS collected
         FROM rotation_members m
         JOIN plans p ON p.id = m.plan_id
         LEFT JOIN users us ON us.id = p.customer_id
         LEFT JOIN rotation_rounds r ON r.channel_id = m.channel_id AND r.round_no = m.position
         WHERE m.channel_id = $1 ORDER BY m.position",
    )
    .bind(id)
    .fetch_all(&s.db)
    .await?;
    Ok(Json(json!({ "members": rows })))
}

#[derive(Deserialize)]
struct EditMember {
    name: Option<String>,
    phone: Option<String>,
    paid: Option<i64>,
}

async fn edit_member(
    u: AuthUser,
    State(s): State<AppState>,
    Path((id, plan_id)): Path<(Uuid, Uuid)>,
    Json(b): Json<EditMember>,
) -> AppResult<Json<Value>> {
    owned(&s, &u, id).await?;
    let (freq, start, nn): (i32, Option<NaiveDate>, i64) = sqlx::query_as(
        "SELECT c.frequency_days, c.start_date, (SELECT COUNT(*) FROM rotation_members WHERE channel_id = c.id)
         FROM channels c WHERE c.id = $1",
    )
    .bind(id)
    .fetch_one(&s.db)
    .await?;

    let mut tx = s.db.begin().await?;
    let (amount_paid, inst, guest): (i64, i64, bool) = sqlx::query_as(
        "SELECT p.amount_paid, p.installment_amount, p.customer_id IS NULL
         FROM plans p JOIN rotation_members m ON m.plan_id = p.id
         WHERE p.id = $1 AND m.channel_id = $2 FOR UPDATE OF p",
    )
    .bind(plan_id)
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(AppError::NotFound)?;

    if guest {
        if let Some(name) = b.name.as_deref() {
            if !(2..=80).contains(&name.trim().chars().count()) {
                return bad("Every member needs a name (2 to 80 letters)");
            }
            sqlx::query("UPDATE plans SET guest_name = $1 WHERE id = $2").bind(name.trim()).bind(plan_id).execute(&mut *tx).await?;
        }
        if let Some(phone) = b.phone.as_deref() {
            let digits = phone.chars().filter(|c| c.is_ascii_digit()).count();
            if digits > 0 && !(10..=13).contains(&digits) {
                return bad("Check the phone number, or leave it empty");
            }
            sqlx::query("UPDATE plans SET guest_phone = $1 WHERE id = $2").bind(phone.trim()).bind(plan_id).execute(&mut *tx).await?;
        }
    }

    if let Some(new) = b.paid {
        let cur = amount_paid / inst.max(1);
        if new < 0 || new > nn {
            return bad("Rounds paid must be between 0 and the number of members");
        }
        if new > cur {
            sqlx::query(
                "INSERT INTO payments (plan_id, amount, platform_fee, reference, status, paid_at, method, note, recorded_by)
                 SELECT $1::uuid, $2::bigint, 0, 'IMP-' || md5($1::uuid::text || g::text || random()::text), 'success',
                        LEAST(($3::date + ((g - 1) * $4::int))::timestamptz, now()),
                        'imported', 'Added when editing the list', $5::uuid
                 FROM generate_series($6::int, $7::int) g",
            )
            .bind(plan_id)
            .bind(inst)
            .bind(start.unwrap_or_else(|| Utc::now().date_naive()))
            .bind(freq)
            .bind(u.id)
            .bind((cur + 1) as i32)
            .bind(new as i32)
            .execute(&mut *tx)
            .await?;
        } else if new < cur {
            let want = cur - new;
            let removed = sqlx::query(
                "DELETE FROM payments WHERE id IN (
                    SELECT id FROM payments
                    WHERE plan_id = $1 AND status = 'success' AND COALESCE(method, '') NOT IN ('paystack', 'online')
                    ORDER BY paid_at DESC LIMIT $2)",
            )
            .bind(plan_id)
            .bind(want)
            .execute(&mut *tx)
            .await?
            .rows_affected() as i64;
            if removed != want {
                return bad("Some of these payments were made online, so they can't be removed here.");
            }
        }
        let next_due = start.map(|d| d + Duration::days(new * freq as i64));
        sqlx::query(
            "UPDATE plans SET amount_paid = $1, status = $2, next_due_date = COALESCE($3, next_due_date) WHERE id = $4",
        )
        .bind(inst * new)
        .bind(if new >= nn { "completed" } else { "active" })
        .bind(next_due)
        .bind(plan_id)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
struct EditDetails {
    image_url: Option<String>,
    name: String,
    description: Option<String>,
    category: Option<String>,
}

async fn edit_details(u: AuthUser, State(s): State<AppState>, Path(id): Path<Uuid>, Json(b): Json<EditDetails>) -> AppResult<Json<Value>> {
    owned(&s, &u, id).await?;
    if b.name.trim().chars().count() < 2 {
        return bad("Give it a name");
    }
    let category = b.category.as_deref().unwrap_or("other");
    if !CATEGORIES.contains(&category) {
        return bad("Choose a valid category");
    }
    let description = b.description.as_deref().map(str::trim).filter(|d| !d.is_empty());
    if let Some(img) = b.image_url.as_deref() {
        if !img.starts_with("data:image/") || img.len() > 3_000_000 {
            return bad("That photo is not valid or is too large");
        }
        sqlx::query("UPDATE channels SET image_url = $1 WHERE id = $2")
            .bind(img)
            .bind(id)
            .execute(&s.db)
            .await?;
    }
    sqlx::query("UPDATE channels SET name = $1, description = $2, category = $3 WHERE id = $4")
        .bind(b.name.trim())
        .bind(description)
        .bind(category)
        .bind(id)
        .execute(&s.db)
        .await?;
    Ok(Json(json!({ "ok": true })))
}

async fn get_details(u: AuthUser, State(s): State<AppState>, Path(id): Path<Uuid>) -> AppResult<Json<Value>> {
    owned(&s, &u, id).await?;
    let (kind, name, description, category): (String, String, Option<String>, Option<String>) =
        sqlx::query_as("SELECT kind, name, description, category FROM channels WHERE id = $1")
            .bind(id)
            .fetch_one(&s.db)
            .await?;
    Ok(Json(json!({ "kind": kind, "name": name, "description": description, "category": category })))
}
