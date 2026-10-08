//! In-app update check against GitHub Releases.
//!
//! The endpoint is the Tauri updater manifest published with a release. Signing
//! is not configured in this tree: there is no private key here, and
//! `createUpdaterArtifacts` stays false so a release build does not fail while
//! the owner has not created one. The check tells the truth instead of
//! pretending an update was found.

pub const PUBKEY_PLACEHOLDER: &str = "UNCONFIGURED";

pub const ENDPOINT: &str =
    "https://github.com/Hammurabi-Ramji/PERPETUA/releases/latest/download/latest.json";

pub fn updates_configured(pubkey: &str) -> bool {
    let trimmed = pubkey.trim();
    !trimmed.is_empty() && trimmed != PUBKEY_PLACEHOLDER
}

pub fn check_for_updates_message(pubkey: &str) -> String {
    if !updates_configured(pubkey) {
        format!(
            "Updates are not configured, so nothing was downloaded.\n\n\
             The owner needs to:\n\
             1. Generate a Tauri updater keypair (`npm run tauri signer generate`) and keep the private key off this repo.\n\
             2. Replace plugins.updater.pubkey in desktop/src-tauri/tauri.conf.json (it is currently {PUBKEY_PLACEHOLDER}).\n\
             3. Set bundle.createUpdaterArtifacts to true.\n\
             4. Set GitHub Actions secrets TAURI_SIGNING_PRIVATE_KEY and TAURI_SIGNING_PRIVATE_KEY_PASSWORD.\n\n\
             The update endpoint is {ENDPOINT}."
        )
    } else {
        format!(
            "The updater public key is set. Perpetua would check {ENDPOINT}. \
             A signed latest.json still has to be published with the release before an update can install."
        )
    }
}

pub fn configured_pubkey_from_manifest() -> &'static str {
    const MANIFEST: &str = include_str!("../tauri.conf.json");
    // The placeholder is the source of truth until the owner pastes a real key.
    // A test asserts the manifest still says UNCONFIGURED or a non-empty key.
    if MANIFEST.contains(PUBKEY_PLACEHOLDER) {
        PUBKEY_PLACEHOLDER
    } else {
        "SET"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unconfigured_updater_does_not_claim_an_update_exists() {
        let message = check_for_updates_message(PUBKEY_PLACEHOLDER);
        assert!(!updates_configured(PUBKEY_PLACEHOLDER));
        assert!(message.contains("not configured"));
        assert!(message.contains("nothing was downloaded"));
        assert!(message.contains("TAURI_SIGNING_PRIVATE_KEY"));
        assert!(message.contains(ENDPOINT));
        assert_eq!(configured_pubkey_from_manifest(), PUBKEY_PLACEHOLDER);
    }
}
