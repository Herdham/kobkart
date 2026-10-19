use crate::{
    error::{AppError, AppResult},
    middleware::auth::AuthUser,
    modules::products::pick,
    state::AppState,
};
use axum::{
    extract::{Path, State},
    routing::{get, post, put},
    Json, Router,
};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::FromRow;
use uuid::Uuid;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/baskets/mine", get(mine))
        .route("/baskets/add", post(add_item))
        .route("/baskets/{plan_id}", get(one))
        .route("/basket-items/{id}", put(change_qty).delete(remove_item))
        .route("/seller/baskets", get(seller_baskets))
        .route("/seller/channels/{id}/budget", get(get_budget).put(set_budget))
}

fn bad<T>(m: &str) -> AppResult<T> {
    Err(AppError::BadRequest(m.into()))
}

fn naira(kobo: i64) -> String {
    let s = (kobo / 100).to_string();
    let mut out = String::new();
    for (i, c) in s.chars().enumerate() {
        if i > 0 && (s.len() - i) % 3 == 0 {
            out.push(',');
        }
        out.push(c);
    }
    format!("₦{out}")
}

fn clean(v: Option<String>, max: usize) -> AppResult<Option<String>> {
    let t = v.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    if t.as_ref().map_or(false, |s| s.chars().count() > max) {
        return bad("That note is too long");
    }
    Ok(t)
}

#[derive(Serialize, FromRow, Clone)]
struct Item {
    id: Uuid,
    plan_id: Uuid,
    product_id: Uuid,
    name: String,
    unit_price: i64,
    quantity: i32,
    color: Option<String>,
    size: Option<String>,
    note: Option<String>,
}

fn spent_of(items: &[Item]) -> i64 {
    items.iter().map(|i| i.unit_price * i.quantity as i64).sum()
}

async fn items_for(s: &AppState, plan_ids: &[Uuid]) -> AppResult<Vec<Item>> {
    let rows = sqlx::query_as::<_, Item>(
        "SELECT id, plan_id, product_id, name, unit_price, quantity, color, size, note
         FROM basket_items WHERE plan_id = ANY($1) ORDER BY created_at, id",
    )
    .bind(plan_ids)
    .fetch_all(&s.db)
    .await?;
    Ok(rows)
}

#[derive(FromRow)]
struct PlanRow {
    id: Uuid,
    channel_id: Uuid,
    customer_id: Option<Uuid>,
    locked_price: i64,
    amount_paid: i64,
    status: String,
    kind: String,
    seller_id: Uuid,
}

async fn load_plan(s: &AppState, plan_id: Uuid) -> AppResult<PlanRow> {
    let p: PlanRow = sqlx::query_as(
        "SELECT p.id, p.channel_id, p.customer_id, p.locked_price, p.amount_paid, p.status, c.kind, c.seller_id
         FROM plans p JOIN channels c ON c.id = p.channel_id WHERE p.id = $1",
    )
    .bind(plan_id)
    .fetch_one(&s.db)
    .await?;
    Ok(p)
}

/// A basket can be changed until it is fully paid (groups: until the member has collected).
async fn ensure_editable(s: &AppState, p: &PlanRow) -> AppResult<()> {
    if p.status != "active" {
        return bad("This basket is locked because it is fully paid. Please talk to your seller about any change.");
    }
    if p.kind == "rotation" {
        let collected: Option<bool> = sqlx::query_scalar(
            "SELECT r.collected FROM rotation_members m
             JOIN rotation_rounds r ON r.channel_id = m.channel_id AND r.round_no = m.position
             WHERE m.plan_id = $1",
        )
        .bind(p.id)
        .fetch_optional(&s.db)
        .await?;
        if collected == Some(true) {
            return bad("You have already collected, so your basket is locked.");
        }
    }
    Ok(())
}

/// Keeps a short text like "Cap x2, Bag; ₦500 balance" on the plan, so every existing list shows the basket.
async fn refresh_summary(s: &AppState, plan_id: Uuid, budget: i64) -> AppResult<()> {
    let items = items_for(s, &[plan_id]).await?;
    let note: Option<String> = if items.is_empty() {
        None
    } else {
        let parts: Vec<String> = items
            .iter()
            .map(|i| if i.quantity > 1 { format!("{} x{}", i.name, i.quantity) } else { i.name.clone() })
            .collect();
        let mut text = parts.join(", ");
        if text.chars().count() > 110 {
            text = text.chars().take(107).collect::<String>() + "...";
        }
        let left = budget - spent_of(&items);
        if left > 0 {
            text = format!("{text}; {} balance", naira(left));
        }
        Some(text)
    };
    sqlx::query("UPDATE plans SET choice_note = $1 WHERE id = $2")
        .bind(note)
        .bind(plan_id)
        .execute(&s.db)
        .await?;
    Ok(())
}

fn over_budget(left: i64) -> String {
    format!(
        "That is more than your budget. You have {} left. If you want more, please talk to your seller directly.",
        naira(left.max(0))
    )
}

/* ---------------- customer ---------------- */

#[derive(Deserialize)]
struct AddReq {
    product_id: Uuid,
    quantity: Option<i32>,
    color: Option<String>,
    size: Option<String>,
    note: Option<String>,
}

/// Adds an item to the customer's basket. The first item in a budget package also joins them.
async fn add_item(u: AuthUser, State(s): State<AppState>, Json(b): Json<AddReq>) -> AppResult<Json<Value>> {
    u.require("customer")?;
    let qty = b.quantity.unwrap_or(1);
    if !(1..=50).contains(&qty) {
        return bad("Quantity must be between 1 and 50");
    }
    let note = clean(b.note, 120)?;

    let row: Option<(Uuid, String, i64, bool, String, Option<i64>, i64, i32, bool)> = sqlx::query_as(
        "SELECT p.channel_id, p.name, p.price, p.active, c.kind, c.basket_budget,
                c.contribution_amount, c.frequency_days, c.archived_at IS NOT NULL
         FROM products p JOIN channels c ON c.id = p.channel_id WHERE p.id = $1",
    )
    .bind(b.product_id)
    .fetch_optional(&s.db)
    .await?;
    let (channel_id, name, price, active, kind, budget_opt, contribution, freq, closed) =
        row.ok_or(AppError::NotFound)?;
    if !active {
        return bad("This item is no longer available");
    }
    if closed {
        return bad("This package is closed and not taking new customers.");
    }

    let opts: Vec<(String, String, bool)> =
        sqlx::query_as("SELECT kind, label, sold_out FROM product_options WHERE product_id = $1")
            .bind(b.product_id)
            .fetch_all(&s.db)
            .await?;
    let color = pick(&opts, "color", b.color.as_deref())?;
    let size = pick(&opts, "size", b.size.as_deref())?;

    let plan_id: Uuid = if kind == "rotation" {
        let found: Option<Uuid> =
            sqlx::query_scalar("SELECT plan_id FROM rotation_members WHERE channel_id = $1 AND user_id = $2")
                .bind(channel_id)
                .bind(u.id)
                .fetch_optional(&s.db)
                .await?;
        found.ok_or_else(|| AppError::BadRequest("Join this group first, then fill your basket.".into()))?
    } else {
        let Some(budget) = budget_opt else {
            return bad("This package takes one item at a time. Use Join with this item.");
        };
        let existing: Option<Uuid> = sqlx::query_scalar(
            "SELECT p.id FROM plans p JOIN channels c ON c.id = p.channel_id
             WHERE p.customer_id = $1 AND p.channel_id = $2 AND p.status = 'active'
               AND p.product_id = c.basket_product_id
             ORDER BY p.created_at DESC LIMIT 1",
        )
        .bind(u.id)
        .bind(channel_id)
        .fetch_optional(&s.db)
        .await?;
        match existing {
            Some(id) => id,
            None => {
                if crate::modules::rotation::has_defaulted(&s, u.id).await? {
                    return bad("You have overdue payments in a group. Please catch up before joining a new package.");
                }
                crate::modules::billing::ensure_capacity_channel(&s, channel_id, 1).await?;
                let basket_product: Option<Uuid> =
                    sqlx::query_scalar("SELECT basket_product_id FROM channels WHERE id = $1")
                        .bind(channel_id)
                        .fetch_one(&s.db)
                        .await?;
                let basket_product =
                    basket_product.ok_or_else(|| AppError::Internal("Basket is not set up".into()))?;
                let due = Utc::now().date_naive() + Duration::days(freq as i64);
                sqlx::query_scalar(
                    "INSERT INTO plans (customer_id, channel_id, product_id, locked_price, installment_amount, next_due_date)
                     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
                )
                .bind(u.id)
                .bind(channel_id)
                .bind(basket_product)
                .bind(budget)
                .bind(contribution.min(budget))
                .bind(due)
                .fetch_one(&s.db)
                .await?
            }
        }
    };

    let plan = load_plan(&s, plan_id).await?;
    if plan.customer_id != Some(u.id) {
        return Err(AppError::Forbidden);
    }
    ensure_editable(&s, &plan).await?;
    let budget = plan.locked_price;
    let items = items_for(&s, &[plan_id]).await?;
    let spent = spent_of(&items);
    let line = price * qty as i64;
    if spent + line > budget {
        return bad(&over_budget(budget - spent));
    }

    let same: Option<(Uuid, i32)> = sqlx::query_as(
        "SELECT id, quantity FROM basket_items
         WHERE plan_id = $1 AND product_id = $2
           AND color IS NOT DISTINCT FROM $3 AND size IS NOT DISTINCT FROM $4 AND note IS NOT DISTINCT FROM $5",
    )
    .bind(plan_id)
    .bind(b.product_id)
    .bind(&color)
    .bind(&size)
    .bind(&note)
    .fetch_optional(&s.db)
    .await?;
    match same {
        Some((id, q)) => {
            if q + qty > 50 {
                return bad("You can order up to 50 of the same item");
            }
            sqlx::query("UPDATE basket_items SET quantity = $1 WHERE id = $2")
                .bind(q + qty)
                .bind(id)
                .execute(&s.db)
                .await?;
        }
        None => {
            if items.len() >= 40 {
                return bad("Your basket has too many different items. Please remove one first.");
            }
            sqlx::query(
                "INSERT INTO basket_items (plan_id, product_id, name, unit_price, quantity, color, size, note)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            )
            .bind(plan_id)
            .bind(b.product_id)
            .bind(&name)
            .bind(price)
            .bind(qty)
            .bind(&color)
            .bind(&size)
            .bind(&note)
            .execute(&s.db)
            .await?;
        }
    }
    refresh_summary(&s, plan_id, budget).await?;
    Ok(Json(json!({ "plan_id": plan_id, "remaining": budget - spent - line })))
}

#[derive(Deserialize)]
struct QtyReq {
    quantity: i32,
}

async fn change_qty(u: AuthUser, State(s): State<AppState>, Path(id): Path<Uuid>, Json(b): Json<QtyReq>) -> AppResult<Json<Value>> {
    u.require("customer")?;
    if !(1..=50).contains(&b.quantity) {
        return bad("Quantity must be between 1 and 50");
    }
    let (plan_id, unit, old): (Uuid, i64, i32) =
        sqlx::query_as("SELECT plan_id, unit_price, quantity FROM basket_items WHERE id = $1")
            .bind(id)
            .fetch_one(&s.db)
            .await?;
    let plan = load_plan(&s, plan_id).await?;
    if plan.customer_id != Some(u.id) {
        return Err(AppError::Forbidden);
    }
    ensure_editable(&s, &plan).await?;
    let items = items_for(&s, &[plan_id]).await?;
    let spent = spent_of(&items);
    if spent - unit * old as i64 + unit * b.quantity as i64 > plan.locked_price {
        return bad(&over_budget(plan.locked_price - spent));
    }
    sqlx::query("UPDATE basket_items SET quantity = $1 WHERE id = $2")
        .bind(b.quantity)
        .bind(id)
        .execute(&s.db)
        .await?;
    refresh_summary(&s, plan_id, plan.locked_price).await?;
    Ok(Json(json!({ "ok": true })))
}

async fn remove_item(u: AuthUser, State(s): State<AppState>, Path(id): Path<Uuid>) -> AppResult<Json<Value>> {
    u.require("customer")?;
    let plan_id: Uuid = sqlx::query_scalar("SELECT plan_id FROM basket_items WHERE id = $1")
        .bind(id)
        .fetch_one(&s.db)
        .await?;
    let plan = load_plan(&s, plan_id).await?;
    if plan.customer_id != Some(u.id) {
        return Err(AppError::Forbidden);
    }
    ensure_editable(&s, &plan).await?;
    sqlx::query("DELETE FROM basket_items WHERE id = $1")
        .bind(id)
        .execute(&s.db)
        .await?;
    refresh_summary(&s, plan_id, plan.locked_price).await?;
    Ok(Json(json!({ "ok": true })))
}

/// One basket, for the basket page.
async fn one(u: AuthUser, State(s): State<AppState>, Path(plan_id): Path<Uuid>) -> AppResult<Json<Value>> {
    let p = load_plan(&s, plan_id).await?;
    if p.customer_id != Some(u.id) && p.seller_id != u.id {
        return Err(AppError::Forbidden);
    }
    let items = items_for(&s, &[plan_id]).await?;
    let (cname, code, seller): (String, String, String) = sqlx::query_as(
        "SELECT c.name, c.invite_code, sl.business_name FROM channels c
         JOIN sellers sl ON sl.user_id = c.seller_id WHERE c.id = $1",
    )
    .bind(p.channel_id)
    .fetch_one(&s.db)
    .await?;
    let spent = spent_of(&items);
    let editable = p.customer_id == Some(u.id) && ensure_editable(&s, &p).await.is_ok();
    Ok(Json(json!({
        "plan_id": p.id,
        "channel": { "id": p.channel_id, "name": cname, "invite_code": code, "kind": p.kind, "seller": seller },
        "budget": p.locked_price,
        "paid": p.amount_paid,
        "spent": spent,
        "remaining": p.locked_price - spent,
        "status": p.status,
        "editable": editable,
        "items": items
    })))
}

#[derive(FromRow)]
struct MineRow {
    id: Uuid,
    channel_id: Uuid,
    channel_name: String,
    seller_name: String,
    kind: String,
    invite_code: String,
    locked_price: i64,
    amount_paid: i64,
    status: String,
}

/// The customer's baskets: budget packages they joined, and groups that have items to pick from.
async fn mine(u: AuthUser, State(s): State<AppState>) -> AppResult<Json<Vec<Value>>> {
    u.require("customer")?;
    let plans: Vec<MineRow> = sqlx::query_as(
        "SELECT p.id, p.channel_id, c.name AS channel_name, sl.business_name AS seller_name, c.kind, c.invite_code,
                p.locked_price, p.amount_paid, p.status
         FROM plans p
         JOIN channels c ON c.id = p.channel_id
         JOIN sellers sl ON sl.user_id = c.seller_id
         WHERE p.customer_id = $1 AND p.status IN ('active', 'completed', 'delivered')
           AND (
             (c.kind = 'save' AND c.basket_product_id IS NOT NULL AND p.product_id = c.basket_product_id)
             OR (c.kind = 'rotation' AND EXISTS (SELECT 1 FROM products x WHERE x.channel_id = c.id AND x.active))
           )
         ORDER BY p.created_at DESC",
    )
    .bind(u.id)
    .fetch_all(&s.db)
    .await?;
    let ids: Vec<Uuid> = plans.iter().map(|p| p.id).collect();
    let items = items_for(&s, &ids).await?;
    let out: Vec<Value> = plans
        .iter()
        .map(|p| {
            let its: Vec<&Item> = items.iter().filter(|i| i.plan_id == p.id).collect();
            let spent: i64 = its.iter().map(|i| i.unit_price * i.quantity as i64).sum();
            json!({
                "plan_id": p.id,
                "channel_id": p.channel_id,
                "channel_name": p.channel_name,
                "seller": p.seller_name,
                "kind": p.kind,
                "invite_code": p.invite_code,
                "budget": p.locked_price,
                "paid": p.amount_paid,
                "status": p.status,
                "spent": spent,
                "remaining": p.locked_price - spent,
                "items": its
            })
        })
        .collect();
    Ok(Json(out))
}

/* ---------------- seller ---------------- */

#[derive(FromRow)]
struct SellerRow {
    id: Uuid,
    channel_id: Uuid,
    channel_name: String,
    kind: String,
    customer_name: String,
    customer_phone: String,
    locked_price: i64,
    amount_paid: i64,
    status: String,
}

/// Every basket with at least one item, across the seller's packages and groups.
async fn seller_baskets(u: AuthUser, State(s): State<AppState>) -> AppResult<Json<Vec<Value>>> {
    u.require("seller")?;
    let plans: Vec<SellerRow> = sqlx::query_as(
        "SELECT p.id, p.channel_id, c.name AS channel_name, c.kind, us.full_name AS customer_name,
                COALESCE(us.whatsapp, us.phone) AS customer_phone, p.locked_price, p.amount_paid, p.status
         FROM plans p
         JOIN channels c ON c.id = p.channel_id
         JOIN users us ON us.id = p.customer_id
         WHERE c.seller_id = $1 AND p.status <> 'cancelled'
           AND EXISTS (SELECT 1 FROM basket_items b WHERE b.plan_id = p.id)
         ORDER BY (p.status = 'delivered'), p.created_at DESC",
    )
    .bind(u.id)
    .fetch_all(&s.db)
    .await?;
    let ids: Vec<Uuid> = plans.iter().map(|p| p.id).collect();
    let items = items_for(&s, &ids).await?;
    let out: Vec<Value> = plans
        .iter()
        .map(|p| {
            let its: Vec<&Item> = items.iter().filter(|i| i.plan_id == p.id).collect();
            let spent: i64 = its.iter().map(|i| i.unit_price * i.quantity as i64).sum();
            json!({
                "plan_id": p.id,
                "channel_id": p.channel_id,
                "channel_name": p.channel_name,
                "kind": p.kind,
                "customer_name": p.customer_name,
                "customer_phone": p.customer_phone,
                "budget": p.locked_price,
                "paid": p.amount_paid,
                "status": p.status,
                "spent": spent,
                "remaining": p.locked_price - spent,
                "items": its
            })
        })
        .collect();
    Ok(Json(out))
}

async fn owned_channel(s: &AppState, u: &AuthUser, id: Uuid) -> AppResult<(String, Option<i64>, Option<Uuid>)> {
    u.require("seller")?;
    let (seller_id, kind, budget, product): (Uuid, String, Option<i64>, Option<Uuid>) = sqlx::query_as(
        "SELECT seller_id, kind, basket_budget, basket_product_id FROM channels WHERE id = $1",
    )
    .bind(id)
    .fetch_one(&s.db)
    .await?;
    if seller_id != u.id {
        return Err(AppError::Forbidden);
    }
    Ok((kind, budget, product))
}

async fn active_baskets(s: &AppState, product: Option<Uuid>) -> AppResult<i64> {
    match product {
        Some(pid) => {
            let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM plans WHERE product_id = $1 AND status = 'active'")
                .bind(pid)
                .fetch_one(&s.db)
                .await?;
            Ok(n)
        }
        None => Ok(0),
    }
}

async fn get_budget(u: AuthUser, State(s): State<AppState>, Path(id): Path<Uuid>) -> AppResult<Json<Value>> {
    let (kind, budget, product) = owned_channel(&s, &u, id).await?;
    let active = active_baskets(&s, product).await?;
    Ok(Json(json!({ "kind": kind, "budget": budget, "active_baskets": active })))
}

#[derive(Deserialize)]
struct BudgetReq {
    budget: Option<i64>, // kobo, or null to switch off
}

async fn set_budget(u: AuthUser, State(s): State<AppState>, Path(id): Path<Uuid>, Json(b): Json<BudgetReq>) -> AppResult<Json<Value>> {
    let (kind, _, product) = owned_channel(&s, &u, id).await?;
    if kind != "save" {
        return bad("Budget baskets are for Save & Collect packages. Groups use their pot as the budget.");
    }
    match b.budget {
        Some(k) => {
            if !(100_000..=10_000_000_000).contains(&k) {
                return bad("The budget must be between ₦1,000 and ₦100,000,000");
            }
            let pid: Uuid = match product {
                Some(pid) => {
                    sqlx::query("UPDATE products SET price = $1 WHERE id = $2")
                        .bind(k)
                        .bind(pid)
                        .execute(&s.db)
                        .await?;
                    pid
                }
                None => {
                    sqlx::query_scalar(
                        "INSERT INTO products (channel_id, name, price, active) VALUES ($1, 'Basket', $2, FALSE) RETURNING id",
                    )
                    .bind(id)
                    .bind(k)
                    .fetch_one(&s.db)
                    .await?
                }
            };
            sqlx::query("UPDATE channels SET basket_budget = $1, basket_product_id = $2 WHERE id = $3")
                .bind(k)
                .bind(pid)
                .bind(id)
                .execute(&s.db)
                .await?;
        }
        None => {
            if active_baskets(&s, product).await? > 0 {
                return bad("Some customers are still paying with a basket. You can switch this off when they finish.");
            }
            sqlx::query("UPDATE channels SET basket_budget = NULL WHERE id = $1")
                .bind(id)
                .execute(&s.db)
                .await?;
        }
    }
    Ok(Json(json!({ "ok": true })))
}
