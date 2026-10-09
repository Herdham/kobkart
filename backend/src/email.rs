use crate::{
    error::{AppError, AppResult},
    state::AppState,
};
use serde_json::json;

fn esc(s: &str) -> String {
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
        return Err(AppError::Internal(format!("email send failed: {body}")));
    }
    Ok(())
}