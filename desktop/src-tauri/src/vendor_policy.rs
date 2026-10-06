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
    /// Days of inactivity the vendor tolerates. `None` means the vendor
    /// publishes no inactivity requirement for this plan (see `note`).
    #[serde(default)]
    pub keepalive_days: Option<i64>,
    /// `vendor` (a product's own policy), `marketplace` (default window only),
    /// or `fallback` (weak generic hint, matched last).
    #[serde(default = "default_kind")]
    pub kind: String,
    /// Plan-specific nuance shown with the suggestion.
    #[serde(default)]
    pub note: Option<String>,
    pub source: String,
    pub last_verified: String,
    pub confidence: String,
}

fn default_kind() -> String {
    "marketplace".to_string()
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
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// True when `needle` appears in `haystack` as whole words (both already
/// normalized), so the alias "ph" matches "ph" but not "philips".
fn has_phrase(haystack: &str, needle: &str) -> bool {
    !needle.is_empty() && format!(" {haystack} ").contains(&format!(" {needle} "))
}

fn is_fallback(policy: &VendorPolicy) -> bool {
    policy.kind == "fallback" || policy.id == "generic-saas-90"
}

fn hint_matches(policy: &VendorPolicy, product: &str) -> bool {
    policy
        .product_hints
        .iter()
        .any(|hint| has_phrase(product, &normalize(hint)))
}

/// Match order: a product's own vendor policy (by product name), then the
/// marketplace/vendor alias on source_site, then weaker generic hints.
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

    // A product's own vendor policy beats the marketplace it was bought on.
    if !product.is_empty() {
        if let Some(policy) = data
            .policies
            .iter()
            .find(|p| p.kind == "vendor" && hint_matches(p, &product))
        {
            return suggestion_from(policy, data.version);
        }
    }

    // Alias match on source_site.
    if !site.is_empty() {
        for policy in &data.policies {
            let aliases: Vec<String> = policy.aliases.iter().map(|a| normalize(a)).collect();
            if aliases
                .iter()
                .any(|a| has_phrase(&site, a) || (site.len() >= 3 && has_phrase(a, &site)))
                && !is_fallback(policy)
            {
                return suggestion_from(policy, data.version);
            }
        }
    }

    // Product-name hints (weaker).
    if !product.is_empty() {
        if let Some(policy) = data.policies.iter().find(|p| hint_matches(p, &product)) {
            return suggestion_from(policy, data.version);
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
        keepalive_days: policy.keepalive_days,
        vendor: Some(policy.vendor.clone()),
        confidence: Some(policy.confidence.clone()),
        source: Some(policy.source.clone()),
        last_verified: Some(policy.last_verified.clone()),
        policy_id: Some(policy.id.clone()),
        dataset_version,
        message: match (policy.keepalive_days, policy.note.as_deref()) {
            (Some(days), note) => format!(
                "Suggested {days} days for {} (confidence: {}; verified {}).{} Override anytime.",
                policy.vendor,
                policy.confidence,
                policy.last_verified,
                note.map(|n| format!(" {n}")).unwrap_or_default()
            ),
            (None, note) => format!(
                "{} publishes no inactivity requirement for this plan (confidence: {}; verified {}).{} Leave blank unless you want your own reminder.",
                policy.vendor,
                policy.confidence,
                policy.last_verified,
                note.map(|n| format!(" {n}")).unwrap_or_default()
            ),
        },
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

    #[test]
    fn short_alias_matches_whole_word_only() {
        assert_eq!(
            suggest_keepalive(Some("PH"), None).policy_id.as_deref(),
            Some("producthunt")
        );
        assert!(!suggest_keepalive(Some("Philips Hue"), Some("Widget")).matched);
        assert!(!suggest_keepalive(Some("Graphite"), Some("Widget")).matched);
    }

    #[test]
    fn domains_and_punctuation_still_match() {
        for site in ["appsumo.com", "https://appsumo.com/deals", "App-Sumo"] {
            assert_eq!(
                suggest_keepalive(Some(site), None).policy_id.as_deref(),
                Some("appsumo"),
                "{site}"
            );
        }
        assert_eq!(
            suggest_keepalive(Some("humblebundle.com"), None).policy_id.as_deref(),
            Some("humble")
        );
    }

    #[test]
    fn product_hint_requires_whole_word() {
        assert!(!suggest_keepalive(None, Some("Peltdown Pro")).matched);
    }

    #[test]
    fn vendor_policy_beats_marketplace_it_was_bought_on() {
        let s = suggest_keepalive(Some("AppSumo"), Some("LiveAgent Lifetime"));
        assert_eq!(s.policy_id.as_deref(), Some("liveagent"));
        assert!(s.keepalive_days.is_none());
        assert!(s.message.contains("no inactivity requirement"));
    }

    #[test]
    fn no_requirement_vendor_returns_no_days() {
        let s = suggest_keepalive(None, Some("pCloud Lifetime 2TB"));
        assert_eq!(s.policy_id.as_deref(), Some("pcloud"));
        assert!(s.matched);
        assert!(s.keepalive_days.is_none());
        assert_eq!(s.confidence.as_deref(), Some("high"));
    }

    #[test]
    fn fallback_never_wins_over_marketplace() {
        let s = suggest_keepalive(Some("AppSumo"), Some("Cool LTD Suite"));
        assert_eq!(s.policy_id.as_deref(), Some("appsumo"));
    }

    #[test]
    fn missing_days_in_user_override_file_parses() {
        let json = r#"{"version":9,"updated":"x","policies":[{"id":"v","vendor":"V",
            "aliases":["v"],"source":"s","last_verified":"d","confidence":"low"}]}"#;
        let parsed: VendorPolicyDataset = serde_json::from_str(json).unwrap();
        assert!(parsed.policies[0].keepalive_days.is_none());
        assert_eq!(parsed.policies[0].kind, "marketplace");
    }
}
