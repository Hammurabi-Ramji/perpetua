//! Opt-in keep-alive reset from a hostname visit.
//!
//! The browser extension may tell Perpetua that the user opened a hostname
//! matching one of their licenses. Perpetua stores the same `last_active`
//! date that Mark as used stores, and nothing else — no URL, path, or title.
//! The manual button remains the default; this runs only after an explicit opt-in.

use anyhow::{anyhow, Result};
use rusqlite::{params, Connection, OptionalExtension};

use crate::services::{get_licenses, mark_license_active};

pub fn normalize_host(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let candidate = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };
    let url = reqwest::Url::parse(&candidate).ok()?;
    let host = url.host_str()?.to_ascii_lowercase();
    let host = host.strip_prefix("www.").unwrap_or(&host).to_string();
    if host.is_empty() {
        None
    } else {
        Some(host)
    }
}

pub fn hosts_match(visit_host: &str, license_host: &str) -> bool {
    visit_host == license_host || visit_host.ends_with(&format!(".{license_host}"))
}

pub fn activity_inference_enabled(conn: &Connection, user_id: i64) -> Result<bool> {
    let value: Option<i64> = conn
        .query_row(
            "SELECT activity_inference FROM users WHERE id = ?",
            params![user_id],
            |row| row.get(0),
        )
        .optional()?;
    Ok(value.unwrap_or(0) != 0)
}

pub fn set_activity_inference(conn: &Connection, user_id: i64, enabled: bool) -> Result<bool> {
    let changed = conn.execute(
        "UPDATE users SET activity_inference = ? WHERE id = ?",
        params![enabled as i64, user_id],
    )?;
    if changed == 0 {
        return Err(anyhow!("User not found."));
    }
    Ok(enabled)
}

/// Hostnames derived from the vault owner's license URLs. No keys, no paths.
/// Empty unless `actor_id` has opted in.
pub fn tracked_hosts(conn: &Connection, actor_id: i64, owner_id: i64) -> Result<Vec<String>> {
    if !activity_inference_enabled(conn, actor_id)? {
        return Ok(Vec::new());
    }
    let mut hosts = Vec::new();
    for license in get_licenses(conn, owner_id)? {
        for url in [&license.product_url, &license.redemption_url, &license.download_url] {
            if let Some(host) = url.as_deref().and_then(normalize_host) {
                if !hosts.iter().any(|existing: &String| existing == &host) {
                    hosts.push(host);
                }
            }
        }
    }
    hosts.sort();
    Ok(hosts)
}

/// Resets `last_active` on licenses whose URL host matches `host`.
/// Refuses to do anything when the user has not opted in. The hostname is
/// not written anywhere.
pub fn record_host_visit(conn: &Connection, actor_id: i64, owner_id: i64, host: &str) -> Result<Vec<i64>> {
    if !activity_inference_enabled(conn, actor_id)? {
        return Err(anyhow!(
            "Activity inference is off. Nothing was recorded. Mark as used is still available."
        ));
    }
    let Some(visit) = normalize_host(host) else {
        return Err(anyhow!("That hostname is not valid."));
    };

    let mut updated = Vec::new();
    for license in get_licenses(conn, owner_id)? {
        let matched = [&license.product_url, &license.redemption_url, &license.download_url]
            .into_iter()
            .flatten()
            .filter_map(|url| normalize_host(url))
            .any(|license_host| hosts_match(&visit, &license_host));
        if !matched {
            continue;
        }
        if mark_license_active(conn, owner_id, license.id)?.is_some() {
            updated.push(license.id);
        }
    }
    Ok(updated)
}
