use crate::{
    email::{card, esc, naira, send_html},
    error::{AppError, AppResult},
    state::AppState,
};
use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use chrono::NaiveDate;
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::FromRow;
use uuid::Uuid;

pub fn routes() -> Router<AppState> {
    Router::new().route("/jobs/reminders", get(reminders))
}

#[derive(Deserialize)]
struct KeyQ {
    key: String,
}

#[derive(FromRow)]
struct Due {
    id: Uuid,
    email: String,
    full_name: String,
    item: String,
    package: String,
    seller: String,
    due_amount: i64,
    next_due_date: NaiveDate,
    days: i32,
}

#[derive(FromRow)]
struct Late {
    seller_id: Uuid,
    email: String,
    business_name: String,
    late_count: i64,
    names: String,
}

/// Remember that something was sent, so a repeated call never emails twice.
async fn first_time(s: &AppState, key: &str) -> AppResult<bool> {
    let r = sqlx::query("INSERT INTO reminder_log (key) VALUES ($1) ON CONFLICT DO NOTHING")
        .bind(key)
        .execute(&s.db)
        .await?;
    Ok(r.rows_affected() == 1)
}

async fn forget(s: &AppState, key: &str) {
    let _ = sqlx::query("DELETE FROM reminder_log WHERE key = $1").bind(key).execute(&s.db).await;
}

/// A free timer service calls this once every morning.
async fn reminders(State(s): State<AppState>, Query(q): Query<KeyQ>) -> AppResult<Json<Value>> {
    if s.config.cron_secret.is_empty() || q.key != s.config.cron_secret {
        return Err(AppError::Unauthorized);
    }
    let base = s.config.frontend_url.clone();

    // 1. customers: due tomorrow, due today, and 1, 3 and 7 days late
    let due: Vec<Due> = sqlx::query_as(
        "SELECT p.id, u.email, u.full_name, COALESCE(pr.name, c.name) AS item, c.name AS package,
                sl.business_name AS seller,
                LEAST(p.installment_amount, p.locked_price - p.amount_paid) AS due_amount,
                p.next_due_date, (p.next_due_date - CURRENT_DATE)::int AS days
         FROM plans p
         JOIN users u ON u.id = p.customer_id
         JOIN channels c ON c.id = p.channel_id
         JOIN sellers sl ON sl.user_id = c.seller_id
         LEFT JOIN products pr ON pr.id = p.product_id
         WHERE p.status = 'active' AND u.suspended_at IS NULL AND u.email_verified
           AND (c.kind = 'save' OR c.rotation_status = 'running')
           AND (p.next_due_date - CURRENT_DATE) IN (1, 0, -1, -3, -7)",
    )
    .fetch_all(&s.db)
    .await?;

    let mut members = 0;
    for d in due {
        let key = format!("due{}:{}:{}", d.days, d.id, d.next_due_date);
        if !first_time(&s, &key).await? {
            continue;
        }
        let date = d.next_due_date.format("%-d %B").to_string();
        let (subject, heading, when) = match d.days {
            1 => ("Your Kobkart payment is due tomorrow".to_string(), "Payment due tomorrow", format!("is due tomorrow ({date})")),
            0 => ("Your Kobkart payment is due today".to_string(), "Payment due today", "is due today".to_string()),
            n => {
                let late = -n;
                (
                    format!("Your Kobkart payment is {late} day{} late", if late == 1 { "" } else { "s" }),
                    "Payment overdue",
                    format!("was due on {date}"),
                )
            }
        };
        let first = esc(d.full_name.split_whitespace().next().unwrap_or("there"));
        let body = format!(
            "<p>Hi {first}, your <b>{}</b> payment for <b>{}</b> ({}) {when}.</p><p>Seller: {}</p>",
            naira(d.due_amount),
            esc(&d.item),
            esc(&d.package),
            esc(&d.seller)
        );
        let url = format!("{base}/dashboard");
        let html = card(heading, &body, Some(("Pay now", &url)));
        match send_html(&s, &d.email, &subject, html).await {
            Ok(_) => members += 1,
            Err(e) => {
                tracing::error!("reminder failed for plan {}: {e:?}", d.id);
                forget(&s, &key).await;
            }
        }
    }

    // 2. sellers: one daily summary of who is behind
    let late: Vec<Late> = sqlx::query_as(
        "SELECT c.seller_id, su.email, sl.business_name, COUNT(*) AS late_count,
                string_agg(COALESCE(u.full_name, p.guest_name), ', ' ORDER BY p.next_due_date) AS names
         FROM plans p
         JOIN channels c ON c.id = p.channel_id
         JOIN sellers sl ON sl.user_id = c.seller_id
         JOIN users su ON su.id = c.seller_id
         LEFT JOIN users u ON u.id = p.customer_id
         WHERE p.status = 'active' AND p.next_due_date < CURRENT_DATE
           AND (c.kind = 'save' OR c.rotation_status = 'running') AND su.suspended_at IS NULL
         GROUP BY c.seller_id, su.email, sl.business_name",
    )
    .fetch_all(&s.db)
    .await?;

    let mut sellers = 0;
    for l in late {
        let key = format!("sum:{}:{}", l.seller_id, chrono::Utc::now().date_naive());
        if !first_time(&s, &key).await? {
            continue;
        }
        let shown: Vec<String> = l.names.split(", ").take(10).map(esc).collect();
        let more = l.late_count as usize - shown.len().min(l.late_count as usize);
        let body = format!(
            "<p>Hi {}, <b>{}</b> {} behind on payments today:</p><p>{}{}</p><p>Open Kobkart to remind them on WhatsApp.</p>",
            esc(&l.business_name),
            l.late_count,
            if l.late_count == 1 { "person is" } else { "people are" },
            shown.join(", "),
            if more > 0 { format!(" and {more} more") } else { String::new() }
        );
        let url = format!("{base}/customers");
        let html = card("Who is behind today", &body, Some(("Open Kobkart", &url)));
        match send_html(&s, &l.email, "Who is behind on payments today", html).await {
            Ok(_) => sellers += 1,
            Err(e) => {
                tracing::error!("seller summary failed: {e:?}");
                forget(&s, &key).await;
            }
        }
    }

    Ok(Json(json!({ "members_emailed": members, "sellers_emailed": sellers })))
}
