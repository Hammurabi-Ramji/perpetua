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
        if let Ok(mut parsed) = serde_json::from_str::<VendorPolicyDataset>(&text) {
            parsed
                .policies
                .retain(|p| (1..=3650).contains(&p.keepalive_days));
            return parsed;
        }
    }
    serde_json::from_str(BUNDLED_POLICIES).expect("bundled vendor-policies.json must parse")
}

fn dataset() -> &'static VendorPolicyDataset {
    static DATASET: OnceLock<VendorPolicyDataset> = OnceLock::new();
    DATASET.get_or_init(load_dataset)
}

/// Split into lowercase alphanumeric tokens. Any non-alphanumeric character
/// (space, dot, hyphen, slash...) is a token boundary, so "appsumo.com"
/// becomes ["appsumo", "com"].
fn tokenize(value: &str) -> Vec<String> {
    value
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .map(str::to_string)
        .collect()
}

const TLD_SUFFIXES: [&str; 3] = ["com", "net", "io"];

/// True when `needle` occurs in `hay` as a contiguous run of whole tokens.
fn contains_token_seq(hay: &[String], needle: &[String]) -> bool {
    !needle.is_empty()
        && needle.len() <= hay.len()
        && hay.windows(needle.len()).any(|w| w == needle)
}

/// Candidate token forms of a site string: as given, without a trailing
/// "com"/"net"/"io" token ("appsumo.com"), and without a glued TLD suffix on
/// the last token ("appsumocom").
fn site_variants(tokens: &[String]) -> Vec<Vec<String>> {
    let mut out = vec![tokens.to_vec()];
    if let Some(last) = tokens.last() {
        if tokens.len() > 1 && TLD_SUFFIXES.contains(&last.as_str()) {
            out.push(tokens[..tokens.len() - 1].to_vec());
        }
        for tld in TLD_SUFFIXES {
            if let Some(stem) = last.strip_suffix(tld) {
                if !stem.is_empty() {
                    let mut v = tokens[..tokens.len() - 1].to_vec();
                    v.push(stem.to_string());
                    out.push(v);
                }
            }
        }
    }
    out
}

/// Word-boundary alias match: the site equals the alias, or contains it as a
/// whole token sequence. Space-insensitive equality also lets "App Sumo" match
/// the alias "appsumo". No partial-word substring matching.
fn alias_matches(site_tokens: &[String], alias: &str) -> bool {
    let alias_tokens = tokenize(alias);
    if alias_tokens.is_empty() {
        return false;
    }
    let alias_compact = alias_tokens.concat();
    site_variants(site_tokens).iter().any(|v| {
        contains_token_seq(v, &alias_tokens) || v.concat() == alias_compact
    })
}

/// Match against aliases (source_site) first, then product_name hints.
pub fn suggest_keepalive(
    source_site: Option<&str>,
    product_name: Option<&str>,
) -> VendorPolicySuggestion {
    let data = dataset();
    let site = source_site.map(tokenize).unwrap_or_default();
    let product = product_name.map(tokenize).unwrap_or_default();

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
            if policy.id != "generic-saas-90"
                && policy.aliases.iter().any(|a| alias_matches(&site, a))
            {
                return suggestion_from(policy, data.version);
            }
        }
    }

    // Product-name hints (weaker).
    if !product.is_empty() {
        for policy in &data.policies {
            for hint in &policy.product_hints {
                let h = tokenize(hint);
                if contains_token_seq(&product, &h) {
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

    #[test]
    fn appsumo_spellings_match() {
        for site in ["AppSumo", "appsumo.com", "App Sumo", "www.appsumo.com", "appsumocom"] {
            let s = suggest_keepalive(Some(site), None);
            assert!(s.matched, "{site} should match");
            assert_eq!(s.policy_id.as_deref(), Some("appsumo"), "{site}");
        }
    }

    #[test]
    fn partial_word_sites_do_not_match() {
        for site in ["Sumo Logic", "Graphic Design Co", "Dolphin"] {
            let s = suggest_keepalive(Some(site), None);
            assert!(!s.matched, "{site} should not match");
        }
    }

    #[test]
    fn product_hint_requires_word_boundary() {
        assert!(!suggest_keepalive(None, Some("Multilifetimes Suite")).matched);
        assert!(!suggest_keepalive(None, Some("Gold Ltdx")).matched);
    }
}
