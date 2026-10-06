//! Outbound email — used only for password-reset codes, (Pro) vault-sharing
//! invite codes, the cloud-backup recovery-key safety net, and the "send a
//! test email" button. Perpetua has no hosted mail service: this sends through
//! the user's own SMTP relay, configured under Reminders in the app.

use anyhow::{anyhow, Result};
use lettre::message::header::ContentType;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use std::time::Duration;

use crate::models::AccountRecoverySettings;

/// Default when the user leaves the port blank. 587 is the submission port
/// virtually every provider documents, and it speaks STARTTLS.
pub const DEFAULT_SMTP_PORT: u16 = 587;

/// How long a single SMTP round-trip may take before the UI gets an error
/// instead of an infinite spinner.
const SMTP_TIMEOUT: Duration = Duration::from_secs(30);

/// Which TLS mode a port implies. SMTP has two incompatible conventions:
/// port 465 expects a TLS handshake *before* any SMTP traffic (implicit TLS,
/// "SMTPS"), while 587 (and 25) start in plaintext and upgrade via STARTTLS.
/// Picking the wrong one doesn't produce a clear "wrong mode" error — the
/// connection just hangs or fails during the handshake — so the mode is
/// derived from the port rather than asked of the user.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TlsMode {
    Implicit,
    StartTls,
}

pub fn tls_mode_for_port(port: u16) -> TlsMode {
    match port {
        465 => TlsMode::Implicit,
        _ => TlsMode::StartTls,
    }
}

/// Validates and normalizes the stored port. `None`/blank falls back to 587;
/// anything outside 1..=65535 is rejected rather than silently truncated.
pub fn resolve_port(raw: Option<i64>) -> Result<u16> {
    match raw {
        None => Ok(DEFAULT_SMTP_PORT),
        Some(port) if (1..=65_535).contains(&port) => Ok(port as u16),
        Some(port) => Err(anyhow!("SMTP port {port} is out of range (1–65535).")),
    }
}

pub async fn send_email(settings: &AccountRecoverySettings, to: &str, subject: &str, body: &str) -> Result<()> {
    let host = settings
        .smtp_host
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .ok_or_else(|| anyhow!("SMTP relay isn't configured yet — set it under Reminders \u{2192} Backup email & account recovery."))?;
    let port = resolve_port(settings.smtp_port)?;
    let username = settings.smtp_username.clone().unwrap_or_default();
    let password = settings.smtp_password.clone().unwrap_or_default();
    let from = settings
        .smtp_from
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .unwrap_or(&username);

    if from.is_empty() {
        return Err(anyhow!("SMTP \"from\" address isn't configured."));
    }

    let email = Message::builder()
        .from(from.parse().map_err(|_| anyhow!("SMTP \"from\" address isn't a valid email address."))?)
        .to(to.parse().map_err(|_| anyhow!("Recipient address isn't a valid email address."))?)
        .subject(subject)
        .header(ContentType::TEXT_PLAIN)
        .body(body.to_string())?;

    let builder = match tls_mode_for_port(port) {
        TlsMode::Implicit => AsyncSmtpTransport::<Tokio1Executor>::relay(host)?,
        TlsMode::StartTls => AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(host)?,
    };
    let mut builder = builder.port(port).timeout(Some(SMTP_TIMEOUT));
    if !username.is_empty() {
        builder = builder.credentials(Credentials::new(username, password));
    }
    let transport = builder.build();

    transport.send(email).await.map_err(|error| {
        crate::diag::log(&format!("smtp send to {host}:{port} failed: {error}"));
        anyhow!("Failed to send email via {host}:{port}: {error}")
    })?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn port_465_is_implicit_tls_everything_else_starttls() {
        assert_eq!(tls_mode_for_port(465), TlsMode::Implicit);
        assert_eq!(tls_mode_for_port(587), TlsMode::StartTls);
        assert_eq!(tls_mode_for_port(25), TlsMode::StartTls);
        assert_eq!(tls_mode_for_port(2525), TlsMode::StartTls);
    }

    #[test]
    fn port_resolution_defaults_and_bounds() {
        assert_eq!(resolve_port(None).unwrap(), 587);
        assert_eq!(resolve_port(Some(465)).unwrap(), 465);
        assert!(resolve_port(Some(0)).is_err());
        assert!(resolve_port(Some(70_000)).is_err());
        assert!(resolve_port(Some(-1)).is_err());
    }
}
