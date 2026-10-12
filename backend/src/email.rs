use crate::{
    error::{AppError, AppResult},
    state::AppState,
};
use serde_json::json;

pub fn esc(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/// Sends a 6-digit code. With no RESEND_API_KEY it prints the code in the terminal (dev mode).
pub async fn send_code(s: &AppState, to: &str, name: &str, code: &str, purpose: &str) -> AppResult<()> {
    let (subject, heading, intro) = if purpose == "reset" {
        ("Reset your Kobkart password", "Reset your password", "use the code below to reset your password.")
    } else {
        ("Verify your Kobkart email", "Verify your email", "use the code below to finish creating your account.")
    };

    if s.config.resend_api_key.is_empty() {
        tracing::warn!("DEV MODE (no RESEND_API_KEY): {purpose} code for {to}");
        println!("\n==========  Kobkart {purpose} code for {to}:  {code}  ==========\n");
        return Ok(());
    }

    let html = format!(
        r##"<div style="font-family:Arial,sans-serif;background:#f7eeee;padding:24px">
<div style="max-width:480px;margin:auto;background:#ffffff;border-radius:16px;padding:32px">
<div style="font-size:26px;font-weight:700;color:#6b0f1e">Kobkart</div>
<h2 style="color:#2a1a1d;margin:24px 0 8px">{heading}</h2>
<p style="color:#6f6366;font-size:15px;line-height:1.6">Hi {name}, {intro}</p>
<div style="font-size:34px;font-weight:700;letter-spacing:10px;color:#6b0f1e;background:#f3e1e1;border-radius:12px;padding:16px;text-align:center;margin:20px 0">{code}</div>
<p style="color:#6f6366;font-size:13px">This code expires in 15 minutes. If you did not ask for it, you can ignore this email.</p>
</div></div>"##,
        name = esc(name)
    );

    let res = s
        .http
        .post("https://api.resend.com/emails")
        .bearer_auth(&s.config.resend_api_key)
        .json(&json!({
            "from": s.config.email_from,
            "to": [to],
            "subject": subject,
            "html": html
        }))
        .send()
        .await?;

    if !res.status().is_success() {
        let body = res.text().await.unwrap_or_default();
        println!("\n==========  EMAIL FAILED. Code for {to}: {code}  ==========\n");
        return Err(AppError::Internal(format!("email send failed: {body}")));
    }
    Ok(())
}
pub fn naira(kobo: i64) -> String {
    let n = (kobo / 100).to_string();
    let mut out = String::new();
    for (i, c) in n.chars().enumerate() {
        if i > 0 && (n.len() - i) % 3 == 0 {
            out.push(',');
        }
        out.push(c);
    }
    format!("₦{out}")
}

/// Branded email. `body` must already be safe HTML (escape user text with esc()).
pub fn card(heading: &str, body: &str, cta: Option<(&str, &str)>) -> String {
    let button = cta
        .map(|(label, url)| {
            format!(
                r##"<p style="margin:22px 0 0"><a href="{url}" style="background:#6b0f1e;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">{label}</a></p>"##
            )
        })
        .unwrap_or_default();
    format!(
        r##"<div style="font-family:Arial,sans-serif;background:#f7eeee;padding:24px"><div style="max-width:480px;margin:auto;background:#ffffff;border-radius:16px;padding:32px"><div style="font-size:26px;font-weight:700;color:#6b0f1e">Kobkart</div><h2 style="color:#2a1a1d;margin:24px 0 8px">{heading}</h2><div style="color:#4a3d40;font-size:15px;line-height:1.6">{body}</div>{button}<p style="color:#9a8d90;font-size:12px;margin-top:26px">You are receiving this because you use Kobkart.</p></div></div>"##
    )
}

pub async fn send_html(s: &AppState, to: &str, subject: &str, html: String) -> AppResult<()> {
    if s.config.resend_api_key.is_empty() {
        tracing::warn!("DEV MODE (no RESEND_API_KEY): email '{subject}' to {to} was not sent");
        return Ok(());
    }
    let res = s
        .http
        .post("https://api.resend.com/emails")
        .bearer_auth(&s.config.resend_api_key)
        .json(&json!({ "from": s.config.email_from, "to": [to], "subject": subject, "html": html }))
        .send()
        .await?;
    if !res.status().is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(AppError::Internal(format!("email send failed: {body}")));
    }
    Ok(())
}
