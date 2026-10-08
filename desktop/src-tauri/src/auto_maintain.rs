//! Auto-Maintain safety shell.
//!
//! Pro users can opt in per license and store a vendor username/password in
//! the OS keychain. Nothing here logs into a vendor site, submits that
//! password, bypasses 2FA or CAPTCHA, or drives a browser. The runner records
//! the attempt and leaves the normal keep-alive reminder in place, because no
//! vendor login adapter can finish those challenges.

use anyhow::{anyhow, Result};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use crate::services::is_pro;

#[derive(Debug, Clone, Serialize)]
pub struct AutoMaintainLicense {
    pub license_id: i64,
    pub product_name: String,
    pub enabled: bool,
    pub credential_set: bool,
}

fn credential_account(user_id: i64, license_id: i64) -> String {
    format!("{user_id}:{license_id}")
}

fn credential_is_set(user_id: i64, license_id: i64) -> bool {
    crate::secret_store::read_account(
        crate::secret_store::VENDOR_CRED,
        &credential_account(user_id, license_id),
    )
    .is_some()
}

pub fn list_auto_maintain(conn: &Connection, user_id: i64) -> Result<Vec<AutoMaintainLicense>> {
    let mut stmt = conn.prepare(
        "SELECT l.id, l.product_name, COALESCE(a.enabled, 0)
         FROM licenses l
         LEFT JOIN auto_maintain_opt_in a ON a.license_id = l.id AND a.user_id = l.user_id
         WHERE l.user_id = ?
         ORDER BY l.product_name",
    )?;
    let rows = stmt.query_map(params![user_id], |row| {
        let license_id: i64 = row.get(0)?;
        Ok(AutoMaintainLicense {
            license_id,
            product_name: row.get(1)?,
            enabled: row.get::<_, i64>(2)? != 0,
            credential_set: false,
        })
    })?;
    let mut items = Vec::new();
    for row in rows {
        let mut item = row?;
        item.credential_set = credential_is_set(user_id, item.license_id);
        items.push(item);
    }
    Ok(items)
}

pub fn set_auto_maintain(
    conn: &Connection,
    user_id: i64,
    license_id: i64,
    enabled: bool,
    username: Option<&str>,
    password: Option<&str>,
) -> Result<AutoMaintainLicense> {
    if enabled && !is_pro(conn)? {
        return Err(anyhow!("Auto-Maintain is a Pro feature."));
    }
    let product_name: String = conn
        .query_row(
            "SELECT product_name FROM licenses WHERE id = ? AND user_id = ?",
            params![license_id, user_id],
            |row| row.get(0),
        )
        .optional()?
        .ok_or_else(|| anyhow!("License not found."))?;

    if let Some(password) = password.map(str::trim).filter(|value| !value.is_empty()) {
        let username = username.unwrap_or("").trim();
        crate::secret_store::write_account(
            crate::secret_store::VENDOR_CRED,
            &credential_account(user_id, license_id),
            &format!("{username}\n{password}"),
        )?;
    }

    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO auto_maintain_opt_in (license_id, user_id, enabled, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(license_id) DO UPDATE SET
           enabled = excluded.enabled,
           updated_at = excluded.updated_at",
        params![license_id, user_id, enabled as i64, now],
    )?;

    Ok(AutoMaintainLicense {
        license_id,
        product_name,
        enabled,
        credential_set: credential_is_set(user_id, license_id),
    })
}

/// Records one attempt per opted-in license and stops there.
/// Outcome is always `downgraded_to_reminder`: Perpetua does not log in.
pub fn run_auto_maintain_pass(conn: &Connection) -> Result<usize> {
    if !is_pro(conn)? {
        return Ok(0);
    }
    let mut stmt = conn.prepare(
        "SELECT license_id FROM auto_maintain_opt_in WHERE enabled = 1",
    )?;
    let ids: Vec<i64> = stmt.query_map([], |row| row.get(0))?.collect::<Result<Vec<_>, _>>()?;
    drop(stmt);
    let now = chrono::Utc::now().to_rfc3339();
    for license_id in &ids {
        conn.execute(
            "INSERT INTO auto_maintain_audit (license_id, attempted_at, outcome)
             VALUES (?, ?, 'downgraded_to_reminder')",
            params![license_id, now],
        )?;
    }
    Ok(ids.len())
}
