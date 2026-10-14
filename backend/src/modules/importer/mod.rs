use crate::{
    error::{AppError, AppResult},
    middleware::auth::AuthUser,
    modules::sellers::require_verified,
    state::AppState,
};
use axum::{extract::State, routing::post, Json, Router};
use chrono::{Duration, NaiveDate, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

pub fn routes() -> Router<AppState> {
    Router::new().route("/seller/import-group", post(import_group))
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