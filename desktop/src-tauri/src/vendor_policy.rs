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
    /// Page the `source` sentence was read from. Only `https://` URLs are
    /// shown; anything else is dropped so a drop-in override file cannot
    /// inject a script URL into the form.
    #[serde(default)]
    pub source_url: Option<String>,
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
    pub source_url: Option<String>,
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
            drop_out_of_range_days(&mut parsed);
            return parsed;
        }
    }
    serde_json::from_str(BUNDLED_POLICIES).expect("bundled vendor-policies.json must parse")
}

/// Drop override-file policies whose `keepalive_days` is outside 1..=3650.
/// A missing value (`None`, "no requirement") is valid and is kept.
fn drop_out_of_range_days(data: &mut VendorPolicyDataset) {
    data.policies
        .retain(|p| p.keepalive_days.map_or(true, |d| (1..=3650).contains(&d)));
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

const TLD_SUFFIXES: [&str; 3] = ["com", "net", "io"];

/// Word-boundary alias match on a normalized site string: whole-word phrase
/// match (either direction), or equal ignoring spaces so "App Sumo" matches
/// the alias "appsumo", or equal once a glued TLD is stripped ("appsumocom").
/// Never a partial-word substring match.
fn alias_matches(site: &str, alias: &str) -> bool {
    if alias.is_empty() {
        return false;
    }
    if has_phrase(site, alias) || (site.len() >= 3 && has_phrase(alias, site)) {
        return true;
    }
    let site_compact: String = site.split_whitespace().collect();
    let alias_compact: String = alias.split_whitespace().collect();
    site_compact == alias_compact
        || TLD_SUFFIXES
            .iter()
            .any(|tld| site_compact.strip_suffix(tld) == Some(alias_compact.as_str()))
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
            source_url: None,
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
            if aliases.iter().any(|a| alias_matches(&site, a)) && !is_fallback(policy)
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
        source_url: None,
        last_verified: None,
        policy_id: None,
        dataset_version: data.version,
        message: "unknown — set keep-alive days manually".to_string(),
    }
}

/// Keep only an `https://` URL with no whitespace. `None` otherwise.
fn https_source_url(raw: Option<&str>) -> Option<String> {
    let url = raw?.trim();
    let rest = url.strip_prefix("https://")?;
    if rest.is_empty() || url.chars().any(char::is_whitespace) || url.contains('<') {
        return None;
    }
    Some(url.to_string())
}

fn suggestion_from(policy: &VendorPolicy, dataset_version: u32) -> VendorPolicySuggestion {
    VendorPolicySuggestion {
        matched: true,
        keepalive_days: policy.keepalive_days,
        vendor: Some(policy.vendor.clone()),
        confidence: Some(policy.confidence.clone()),
        source: Some(policy.source.clone()),
        source_url: https_source_url(policy.source_url.as_deref()),
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
    fn short_aliases_removed_and_partial_words_do_not_match() {
        // "ph" and "sumo" are no longer aliases (VP-01): too easy to hit by accident.
        assert!(!suggest_keepalive(Some("PH"), None).matched);
        assert!(!suggest_keepalive(Some("Philips Hue"), Some("Widget")).matched);
        assert!(!suggest_keepalive(Some("Graphite"), Some("Widget")).matched);
        for site in ["Sumo Logic", "Graphic Design Co", "Dolphin"] {
            assert!(!suggest_keepalive(Some(site), None).matched, "{site}");
        }
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
    fn product_hint_requires_word_boundary_for_lifetime_and_ltd() {
        assert!(!suggest_keepalive(None, Some("Multilifetimes Suite")).matched);
        assert!(!suggest_keepalive(None, Some("Gold Ltdx")).matched);
    }

    #[test]
    fn override_days_out_of_range_are_dropped() {
        let json = r#"{"version":9,"updated":"x","policies":[
            {"id":"a","vendor":"A","aliases":["a"],"keepalive_days":0,"source":"s","last_verified":"d","confidence":"low"},
            {"id":"b","vendor":"B","aliases":["b"],"keepalive_days":4000,"source":"s","last_verified":"d","confidence":"low"},
            {"id":"c","vendor":"C","aliases":["c"],"keepalive_days":90,"source":"s","last_verified":"d","confidence":"low"},
            {"id":"d","vendor":"D","aliases":["d"],"source":"s","last_verified":"d","confidence":"low"}]}"#;
        let mut parsed: VendorPolicyDataset = serde_json::from_str(json).unwrap();
        drop_out_of_range_days(&mut parsed);
        let ids: Vec<&str> = parsed.policies.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(ids, ["c", "d"]);
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
        assert!(parsed.policies[0].source_url.is_none());
    }

    #[test]
    fn cited_policies_carry_https_source_urls() {
        let live = suggest_keepalive(None, Some("LiveAgent"));
        assert_eq!(
            live.source_url.as_deref(),
            Some("https://support.liveagent.com/701120-Account-inactivity-and-suspension")
        );
        let cloud = suggest_keepalive(None, Some("pCloud Lifetime"));
        assert_eq!(
            cloud.source_url.as_deref(),
            Some("https://help.pcloud.com/article/account-inactivity")
        );
        let appsumo = suggest_keepalive(Some("AppSumo"), None);
        assert_eq!(
            appsumo.source_url.as_deref(),
            Some("https://appsumo.com/terms-of-use/")
        );
    }

    #[test]
    fn non_https_source_url_is_dropped() {
        assert!(https_source_url(Some("javascript:alert(1)")).is_none());
        assert!(https_source_url(Some("http://example.com/policy")).is_none());
        assert!(https_source_url(Some("https://evil.example/a b")).is_none());
        assert_eq!(
            https_source_url(Some(
                "  https://help.pcloud.com/article/account-inactivity  "
            ))
            .as_deref(),
            Some("https://help.pcloud.com/article/account-inactivity")
        );
    }
}
