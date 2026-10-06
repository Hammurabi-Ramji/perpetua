//! Outbound email — used only for password-reset codes and (Pro) vault-sharing
//! invite codes. Perpetua has no hosted mail service: this sends through the
//! user's own SMTP relay, configured under Reminders in the app.

use anyhow::{anyhow, Result};
use lettre::message::header::ContentType;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};

use crate::models::AccountRecoverySettings;

pub async fn send_email(settings: &AccountRecoverySettings, to: &str, subject: &str, body: &str) -> Result<()> {
    let host = settings
        .smtp_host
        .as_deref()
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| anyhow!("SMTP relay isn't configured yet — set it under Reminders \u{2192} Backup email & account recovery."))?;
    let raw_port = settings.smtp_port.unwrap_or(587);
    let port = u16::try_from(raw_port)
        .ok()
        .filter(|p| *p >= 1)
        .ok_or_else(|| anyhow!("SMTP port {raw_port} is invalid — it must be between 1 and 65535."))?;
    let username = settings.smtp_username.clone().unwrap_or_default();
    let password = settings.smtp_password.clone().unwrap_or_default();
    let from = settings
        .smtp_from
        .as_deref()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or(&username);

    if from.is_empty() {
        return Err(anyhow!("SMTP \"from\" address isn't configured."));
    }

    let email = Message::builder()
        .from(from.parse()?)
        .to(to.parse()?)
        .subject(subject)
        .header(ContentType::TEXT_PLAIN)
        .body(body.to_string())?;

    // 465 = implicit TLS (SMTPS); 587 and anything else = STARTTLS upgrade.
    let builder = if port == 465 {
        AsyncSmtpTransport::<Tokio1Executor>::relay(host)?
    } else {
        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(host)?
    };
    let transport = builder
        .port(port)
        .timeout(Some(std::time::Duration::from_secs(20)))
        .credentials(Credentials::new(username, password))
        .build();

    transport
        .send(email)
        .await
        .map_err(|error| anyhow!("Failed to send email: {error}"))?;

    Ok(())
}
