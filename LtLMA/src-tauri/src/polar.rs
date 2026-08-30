//! Polar.sh license-key integration.
//!
//! Polar is the Merchant of Record: it handles checkout, global tax/VAT, fraud,
//! and issues + emails a license key on purchase. The customer-portal license
//! endpoints are public (no auth) and explicitly safe to call from a desktop
//! client, so activation works without shipping any secret.
//!
//! We use the *activate* endpoint at unlock time: it confirms the key is real
//! and `granted`, reserves a device slot (enforcing per-purchase activation
//! limits), and returns an activation id we store locally. After that, daily use
//! is gated on the local `pro` flag — fully offline, true to local-first.

use anyhow::{anyhow, Result};
use serde::Deserialize;

const POLAR_API_BASE: &str = match option_env!("POLAR_API_BASE") {
    Some(base) => base,
    None => "https://api.polar.sh",
};

/// The Polar organization that owns the product. Public (not a secret), embedded
/// at build time. Empty => Polar disabled and the offline key path is used.
/// Set `POLAR_ORGANIZATION_ID` at build time to enable real Polar activation.
pub const POLAR_ORGANIZATION_ID: &str = match option_env!("POLAR_ORGANIZATION_ID") {
    Some(id) => id,
    None => "",
};

pub fn is_configured() -> bool {
    !POLAR_ORGANIZATION_ID.is_empty()
}

#[derive(Debug, Deserialize)]
pub struct LicenseKeyRead {
    /// "granted" | "revoked" | "disabled"
    pub status: String,
}

#[derive(Debug, Deserialize)]
pub struct PolarActivation {
    /// The activation instance id — stored locally as proof of device activation.
    pub id: String,
    pub license_key: LicenseKeyRead,
}

/// Reserve a device activation for `key` against the configured Polar org.
/// A 200 means the key exists and a slot was granted.
pub async fn activate(key: &str, label: &str) -> Result<PolarActivation> {
    let client = reqwest::Client::new();
    let response = client
        .post(format!(
            "{POLAR_API_BASE}/v1/customer-portal/license-keys/activate"
        ))
        .json(&serde_json::json!({
            "key": key.trim(),
            "organization_id": POLAR_ORGANIZATION_ID,
            "label": label,
        }))
        .send()
        .await
        .map_err(|error| anyhow!("Could not reach the licensing server: {error}"))?;

    let status = response.status();
    if status == reqwest::StatusCode::NOT_FOUND {
        return Err(anyhow!("That license key was not found."));
    }
    if status == reqwest::StatusCode::FORBIDDEN {
        return Err(anyhow!("This key has reached its device activation limit."));
    }
    if !status.is_success() {
        return Err(anyhow!("Activation failed (server returned {status})."));
    }

    let activation: PolarActivation = response
        .json()
        .await
        .map_err(|error| anyhow!("Unexpected activation response: {error}"))?;

    if activation.license_key.status != "granted" {
        return Err(anyhow!(
            "This key is {} and can't be used.",
            activation.license_key.status
        ));
    }

    Ok(activation)
}
