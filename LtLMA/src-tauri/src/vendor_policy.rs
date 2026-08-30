//! Keep-alive Phase 1 — vendor inactivity policy dataset + matcher.
//!
//! Bundled JSON suggests `keepalive_days` from `source_site` / product name.
//! Users can always override; unknown vendors return no suggestion.

use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

const BUNDLED_POLICIES: &str = include_str!("../data/vendor-policies.json");

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VendorPolicyDataset {
    pub version: u32,
    pub updated: String,
    pub notes: Option<String>,
    pub policies: Vec<VendorPolicy>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VendorPolicy {
    pub id: String,
    pub vendor: String,
    pub aliases: Vec<String>,
    #[serde(default)]
    pub product_hints: Vec<String>,
    pub keepalive_days: i64,
    pub source: String,
    pub last_verified: String,
    pub confidence: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VendorPolicySuggestion {
    pub matched: bool,
    pub keepalive_days: Option<i64>,
    pub vendor: Option<String>,
    pub confidence: Option<String>,
    pub source: Option<String>,
    pub last_verified: Option<String>,
    pub policy_id: Option<String>,
    pub dataset_version: u32,
    pub message: String,
}

fn load_dataset() -> VendorPolicyDataset {
    // Optional drop-in refresh without rebuilding the app:
    // `%APPDATA%/perpetua/vendor-policies.json` (or OS equivalent).
    let override_path = dirs::data_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("perpetua")
        .join("vendor-policies.json");
    if let Ok(text) = std::fs::read_to_string(&override_path) {
        if let Ok(parsed) = serde_json::from_str::<VendorPolicyDataset>(&text) {
            return parsed;
        }
    }
    serde_json::from_str(BUNDLED_POLICIES).expect("bundled vendor-policies.json must parse")
}

fn dataset() -> &'static VendorPolicyDataset {
    static DATASET: OnceLock<VendorPolicyDataset> = OnceLock::new();
    DATASET.get_or_init(load_dataset)
}

fn normalize(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Match against aliases (source_site) first, then product_name hints.
pub fn suggest_keepalive(
    source_site: Option<&str>,
    product_name: Option<&str>,
) -> VendorPolicySuggestion {
    let data = dataset();
    let site = source_site.map(normalize).unwrap_or_default();
    let product = product_name.map(normalize).unwrap_or_default();

    if site.is_empty() && product.is_empty() {
        return VendorPolicySuggestion {
            matched: false,
            keepalive_days: None,
            vendor: None,
            confidence: None,
            source: None,
            last_verified: None,
            policy_id: None,
            dataset_version: data.version,
            message: "unknown — set keep-alive days manually".to_string(),
        };
    }

    // Prefer exact/alias match on source_site.
    if !site.is_empty() {
        for policy in &data.policies {
            let aliases: Vec<String> = policy.aliases.iter().map(|a| normalize(a)).collect();
            if aliases.iter().any(|a| a == &site || site.contains(a) || a.contains(&site))
                && policy.id != "generic-saas-90"
            {
                return suggestion_from(policy, data.version);
            }
        }
    }

    // Product-name hints (weaker).
    if !product.is_empty() {
        for policy in &data.policies {
            for hint in &policy.product_hints {
                let h = normalize(hint);
                if !h.is_empty() && product.contains(&h) {
                    return suggestion_from(policy, data.version);
                }
            }
        }
    }

    VendorPolicySuggestion {
        matched: false,
        keepalive_days: None,
        vendor: None,
        confidence: None,
        source: None,
        last_verified: None,
        policy_id: None,
        dataset_version: data.version,
        message: "unknown — set keep-alive days manually".to_string(),
    }
}

fn suggestion_from(policy: &VendorPolicy, dataset_version: u32) -> VendorPolicySuggestion {
    VendorPolicySuggestion {
        matched: true,
        keepalive_days: Some(policy.keepalive_days),
        vendor: Some(policy.vendor.clone()),
        confidence: Some(policy.confidence.clone()),
        source: Some(policy.source.clone()),
        last_verified: Some(policy.last_verified.clone()),
        policy_id: Some(policy.id.clone()),
        dataset_version,
        message: format!(
            "Suggested {} days for {} (confidence: {}; verified {}). Override anytime.",
            policy.keepalive_days, policy.vendor, policy.confidence, policy.last_verified
        ),
    }
}

pub fn dataset_meta() -> serde_json::Value {
    let data = dataset();
    serde_json::json!({
        "version": data.version,
        "updated": data.updated,
        "policy_count": data.policies.len(),
        "notes": data.notes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn appsumo_source_suggests_90_days() {
        let s = suggest_keepalive(Some("AppSumo"), Some("Random Deal"));
        assert!(s.matched);
        assert_eq!(s.keepalive_days, Some(90));
        assert_eq!(s.policy_id.as_deref(), Some("appsumo"));
    }

    #[test]
    fn unknown_vendor_degrades_gracefully() {
        let s = suggest_keepalive(Some("totally-unknown-vendor-xyz"), Some("Widget"));
        assert!(!s.matched);
        assert!(s.keepalive_days.is_none());
        assert!(s.message.contains("manually"));
    }

    #[test]
    fn empty_input_asks_for_manual() {
        let s = suggest_keepalive(None, None);
        assert!(!s.matched);
    }

    #[test]
    fn product_hint_can_match_lifetime() {
        let s = suggest_keepalive(None, Some("Cool LTD Lifetime Suite"));
        assert!(s.matched);
        assert_eq!(s.keepalive_days, Some(90));
    }
}
