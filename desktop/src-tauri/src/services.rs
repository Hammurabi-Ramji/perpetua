use anyhow::{anyhow, Result};
use bcrypt::{hash, verify, DEFAULT_COST};
use chrono::{Duration, Local, NaiveDate, Utc};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use rusqlite::backup::Backup;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Deserialize;
use std::cmp::Reverse;
use std::fs;

use crate::models::{
    AccountRecoverySettings, AuthResponse, BackupEntry, CloudBackupSettings, Entitlement,
    EnableCloudBackupRequest, ImportLicensesResult, License, LicenseExportSnapshot, LicensePayload,
    LicenseStats, LicenseUpdate, ReminderItem, ReminderNotice, ReminderSettings, ReminderSettingsUpdate,
    SiteConnection, User, VaultExportFile, VaultMember,
};
use crate::database::{apply_schema, backup_dir, db_path, verify_vault_file};
use rand::Rng;
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct Claims {
    pub sub: i64,
    pub email: String,
    pub exp: usize,
    /// `users.token_version` at issue time. Absent on tokens minted before
    /// revocation existed; those compare as 0, which matches an un-bumped user.
    #[serde(default)]
    pub ver: i64,
}

const REMINDER_WINDOW_DAYS: i64 = 30;
const MAX_BACKUPS: usize = 5;

/// Free tier stores up to this many licenses. Adding more requires a Pro unlock.
pub const FREE_LICENSE_LIMIT: usize = 3;

/// Secret used to verify Pro license keys offline.
///
/// A valid key is an HS256 JWT signed with this secret carrying the claim
/// `{ "product": "perpetua-pro" }`. Keys verify fully on-device — no server call,
/// true to the local-first promise.
///
/// NOTE (production hardening, next GTM step): an embedded symmetric secret is
/// forgeable if the binary is reverse-engineered. The planned move is to verify
/// keys against Polar's license API (Merchant of Record + native key issuance),
/// which retires this secret entirely. The `verify_pro_key` / `mint_pro_key`
/// seam below is the only thing that changes.
///
/// Set via `PERPETUA_LICENSE_SECRET` at build time. Release builds (`not(debug_assertions)`,
/// i.e. `cargo build --release` / `tauri build` / build-release.ps1) fail to
/// compile without it — a real secret must never ship silently unset. Debug
/// builds fall back to an obviously-fake dev value so `cargo build`/`cargo test`
/// keep working without extra setup.
#[cfg(debug_assertions)]
const LICENSE_VERIFY_SECRET: &str = match option_env!("PERPETUA_LICENSE_SECRET") {
    Some(secret) => secret,
    None => "PERPETUA_DEV_ONLY_INSECURE_LICENSE_SECRET_DO_NOT_SHIP",
};
#[cfg(not(debug_assertions))]
const LICENSE_VERIFY_SECRET: &str = env!(
    "PERPETUA_LICENSE_SECRET",
    "PERPETUA_LICENSE_SECRET must be set for release builds (see build-release.ps1)"
);
const PRO_PRODUCT_CLAIM: &str = "perpetua-pro";

/// Typed error so handlers can map the free-tier cap to HTTP 402 (Payment Required)
/// instead of a generic 500.
#[derive(Debug, thiserror::Error)]
#[error("Free plan stores up to {limit} licenses. Unlock Pro to add more.")]
pub struct FreeLimitReached {
    pub limit: usize,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct LicenseKeyClaims {
    product: String,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum ImportFile {
    Snapshot(LicenseExportSnapshot),
    Licenses(Vec<LicensePayload>),
}

#[derive(Deserialize)]
struct CsvLicenseRow {
    product_name: String,
    license_key: String,
    purchase_date: Option<String>,
    expiry_date: Option<String>,
    status: Option<String>,
    source_site: Option<String>,
    product_url: Option<String>,
    redemption_url: Option<String>,
    download_url: Option<String>,
    notes: Option<String>,
    action_required: Option<bool>,
    action_description: Option<String>,
    action_deadline: Option<String>,
    keepalive_days: Option<i64>,
    last_active: Option<String>,
}

fn now_string() -> String {
    Utc::now().to_rfc3339()
}

/// Calendar "today" in the user's local time zone. Keep-alive and expiry are
/// calendar-day concepts for the user, so a user west of UTC marking a license
/// "used today" at 9 pm must not record tomorrow's date.
pub fn today_local() -> NaiveDate {
    Local::now().date_naive()
}

fn bool_from_sql(value: i64) -> bool {
    value != 0
}

fn normalize_optional(value: Option<String>) -> Option<String> {
    value.and_then(|item| {
        let trimmed = item.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

/// Upper bound on a keep-alive cadence (10 years). Anything larger is almost
/// certainly a column mix-up in an import, and unbounded values can overflow
/// the date arithmetic that drives the Dashboard, Reminders and the scheduler.
pub const MAX_KEEPALIVE_DAYS: i64 = 3650;

/// Statuses that mean "this license no longer needs watching". Reminders and
/// notifications skip them so a dead license doesn't nag every day forever.
const INACTIVE_STATUSES: &[&str] = &["expired", "revoked", "archived", "cancelled", "canceled", "refunded"];

fn is_inactive_status(status: &str) -> bool {
    INACTIVE_STATUSES.contains(&status.trim().to_ascii_lowercase().as_str())
}

/// Accepts the canonical `YYYY-MM-DD`, and also RFC 3339 / ISO-8601 timestamps
/// (`2026-03-04T12:34:56Z`, `2026-03-04T12:34:56.789+02:00`) which it truncates
/// to the calendar date. The browser extension, CSV exports from other tools
/// and `Date.toISOString()` all produce the latter; rejecting them failed whole
/// import batches for a formatting nit.
fn normalize_date(value: Option<String>, field_name: &str) -> Result<Option<String>> {
    let Some(raw) = normalize_optional(value) else {
        return Ok(None);
    };
    if NaiveDate::parse_from_str(&raw, "%Y-%m-%d").is_ok() {
        return Ok(Some(raw));
    }
    if let Ok(stamp) = chrono::DateTime::parse_from_rfc3339(&raw) {
        return Ok(Some(stamp.date_naive().format("%Y-%m-%d").to_string()));
    }
    if let Ok(stamp) = chrono::NaiveDateTime::parse_from_str(&raw, "%Y-%m-%dT%H:%M:%S%.f") {
        return Ok(Some(stamp.date().format("%Y-%m-%d").to_string()));
    }
    Err(anyhow!("{field_name} must use YYYY-MM-DD"))
}

fn sanitize_license_payload(payload: LicensePayload) -> Result<LicensePayload> {
    let keepalive_days = match payload.keepalive_days {
        Some(days) if days > MAX_KEEPALIVE_DAYS => {
            return Err(anyhow!("keepalive_days must be between 1 and {MAX_KEEPALIVE_DAYS}"));
        }
        Some(days) if days > 0 => Some(days),
        _ => None,
    };

    let sanitized = LicensePayload {
        product_name: payload.product_name.trim().to_string(),
        license_key: payload.license_key.trim().to_string(),
        purchase_date: normalize_date(payload.purchase_date, "purchase_date")?,
        expiry_date: normalize_date(payload.expiry_date, "expiry_date")?,
        status: normalize_optional(payload.status).or(Some("active".to_string())),
        source_site: normalize_optional(payload.source_site),
        product_url: normalize_optional(payload.product_url),
        redemption_url: normalize_optional(payload.redemption_url),
        download_url: normalize_optional(payload.download_url),
        notes: normalize_optional(payload.notes),
        action_required: Some(payload.action_required.unwrap_or(false)),
        action_description: normalize_optional(payload.action_description),
        action_deadline: normalize_date(payload.action_deadline, "action_deadline")?,
        keepalive_days,
        last_active: normalize_date(payload.last_active, "last_active")?,
    };

    if sanitized.product_name.is_empty() {
        return Err(anyhow!("product_name is required"));
    }

    if sanitized.license_key.is_empty() {
        return Err(anyhow!("license_key is required"));
    }

    Ok(sanitized)
}

fn license_to_payload(license: &License) -> LicensePayload {
    LicensePayload {
        product_name: license.product_name.clone(),
        license_key: license.license_key.clone(),
        purchase_date: license.purchase_date.clone(),
        expiry_date: license.expiry_date.clone(),
        status: Some(license.status.clone()),
        source_site: license.source_site.clone(),
        product_url: license.product_url.clone(),
        redemption_url: license.redemption_url.clone(),
        download_url: license.download_url.clone(),
        notes: license.notes.clone(),
        action_required: Some(license.action_required),
        action_description: license.action_description.clone(),
        action_deadline: license.action_deadline.clone(),
        keepalive_days: license.keepalive_days,
        last_active: license.last_active.clone(),
    }
}

fn license_exists(conn: &Connection, user_id: i64, product_name: &str, license_key: &str) -> Result<bool> {
    let mut stmt = conn.prepare(
        "SELECT 1
         FROM licenses
         WHERE user_id = ?
           AND lower(product_name) = lower(?)
           AND lower(license_key) = lower(?)
         LIMIT 1",
    )?;

    Ok(stmt
        .query_row(params![user_id, product_name, license_key], |_| Ok(()))
        .optional()?
        .is_some())
}

fn reminder_window_end(now: chrono::NaiveDate) -> chrono::NaiveDate {
    now + chrono::Duration::days(REMINDER_WINDOW_DAYS)
}

fn map_user(row: &rusqlite::Row<'_>) -> rusqlite::Result<User> {
    Ok(User {
        id: row.get(0)?,
        email: row.get(1)?,
        created_at: row.get(2)?,
        last_login: row.get(3)?,
        notification_email: row.get(4)?,
        email_notifications: bool_from_sql(row.get(5)?),
        browser_notifications: bool_from_sql(row.get(6)?),
        onboarding_completed: bool_from_sql(row.get(7)?),
        backup_email: row.get(8)?,
        token_version: row.get(9)?,
    })
}

const USER_COLUMNS: &str = "id, email, created_at, last_login, notification_email, \
    email_notifications, browser_notifications, onboarding_completed, backup_email, token_version";

fn map_license(row: &rusqlite::Row<'_>) -> rusqlite::Result<License> {
    Ok(License {
        id: row.get(0)?,
        user_id: row.get(1)?,
        product_name: row.get(2)?,
        license_key: row.get(3)?,
        purchase_date: row.get(4)?,
        expiry_date: row.get(5)?,
        status: row.get(6)?,
        source_site: row.get(7)?,
        product_url: row.get(8)?,
        redemption_url: row.get(9)?,
        download_url: row.get(10)?,
        notes: row.get(11)?,
        action_required: bool_from_sql(row.get(12)?),
        action_description: row.get(13)?,
        action_deadline: row.get(14)?,
        created_at: row.get(15)?,
        updated_at: row.get(16)?,
        keepalive_days: row.get(17)?,
        last_active: row.get(18)?,
    })
}

pub fn create_jwt(secret: &str, user: &User) -> Result<String> {
    let expiration = Utc::now()
        .checked_add_signed(Duration::days(30))
        .ok_or_else(|| anyhow!("invalid timestamp"))?
        .timestamp() as usize;

    let claims = Claims {
        sub: user.id,
        email: user.email.clone(),
        exp: expiration,
        ver: user.token_version,
    };

    Ok(encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )?)
}

pub fn verify_jwt(secret: &str, token: &str) -> Result<Claims> {
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::new(Algorithm::HS256),
    )?;

    Ok(token_data.claims)
}

/// True when the token was issued at the user's current `token_version`.
pub fn token_is_current(user: &User, claims: &Claims) -> bool {
    claims.ver == user.token_version
}

/// Invalidates every JWT already issued for this user, including the
/// browser-extension pairing token. Returns the user with the new version
/// so the caller can mint a replacement session for the desktop app.
pub fn bump_token_version(conn: &Connection, user_id: i64) -> Result<User> {
    conn.execute(
        "UPDATE users SET token_version = token_version + 1 WHERE id = ?",
        params![user_id],
    )?;
    get_user_by_id(conn, user_id)?.ok_or_else(|| anyhow!("user not found"))
}

/// Canonical form for account emails: trimmed and lower-cased, so `A@x.com`
/// and `a@x.com` are the same account. Applied on write and on every lookup
/// (lookups also lower-case the stored column so pre-existing mixed-case rows
/// keep working).
pub fn normalize_email(email: &str) -> String {
    email.trim().to_lowercase()
}

/// bcrypt's hard limit: bytes past 72 are silently ignored by the algorithm,
/// so a 100-character password would verify with only its first 72. Reject
/// instead of truncating.
const MAX_PASSWORD_BYTES: usize = 72;

/// Server-side credential validation so the API can't be bypassed by a client
/// that skips the form checks.
pub fn validate_credentials(email: &str, password: &str) -> Result<()> {
    let trimmed = email.trim();
    if trimmed.is_empty() || !trimmed.contains('@') || trimmed.starts_with('@') || trimmed.ends_with('@') {
        return Err(anyhow!("Enter a valid email address."));
    }
    if password.len() > MAX_PASSWORD_BYTES {
        return Err(anyhow!("Password must be at most {MAX_PASSWORD_BYTES} bytes."));
    }
    // Local/dev: PERPETUA_DEV_ALLOW_SHORT_PASSWORD=1 (or BSMC_DEV_ALLOW_SHORT_PASSWORD=1)
    // relaxes min length so short shared test passwords can register.
    // Debug-build only — an env var can't weaken this policy in a shipped release binary.
    #[cfg(debug_assertions)]
    let allow_short = std::env::var("PERPETUA_DEV_ALLOW_SHORT_PASSWORD")
        .or_else(|_| std::env::var("BSMC_DEV_ALLOW_SHORT_PASSWORD"))
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    #[cfg(not(debug_assertions))]
    let allow_short = false;
    let min_len = if allow_short { 1 } else { 8 };
    if password.len() < min_len {
        return Err(anyhow!("Password must be at least 8 characters."));
    }
    Ok(())
}

pub fn create_user(conn: &Connection, email: &str, password: &str) -> Result<User> {
    let email = normalize_email(email);
    let password_hash = hash(password, DEFAULT_COST)?;
    let now = now_string();

    // Desktop reminders default on: they are the product's core promise.
    // Email reminders stay off until delivery actually exists (see STATUS.md).
    conn.execute(
        "INSERT INTO users (
            email, password_hash, notification_email, email_notifications, browser_notifications, created_at
        ) VALUES (?, ?, ?, 0, 1, ?)",
        params![email, password_hash, email, now],
    )?;

    let user_id = conn.last_insert_rowid();
    get_user_by_id(conn, user_id)?.ok_or_else(|| anyhow!("failed to load created user"))
}

/// A real bcrypt hash of a throwaway value, verified against when the account
/// doesn't exist so "unknown email" and "wrong password" take the same time.
/// Without it, a login attempt for a non-existent account returns before any
/// bcrypt work and the timing difference enumerates accounts.
fn dummy_password_hash() -> &'static str {
    static HASH: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    HASH.get_or_init(|| hash("perpetua-timing-equalizer", DEFAULT_COST).unwrap_or_default())
}

pub fn authenticate_user(conn: &Connection, email: &str, password: &str) -> Result<Option<User>> {
    let email = normalize_email(email);
    let mut stmt = conn.prepare(&format!(
        "SELECT {USER_COLUMNS}, password_hash
         FROM users
         WHERE lower(email) = ?"
    ))?;

    let row = stmt
        .query_row(params![email], |row| {
            Ok((
                User {
                    id: row.get(0)?,
                    email: row.get(1)?,
                    created_at: row.get(2)?,
                    last_login: row.get(3)?,
                    notification_email: row.get(4)?,
                    email_notifications: bool_from_sql(row.get(5)?),
                    browser_notifications: bool_from_sql(row.get(6)?),
                    onboarding_completed: bool_from_sql(row.get(7)?),
                    backup_email: row.get(8)?,
                    token_version: row.get(9)?,
                },
                row.get::<_, String>(10)?,
            ))
        })
        .optional()?;

    match row {
        Some((user, password_hash)) => {
            if verify(password, &password_hash)? {
                let now = now_string();
                conn.execute(
                    "UPDATE users SET last_login = ? WHERE id = ?",
                    params![now, user.id],
                )?;
                return Ok(get_user_by_id(conn, user.id)?);
            }
        }
        None => {
            let _ = verify(password, dummy_password_hash());
        }
    }

    Ok(None)
}

pub fn get_user_by_id(conn: &Connection, user_id: i64) -> Result<Option<User>> {
    let mut stmt = conn.prepare(&format!("SELECT {USER_COLUMNS} FROM users WHERE id = ?"))?;

    Ok(stmt.query_row(params![user_id], map_user).optional()?)
}

pub fn get_user_by_email(conn: &Connection, email: &str) -> Result<Option<User>> {
    let mut stmt = conn.prepare(&format!("SELECT {USER_COLUMNS} FROM users WHERE lower(email) = ?"))?;

    Ok(stmt.query_row(params![normalize_email(email)], map_user).optional()?)
}

/// Whether any local account exists. Drives whether restore may run without
/// a session (brand-new install) or must be confirmed by a signed-in user.
pub fn vault_has_users(conn: &Connection) -> Result<bool> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))?;
    Ok(count > 0)
}

pub fn build_auth_response(secret: &str, user: User) -> Result<AuthResponse> {
    Ok(AuthResponse {
        token: create_jwt(secret, &user)?,
        user,
    })
}

fn get_app_state(conn: &Connection, key: &str) -> Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT value FROM app_state WHERE key = ?")?;
    Ok(stmt
        .query_row(params![key], |row| row.get::<_, String>(0))
        .optional()?)
}

fn set_app_state(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO app_state (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub fn count_licenses(conn: &Connection, user_id: i64) -> Result<usize> {
    let mut stmt = conn.prepare("SELECT COUNT(*) FROM licenses WHERE user_id = ?")?;
    let count: i64 = stmt.query_row(params![user_id], |row| row.get(0))?;
    Ok(count as usize)
}

pub fn is_pro(conn: &Connection) -> Result<bool> {
    Ok(get_app_state(conn, "pro")?.as_deref() == Some("1"))
}

/// Builds the entitlement summary the UI uses to render the free/Pro state and
/// the "slots remaining" banner.
pub fn get_entitlement(conn: &Connection, user_id: i64) -> Result<Entitlement> {
    let pro = is_pro(conn)?;
    let used = count_licenses(conn, user_id)?;
    let remaining = if pro {
        None
    } else {
        Some(FREE_LICENSE_LIMIT.saturating_sub(used))
    };

    Ok(Entitlement {
        pro,
        free_limit: FREE_LICENSE_LIMIT,
        used,
        remaining,
        activated_at: get_app_state(conn, "activated_at")?,
    })
}

/// Verifies a Pro license key fully offline. A valid key is an HS256 JWT signed
/// with `LICENSE_VERIFY_SECRET` whose `product` claim is `perpetua-pro`.
/// Lifetime license: expiry is intentionally not required.
pub fn verify_pro_key(key: &str) -> Result<()> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.required_spec_claims.clear();
    validation.validate_exp = false;

    let data = decode::<LicenseKeyClaims>(
        key.trim(),
        &DecodingKey::from_secret(LICENSE_VERIFY_SECRET.as_bytes()),
        &validation,
    )
    .map_err(|_| anyhow!("That license key is not valid."))?;

    if data.claims.product != PRO_PRODUCT_CLAIM {
        return Err(anyhow!("That license key is not for this product."));
    }

    Ok(())
}

/// Mints a Pro license key. Run this on your fulfillment side (e.g. after a
/// Gumroad/Lemon Squeezy sale) to hand a buyer their unlock key. Each call with
/// a fresh `buyer_ref` (order id / email) yields a distinct key.
pub fn mint_pro_key(buyer_ref: &str) -> Result<String> {
    #[derive(serde::Serialize)]
    struct MintClaims<'a> {
        product: &'a str,
        sub: &'a str,
        iat: usize,
    }

    let claims = MintClaims {
        product: PRO_PRODUCT_CLAIM,
        sub: buyer_ref,
        iat: Utc::now().timestamp() as usize,
    };

    Ok(encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(LICENSE_VERIFY_SECRET.as_bytes()),
    )?)
}

/// Records a successful Pro unlock on this install. `activation_id` is the
/// Polar activation instance id when activated online; None for the offline path.
pub fn mark_pro_activated(
    conn: &Connection,
    user_id: i64,
    key: &str,
    activation_id: Option<&str>,
) -> Result<Entitlement> {
    set_app_state(conn, "pro", "1")?;
    set_app_state(conn, "license_key", key.trim())?;
    if let Some(id) = activation_id {
        set_app_state(conn, "polar_activation_id", id)?;
    }
    set_app_state(conn, "activated_at", &now_string())?;
    get_entitlement(conn, user_id)
}

/// Offline activation: verifies a self-issued HS256 key and unlocks Pro.
/// Used for dev/tests and when Polar is not configured.
pub fn activate_pro(conn: &Connection, user_id: i64, key: &str) -> Result<Entitlement> {
    verify_pro_key(key)?;
    mark_pro_activated(conn, user_id, key, None)
}

pub fn get_licenses(conn: &Connection, user_id: i64) -> Result<Vec<License>> {
    let mut stmt = conn.prepare(
        "SELECT id, user_id, product_name, license_key, purchase_date, expiry_date, status, source_site, product_url,
                redemption_url, download_url, notes, action_required, action_description, action_deadline, created_at, updated_at, keepalive_days, last_active
         FROM licenses
         WHERE user_id = ?
         ORDER BY created_at DESC",
    )?;

    let rows = stmt.query_map(params![user_id], map_license)?;
    let mut licenses = Vec::new();
    for row in rows {
        licenses.push(row?);
    }
    Ok(licenses)
}

pub fn get_license_by_id(conn: &Connection, user_id: i64, license_id: i64) -> Result<Option<License>> {
    let mut stmt = conn.prepare(
        "SELECT id, user_id, product_name, license_key, purchase_date, expiry_date, status, source_site, product_url,
                redemption_url, download_url, notes, action_required, action_description, action_deadline, created_at, updated_at, keepalive_days, last_active
         FROM licenses
         WHERE user_id = ? AND id = ?",
    )?;

    Ok(stmt.query_row(params![user_id, license_id], map_license).optional()?)
}

pub fn add_license(conn: &Connection, user_id: i64, payload: LicensePayload) -> Result<License> {
    // Free-tier gate: enforced here so it covers both manual adds and bulk import.
    if !is_pro(conn)? && count_licenses(conn, user_id)? >= FREE_LICENSE_LIMIT {
        return Err(anyhow!(FreeLimitReached {
            limit: FREE_LICENSE_LIMIT,
        }));
    }

    let payload = sanitize_license_payload(payload)?;
    let now = now_string();
    let status = payload.status.unwrap_or_else(|| "active".to_string());

    conn.execute(
        "INSERT INTO licenses (
            user_id, product_name, license_key, purchase_date, expiry_date, status, source_site, product_url,
            redemption_url, download_url, notes, action_required, action_description, action_deadline, created_at, updated_at,
            keepalive_days, last_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![
            user_id,
            payload.product_name,
            payload.license_key,
            payload.purchase_date,
            payload.expiry_date,
            status,
            payload.source_site,
            payload.product_url,
            payload.redemption_url,
            payload.download_url,
            payload.notes,
            payload.action_required.unwrap_or(false) as i64,
            payload.action_description,
            payload.action_deadline,
            now,
            now,
            payload.keepalive_days,
            payload.last_active
        ],
    )?;

    let license_id = conn.last_insert_rowid();
    get_license_by_id(conn, user_id, license_id)?.ok_or_else(|| anyhow!("failed to load created license"))
}

pub fn update_license(
    conn: &Connection,
    user_id: i64,
    license_id: i64,
    payload: LicenseUpdate,
) -> Result<Option<License>> {
    let existing = get_license_by_id(conn, user_id, license_id)?;

    if let Some(existing) = existing {
        let updated = sanitize_license_payload(LicensePayload {
            product_name: payload.product_name.unwrap_or(existing.product_name),
            license_key: payload.license_key.unwrap_or(existing.license_key),
            purchase_date: payload.purchase_date.or(existing.purchase_date),
            expiry_date: payload.expiry_date.or(existing.expiry_date),
            status: payload.status.or(Some(existing.status)),
            source_site: payload.source_site.or(existing.source_site),
            product_url: payload.product_url.or(existing.product_url),
            redemption_url: payload.redemption_url.or(existing.redemption_url),
            download_url: payload.download_url.or(existing.download_url),
            notes: payload.notes.or(existing.notes),
            action_required: payload.action_required.or(Some(existing.action_required)),
            action_description: payload.action_description.or(existing.action_description),
            action_deadline: payload.action_deadline.or(existing.action_deadline),
            keepalive_days: payload.keepalive_days.or(existing.keepalive_days),
            last_active: payload.last_active.or(existing.last_active),
        })?;

        conn.execute(
            "UPDATE licenses SET
                product_name = ?, license_key = ?, purchase_date = ?, expiry_date = ?, status = ?, source_site = ?,
                product_url = ?, redemption_url = ?, download_url = ?, notes = ?, action_required = ?,
                action_description = ?, action_deadline = ?, keepalive_days = ?, last_active = ?, updated_at = ?
             WHERE id = ? AND user_id = ?",
            params![
                updated.product_name,
                updated.license_key,
                updated.purchase_date,
                updated.expiry_date,
                updated.status.unwrap_or_else(|| "active".to_string()),
                updated.source_site,
                updated.product_url,
                updated.redemption_url,
                updated.download_url,
                updated.notes,
                updated.action_required.unwrap_or(false) as i64,
                updated.action_description,
                updated.action_deadline,
                updated.keepalive_days,
                updated.last_active,
                now_string(),
                license_id,
                user_id
            ],
        )?;

        return get_license_by_id(conn, user_id, license_id);
    }

    Ok(None)
}

/// Records today as the license's last-active date — the user confirming they
/// logged into the product, which resets the keep-alive clock.
pub fn mark_license_active(
    conn: &Connection,
    user_id: i64,
    license_id: i64,
) -> Result<Option<License>> {
    let today = today_local().to_string();
    let changed = conn.execute(
        "UPDATE licenses SET last_active = ?, updated_at = ? WHERE id = ? AND user_id = ?",
        params![today, now_string(), license_id, user_id],
    )?;
    if changed == 0 {
        return Ok(None);
    }
    get_license_by_id(conn, user_id, license_id)
}

pub fn delete_license(conn: &Connection, user_id: i64, license_id: i64) -> Result<bool> {
    let deleted = conn.execute(
        "DELETE FROM licenses WHERE id = ? AND user_id = ?",
        params![license_id, user_id],
    )?;

    Ok(deleted > 0)
}

pub fn get_license_stats(conn: &Connection, user_id: i64) -> Result<LicenseStats> {
    let licenses = get_licenses(conn, user_id)?;
    let now = today_local();
    let thirty_days = reminder_window_end(now);

    let active = licenses
        .iter()
        .filter(|license| match &license.expiry_date {
            Some(date) => chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
                .map(|parsed| parsed > now)
                .unwrap_or(license.status != "expired"),
            None => license.status != "expired",
        })
        .count();

    let expiring = licenses
        .iter()
        .filter(|license| {
            license.expiry_date.as_ref().and_then(|date| chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").ok())
                .map(|parsed| parsed > now && parsed <= thirty_days)
                .unwrap_or(false)
        })
        .count();

    let expired = licenses
        .iter()
        .filter(|license| match &license.expiry_date {
            Some(date) => chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
                .map(|parsed| parsed <= now)
                .unwrap_or(license.status == "expired"),
            None => license.status == "expired",
        })
        .count();

    Ok(LicenseStats {
        total: licenses.len(),
        active,
        expiring,
        expired,
    })
}

/// Overdue items older than this drop out of the queue. A deadline missed by
/// months is either already lost or already handled; nagging about it daily
/// only trains users to switch reminders off.
const OVERDUE_LOOKBACK_DAYS: i64 = 60;

fn due_status(due: NaiveDate, now: NaiveDate) -> &'static str {
    if due < now {
        "overdue"
    } else if due == now {
        "due-today"
    } else {
        "upcoming"
    }
}

/// Overflow-safe `date + days`; `None` when the result is outside chrono's
/// representable range (only reachable with absurd stored values, but one
/// bad row must never take the whole Reminders page or the scheduler down).
fn add_days(date: NaiveDate, days: i64) -> Option<NaiveDate> {
    date.checked_add_signed(Duration::try_days(days)?)
}

pub fn get_reminder_items(conn: &Connection, user_id: i64) -> Result<Vec<ReminderItem>> {
    let licenses = get_licenses(conn, user_id)?;
    let now = today_local();
    let reminder_window = reminder_window_end(now);
    let lookback_floor = add_days(now, -OVERDUE_LOOKBACK_DAYS).unwrap_or(now);
    let in_window = |due: NaiveDate| due <= reminder_window && due >= lookback_floor;

    let mut items = Vec::new();
    for license in licenses {
        // A license that's already expired/revoked/archived has nothing left
        // to protect; leave it out of the queue entirely.
        if is_inactive_status(&license.status) {
            continue;
        }

        if let Some(expiry_date) = &license.expiry_date {
            if let Ok(parsed) = NaiveDate::parse_from_str(expiry_date, "%Y-%m-%d") {
                if in_window(parsed) {
                    items.push(ReminderItem {
                        license_id: license.id,
                        product_name: license.product_name.clone(),
                        source_site: license.source_site.clone(),
                        kind: "expiry".to_string(),
                        due_date: expiry_date.clone(),
                        status: due_status(parsed, now).to_string(),
                        days_remaining: (parsed - now).num_days(),
                        action_description: None,
                    });
                }
            }
        }

        if license.action_required {
            if let Some(action_deadline) = &license.action_deadline {
                if let Ok(parsed) = NaiveDate::parse_from_str(action_deadline, "%Y-%m-%d") {
                    if in_window(parsed) {
                        items.push(ReminderItem {
                            license_id: license.id,
                            product_name: license.product_name.clone(),
                            source_site: license.source_site.clone(),
                            kind: "action".to_string(),
                            due_date: action_deadline.clone(),
                            status: due_status(parsed, now).to_string(),
                            days_remaining: (parsed - now).num_days(),
                            action_description: license.action_description.clone(),
                        });
                    }
                }
            }
        }

        // Keep-alive: warn before a vendor revokes a lifetime license for
        // inactivity. Due date = last activity (or purchase date) + keepalive_days.
        if let Some(days) = license.keepalive_days.filter(|d| (1..=MAX_KEEPALIVE_DAYS).contains(d)) {
            let baseline = license
                .last_active
                .as_ref()
                .or(license.purchase_date.as_ref())
                .and_then(|date| NaiveDate::parse_from_str(date, "%Y-%m-%d").ok());
            // Target a maintain-by date ahead of the real revocation so the
            // login always lands with a safety margin.
            let lead = std::cmp::max(KEEPALIVE_LEAD_FLOOR_DAYS, days / 4);
            let dates = baseline
                .and_then(|base| add_days(base, days))
                .and_then(|revoke| add_days(revoke, -lead).map(|maintain_by| (revoke, maintain_by)));
            if let Some((revoke, maintain_by)) = dates {
                if in_window(maintain_by) {
                    items.push(ReminderItem {
                        license_id: license.id,
                        product_name: license.product_name.clone(),
                        source_site: license.source_site.clone(),
                        kind: "keepalive".to_string(),
                        due_date: maintain_by.format("%Y-%m-%d").to_string(),
                        status: due_status(maintain_by, now).to_string(),
                        days_remaining: (maintain_by - now).num_days(),
                        action_description: Some(format!(
                            "Log in by {} to stay safe — revoked around {} without activity.",
                            maintain_by.format("%Y-%m-%d"),
                            revoke.format("%Y-%m-%d")
                        )),
                    });
                }
            }
        }
    }

    let mutes = load_reminder_mutes(conn, user_id)?;
    let now_utc = Utc::now();
    items.retain(|item| !reminder_is_suppressed(&mutes, item, now_utc));
    items.sort_by_key(|item| (item.days_remaining, item.kind.clone(), item.product_name.clone()));
    Ok(items)
}

struct ReminderMute {
    license_id: i64,
    kind: String,
    due_date: String,
    action: String,
    snooze_until: Option<String>,
}

fn load_reminder_mutes(conn: &Connection, user_id: i64) -> Result<Vec<ReminderMute>> {
    let mut stmt = conn.prepare(
        "SELECT license_id, kind, due_date, action, snooze_until
         FROM reminder_mutes WHERE user_id = ?",
    )?;
    let rows = stmt.query_map(params![user_id], |row| {
        Ok(ReminderMute {
            license_id: row.get(0)?,
            kind: row.get(1)?,
            due_date: row.get(2)?,
            action: row.get(3)?,
            snooze_until: row.get(4)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn reminder_is_suppressed(mutes: &[ReminderMute], item: &ReminderItem, now: chrono::DateTime<Utc>) -> bool {
    let Some(mute) = mutes.iter().find(|mute| {
        mute.license_id == item.license_id && mute.kind == item.kind && mute.due_date == item.due_date
    }) else {
        return false;
    };
    match mute.action.as_str() {
        "dismiss" => true,
        "snooze" => mute
            .snooze_until
            .as_deref()
            .and_then(|stamp| chrono::DateTime::parse_from_rfc3339(stamp).ok())
            .map(|until| now < until)
            .unwrap_or(false),
        _ => false,
    }
}

const SNOOZE_HOUR_CHOICES: &[i64] = &[1, 4, 24, 72, 168];

fn reminder_kind_ok(kind: &str) -> bool {
    matches!(kind, "expiry" | "action" | "keepalive")
}

fn assert_owned_license(conn: &Connection, user_id: i64, license_id: i64) -> Result<()> {
    let owned: Option<i64> = conn
        .query_row(
            "SELECT id FROM licenses WHERE id = ? AND user_id = ?",
            params![license_id, user_id],
            |row| row.get(0),
        )
        .optional()?;
    if owned.is_none() {
        return Err(anyhow!("License not found."));
    }
    Ok(())
}

/// Hide this reminder occurrence until `hours` from now. A later due date
/// (the next occurrence) is a different row and shows up normally.
pub fn snooze_reminder(
    conn: &Connection,
    user_id: i64,
    license_id: i64,
    kind: &str,
    due_date: &str,
    hours: i64,
) -> Result<()> {
    if !SNOOZE_HOUR_CHOICES.contains(&hours) {
        return Err(anyhow!("Snooze duration must be 1, 4, 24, 72, or 168 hours."));
    }
    if !reminder_kind_ok(kind) {
        return Err(anyhow!("Unknown reminder type."));
    }
    normalize_date(Some(due_date.to_string()), "due_date")?;
    assert_owned_license(conn, user_id, license_id)?;
    let until = (Utc::now() + Duration::hours(hours)).to_rfc3339();
    conn.execute(
        "INSERT INTO reminder_mutes (user_id, license_id, kind, due_date, action, snooze_until)
         VALUES (?, ?, ?, ?, 'snooze', ?)
         ON CONFLICT(user_id, license_id, kind, due_date) DO UPDATE SET
           action = 'snooze', snooze_until = excluded.snooze_until",
        params![user_id, license_id, kind, due_date, until],
    )?;
    Ok(())
}

/// Do not nag again for this exact occurrence. Mark as used is unchanged.
pub fn dismiss_reminder(
    conn: &Connection,
    user_id: i64,
    license_id: i64,
    kind: &str,
    due_date: &str,
) -> Result<()> {
    if !reminder_kind_ok(kind) {
        return Err(anyhow!("Unknown reminder type."));
    }
    normalize_date(Some(due_date.to_string()), "due_date")?;
    assert_owned_license(conn, user_id, license_id)?;
    conn.execute(
        "INSERT INTO reminder_mutes (user_id, license_id, kind, due_date, action, snooze_until)
         VALUES (?, ?, ?, ?, 'dismiss', NULL)
         ON CONFLICT(user_id, license_id, kind, due_date) DO UPDATE SET
           action = 'dismiss', snooze_until = NULL",
        params![user_id, license_id, kind, due_date],
    )?;
    Ok(())
}

/// Items within this many days (including overdue) trigger a background
/// notification. Narrower than the 30-day on-screen reminder window so the
/// background maintainer isn't noisy.
const NOTIFY_WINDOW_DAYS: i64 = 7;

/// Safety margin before a vendor's revocation date. Keep-alive prompts target a
/// "maintain by" date this far ahead — at least this floor, or a quarter of the
/// cadence, whichever is larger — so a login always lands well before the
/// deadline instead of cutting it close.
const KEEPALIVE_LEAD_FLOOR_DAYS: i64 = 7;

/// Accounts that have desktop reminders switched on. The preference used to be
/// stored and ignored (notifications fired for everyone); it is now the gate.
fn notification_user_ids(conn: &Connection) -> Result<Vec<i64>> {
    let mut stmt = conn.prepare("SELECT id FROM users WHERE browser_notifications = 1")?;
    let rows = stmt.query_map([], |row| row.get::<_, i64>(0))?;
    let mut ids = Vec::new();
    for row in rows {
        ids.push(row?);
    }
    Ok(ids)
}

fn already_notified_today(
    conn: &Connection,
    license_id: i64,
    kind: &str,
    today: &str,
) -> Result<bool> {
    let mut stmt = conn
        .prepare("SELECT notified_on FROM reminder_notifications WHERE license_id = ? AND kind = ?")?;
    let value: Option<String> = stmt
        .query_row(params![license_id, kind], |row| row.get(0))
        .optional()?;
    Ok(value.as_deref() == Some(today))
}

fn mark_notified(conn: &Connection, license_id: i64, kind: &str, today: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO reminder_notifications (license_id, kind, notified_on) VALUES (?, ?, ?)
         ON CONFLICT(license_id, kind) DO UPDATE SET notified_on = excluded.notified_on",
        params![license_id, kind, today],
    )?;
    Ok(())
}

/// The background maintainer's heart: finds reminders due within the notify
/// window across every local account that has desktop reminders enabled, and
/// skips any already notified today. Does **not** mark anything — the caller
/// delivers each notice and then calls `mark_notice_delivered`, so a toast that
/// fails to show (Focus Assist, missing notification service, …) is retried on
/// the next tick instead of being silently lost for the day. Each user's queue
/// is computed independently so one bad row can't hide another account's items.
pub fn pending_notifications(conn: &Connection) -> Result<Vec<ReminderNotice>> {
    let today = today_local().to_string();
    let mut notices = Vec::new();

    for user_id in notification_user_ids(conn)? {
        let items = match get_reminder_items(conn, user_id) {
            Ok(items) => items,
            Err(error) => {
                crate::diag::log(&format!("reminder scan failed for user {user_id}: {error}"));
                continue;
            }
        };
        for item in items {
            if item.days_remaining > NOTIFY_WINDOW_DAYS {
                continue;
            }
            if already_notified_today(conn, item.license_id, &item.kind, &today)? {
                continue;
            }

            let title = match (item.kind.as_str(), item.status.as_str()) {
                ("keepalive", "overdue") => format!("Log in now to keep: {}", item.product_name),
                ("keepalive", _) => format!("Keep alive: {}", item.product_name),
                (_, "overdue") => format!("Overdue: {}", item.product_name),
                (_, "due-today") => format!("Due today: {}", item.product_name),
                _ => format!("Soon: {}", item.product_name),
            };
            let body = match item.kind.as_str() {
                "action" | "keepalive" => item
                    .action_description
                    .clone()
                    .unwrap_or_else(|| "Action required to keep this license.".to_string()),
                _ => format!("License expires {}.", item.due_date),
            };

            notices.push(ReminderNotice {
                license_id: item.license_id,
                kind: item.kind,
                title,
                body,
            });
        }
    }

    Ok(notices)
}

/// One due reminder ready to send through the user's own SMTP relay.
/// `settings` includes the relay password for the in-process sender only;
/// it is never returned by the HTTP API.
pub struct OutboundReminder {
    pub to: String,
    pub settings: AccountRecoverySettings,
    pub notice: ReminderNotice,
}

fn email_already_sent_today(conn: &Connection, license_id: i64, kind: &str, today: &str) -> Result<bool> {
    let mut stmt =
        conn.prepare("SELECT notified_on FROM reminder_email_log WHERE license_id = ? AND kind = ?")?;
    let value: Option<String> = stmt
        .query_row(params![license_id, kind], |row| row.get(0))
        .optional()?;
    Ok(value.as_deref() == Some(today))
}

fn reminder_recipient(user: &User, settings: &AccountRecoverySettings) -> Option<String> {
    normalize_optional(user.notification_email.clone())
        .or_else(|| normalize_optional(settings.backup_email.clone()))
        .or_else(|| normalize_optional(Some(user.email.clone())))
}

/// Due reminders for accounts that opted into email, but only when that
/// account's SMTP relay is actually configured. A preference with no relay
/// is logged and skipped — nothing is marked sent.
pub fn pending_email_reminders(conn: &Connection) -> Result<Vec<OutboundReminder>> {
    let today = today_local().to_string();
    let mut stmt = conn.prepare("SELECT id FROM users WHERE email_notifications = 1")?;
    let user_ids: Vec<i64> = stmt.query_map([], |row| row.get(0))?.collect::<Result<Vec<_>, _>>()?;
    drop(stmt);

    let mut outbound = Vec::new();
    for user_id in user_ids {
        let settings = get_account_recovery_settings(conn, user_id)?;
        let smtp_ready = settings
            .smtp_host
            .as_deref()
            .map(str::trim)
            .is_some_and(|host| !host.is_empty());
        if !smtp_ready {
            crate::diag::log(&format!(
                "email reminders are enabled for user {user_id} but SMTP is not configured; no email was sent"
            ));
            continue;
        }
        let Some(user) = get_user_by_id(conn, user_id)? else {
            continue;
        };
        let Some(to) = reminder_recipient(&user, &settings) else {
            crate::diag::log(&format!(
                "email reminders are enabled for user {user_id} but there is no recipient address; no email was sent"
            ));
            continue;
        };

        let items = match get_reminder_items(conn, user_id) {
            Ok(items) => items,
            Err(error) => {
                crate::diag::log(&format!("email reminder scan failed for user {user_id}: {error}"));
                continue;
            }
        };
        for item in items {
            if item.days_remaining > NOTIFY_WINDOW_DAYS {
                continue;
            }
            if email_already_sent_today(conn, item.license_id, &item.kind, &today)? {
                continue;
            }
            let title = format!("Perpetua reminder: {}", item.product_name);
            let body = format!(
                "{}\n\nThis message was sent through the SMTP relay you configured in Perpetua. Perpetua does not operate a mail server.",
                item.action_description
                    .clone()
                    .unwrap_or_else(|| format!("{} is {} ({}).", item.product_name, item.status, item.due_date))
            );
            outbound.push(OutboundReminder {
                to: to.clone(),
                settings: settings.clone(),
                notice: ReminderNotice {
                    license_id: item.license_id,
                    kind: item.kind,
                    title,
                    body,
                },
            });
        }
    }
    Ok(outbound)
}

/// Records that an email reminder was actually accepted by the user's SMTP
/// relay. Callers must not call this when the relay is missing or the send failed.
pub fn mark_email_reminder_sent(conn: &Connection, license_id: i64, kind: &str) -> Result<()> {
    let today = today_local().to_string();
    conn.execute(
        "INSERT INTO reminder_email_log (license_id, kind, notified_on) VALUES (?, ?, ?)
         ON CONFLICT(license_id, kind) DO UPDATE SET notified_on = excluded.notified_on",
        params![license_id, kind, today],
    )?;
    Ok(())
}

/// Records that `notice` was shown today so it isn't repeated until tomorrow.
pub fn mark_notice_delivered(conn: &Connection, notice: &ReminderNotice) -> Result<()> {
    mark_notified(conn, notice.license_id, &notice.kind, &today_local().to_string())
}

/// Collect-and-mark in one step: for the headless `check-reminders` CLI and
/// tests, where "delivery" is printing. Calling it twice in one day yields the
/// items only once (idempotent per day).
pub fn collect_due_notifications(conn: &Connection) -> Result<Vec<ReminderNotice>> {
    let notices = pending_notifications(conn)?;
    for notice in &notices {
        mark_notice_delivered(conn, notice)?;
    }
    Ok(notices)
}

pub fn get_reminder_settings(conn: &Connection, user_id: i64) -> Result<Option<ReminderSettings>> {
    let mut stmt = conn.prepare(
        "SELECT notification_email, email_notifications, browser_notifications
         FROM users
         WHERE id = ?",
    )?;

    Ok(stmt
        .query_row(params![user_id], |row| {
            Ok(ReminderSettings {
                notification_email: row.get(0)?,
                email_notifications: bool_from_sql(row.get(1)?),
                browser_notifications: bool_from_sql(row.get(2)?),
            })
        })
        .optional()?)
}

pub fn update_reminder_settings(
    conn: &Connection,
    user_id: i64,
    payload: ReminderSettingsUpdate,
) -> Result<Option<ReminderSettings>> {
    if payload.email_notifications {
        let recovery = get_account_recovery_settings(conn, user_id)?;
        let smtp_ready = recovery
            .smtp_host
            .as_deref()
            .map(str::trim)
            .is_some_and(|host| !host.is_empty());
        if !smtp_ready {
            return Err(anyhow!(
                "Email reminders need the SMTP relay under Backup email & account recovery. \
                 Nothing was sent, and the toggle was not turned on."
            ));
        }
    }

    conn.execute(
        "UPDATE users
         SET notification_email = ?, email_notifications = ?, browser_notifications = ?
         WHERE id = ?",
        params![
            payload.notification_email,
            payload.email_notifications as i64,
            payload.browser_notifications as i64,
            user_id
        ],
    )?;

    get_reminder_settings(conn, user_id)
}

pub fn mark_onboarding_complete(conn: &Connection, user_id: i64) -> Result<()> {
    conn.execute(
        "UPDATE users SET onboarding_completed = 1 WHERE id = ?",
        params![user_id],
    )?;
    Ok(())
}

pub fn get_account_recovery_settings(conn: &Connection, user_id: i64) -> Result<AccountRecoverySettings> {
    let backup_email: Option<String> = conn.query_row(
        "SELECT backup_email FROM users WHERE id = ?",
        params![user_id],
        |row| row.get(0),
    )?;

    let mut mail = conn
        .query_row(
            "SELECT smtp_host, smtp_port, smtp_username, smtp_password, smtp_from
             FROM mail_settings WHERE user_id = ?",
            params![user_id],
            |row| {
                Ok(AccountRecoverySettings {
                    backup_email: None,
                    smtp_host: row.get(0)?,
                    smtp_port: row.get(1)?,
                    smtp_username: row.get(2)?,
                    smtp_password: row.get(3)?,
                    smtp_from: row.get(4)?,
                    smtp_password_set: false,
                })
            },
        )
        .optional()?
        .unwrap_or_default();

    // Legacy plaintext still sitting in the DB column — either a pre-migration
    // install, or a previous migration attempt that wrote to the keyring but
    // crashed/failed before clearing the column. Basing the retry on "is the
    // column non-empty" (not "did the keyring read miss") means a partial
    // failure gets retried on every subsequent read instead of leaving the
    // plaintext at rest forever the moment the keyring copy exists.
    let legacy_plaintext = mail.smtp_password.clone().filter(|value| !value.is_empty());

    match crate::secret_store::read(crate::secret_store::SMTP, user_id) {
        Some(password) => {
            mail.smtp_password = Some(password);
            if legacy_plaintext.is_some() {
                let _ = conn.execute(
                    "UPDATE mail_settings SET smtp_password = NULL WHERE user_id = ?",
                    params![user_id],
                );
            }
        }
        None => {
            if let Some(legacy) = legacy_plaintext {
                if crate::secret_store::write(crate::secret_store::SMTP, user_id, &legacy).is_ok() {
                    let _ = conn.execute(
                        "UPDATE mail_settings SET smtp_password = NULL WHERE user_id = ?",
                        params![user_id],
                    );
                }
            }
        }
    }

    let smtp_password_set = mail.smtp_password.as_deref().is_some_and(|value| !value.is_empty());
    Ok(AccountRecoverySettings {
        backup_email,
        smtp_password_set,
        ..mail
    })
}

pub fn update_account_recovery_settings(
    conn: &Connection,
    user_id: i64,
    payload: AccountRecoverySettings,
) -> Result<AccountRecoverySettings> {
    let backup_email = normalize_optional(payload.backup_email).map(|e| e.to_lowercase());
    conn.execute(
        "UPDATE users SET backup_email = ? WHERE id = ?",
        params![backup_email, user_id],
    )?;

    // The API never echoes the password back, so a settings form re-submitted
    // without it must mean "unchanged", not "erase it". Clearing the SMTP host
    // is the explicit way to drop the relay (and its password) entirely.
    let smtp_host = normalize_optional(payload.smtp_host);
    match normalize_optional(payload.smtp_password) {
        Some(password) => crate::secret_store::write(crate::secret_store::SMTP, user_id, &password)?,
        None if smtp_host.is_none() => crate::secret_store::write(crate::secret_store::SMTP, user_id, "")?,
        None => {}
    }
    if let Some(port) = payload.smtp_port {
        crate::mail::resolve_port(Some(port))?;
    }

    conn.execute(
        "INSERT INTO mail_settings (user_id, smtp_host, smtp_port, smtp_username, smtp_password, smtp_from)
         VALUES (?, ?, ?, ?, NULL, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           smtp_host = excluded.smtp_host,
           smtp_port = excluded.smtp_port,
           smtp_username = excluded.smtp_username,
           smtp_password = NULL,
           smtp_from = excluded.smtp_from",
        params![
            user_id,
            smtp_host,
            payload.smtp_port,
            normalize_optional(payload.smtp_username),
            normalize_optional(payload.smtp_from),
        ],
    )?;

    get_account_recovery_settings(conn, user_id)
}

/// One-time codes (password reset, share invites) are 8 characters from an
/// alphabet without look-alikes (no 0/O, 1/I/L) — about 2^40 possibilities
/// versus 10^6 for the old six digits, which the 10-requests/minute limiter
/// alone could not make safe across a code's lifetime. Compared
/// case-insensitively so users can type them in either case.
const CODE_ALPHABET: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789";
pub const CODE_LENGTH: usize = 8;

fn generate_code() -> String {
    let mut rng = rand::thread_rng();
    (0..CODE_LENGTH)
        .map(|_| CODE_ALPHABET[rng.gen_range(0..CODE_ALPHABET.len())] as char)
        .collect()
}

fn normalize_code(code: &str) -> String {
    code.trim().to_ascii_uppercase().replace(['-', ' '], "")
}

/// Synchronous half of password-reset request: writes the reset code and hands
/// back what's needed to email it. Kept `.await`-free so callers never hold a
/// `rusqlite::Connection` (not `Send`) across the network send.
/// `None` covers every "can't/shouldn't send" case (no such account, no backup
/// email, no SMTP configured) so a caller can never use this to learn which
/// emails have accounts.
pub fn prepare_password_reset(conn: &Connection, email: &str) -> Result<Option<(AccountRecoverySettings, String, String)>> {
    let Some(user) = get_user_by_email(conn, email)? else {
        return Ok(None);
    };
    let Some(backup_email) = user.backup_email.clone() else {
        return Ok(None);
    };
    let mail_settings = get_account_recovery_settings(conn, user.id)?;
    if mail_settings.smtp_host.is_none() {
        return Ok(None);
    }

    let code = generate_code();
    let code_hash = hash(&code, DEFAULT_COST)?;
    let expires_at = (Utc::now() + Duration::minutes(15)).to_rfc3339();

    // Only the newest code is ever valid: several outstanding codes would
    // multiply a guesser's odds, and the user only has the latest email anyway.
    conn.execute(
        "UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0",
        params![user.id],
    )?;
    conn.execute(
        "INSERT INTO password_resets (user_id, code_hash, expires_at, used, created_at)
         VALUES (?, ?, ?, 0, ?)",
        params![user.id, code_hash, expires_at, now_string()],
    )?;

    Ok(Some((mail_settings, backup_email, code)))
}

pub fn confirm_password_reset(conn: &Connection, email: &str, code: &str, new_password: &str) -> Result<()> {
    validate_credentials(email, new_password)?;
    let user = get_user_by_email(conn, email)?.ok_or_else(|| anyhow!("Invalid or expired code."))?;
    let code = normalize_code(code);

    let mut stmt = conn.prepare(
        "SELECT id, code_hash FROM password_resets
         WHERE user_id = ? AND used = 0 AND expires_at > ?
         ORDER BY id DESC",
    )?;
    let candidates = stmt
        .query_map(params![user.id, Utc::now().to_rfc3339()], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })?
        .filter_map(|r| r.ok());

    let matched_id = candidates
        .into_iter()
        .find(|(_, hash)| verify(&code, hash).unwrap_or(false))
        .map(|(id, _)| id)
        .ok_or_else(|| anyhow!("Invalid or expired code."))?;

    let new_hash = hash(new_password, DEFAULT_COST)?;
    conn.execute(
        "UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?",
        params![new_hash, user.id],
    )?;
    conn.execute(
        "UPDATE password_resets SET used = 1 WHERE id = ?",
        params![matched_id],
    )?;

    Ok(())
}

/// A member is scoped to at most one shared vault in v1 — resolves to the
/// owner's user id if this account has accepted a share invite, else self.
pub fn resolve_data_owner_id(conn: &Connection, user_id: i64) -> Result<i64> {
    Ok(conn
        .query_row(
            "SELECT owner_user_id FROM vault_members
             WHERE member_user_id = ? AND accepted_at IS NOT NULL",
            params![user_id],
            |row| row.get(0),
        )
        .optional()?
        .unwrap_or(user_id))
}

/// Synchronous half of sending a share invite — validates, writes the invite
/// row, and hands back what's needed to email it. `.await`-free for the same
/// reason as `prepare_password_reset`.
pub fn prepare_invite(conn: &Connection, owner_id: i64, email: &str) -> Result<(AccountRecoverySettings, String, String)> {
    if !is_pro(conn)? {
        return Err(anyhow!("Vault sharing is a Pro feature."));
    }
    let trimmed = email.trim();
    if trimmed.is_empty() || !trimmed.contains('@') {
        return Err(anyhow!("Enter a valid email address."));
    }

    let mail_settings = get_account_recovery_settings(conn, owner_id)?;
    if mail_settings.smtp_host.is_none() {
        return Err(anyhow!(
            "Set up your SMTP relay under Backup email & account recovery before sending invites."
        ));
    }

    let code = generate_code();
    let code_hash = hash(&code, DEFAULT_COST)?;
    let expires_at = (Utc::now() + Duration::days(INVITE_EXPIRY_DAYS)).to_rfc3339();
    let member_email = normalize_email(trimmed);

    // Re-inviting the same address supersedes any still-pending invite for it.
    conn.execute(
        "DELETE FROM vault_members
         WHERE owner_user_id = ? AND lower(member_email) = ? AND accepted_at IS NULL",
        params![owner_id, member_email],
    )?;
    conn.execute(
        "INSERT INTO vault_members (owner_user_id, member_email, invite_code_hash, invited_at, expires_at)
         VALUES (?, ?, ?, ?, ?)",
        params![owner_id, member_email, code_hash, now_string(), expires_at],
    )?;

    Ok((mail_settings, member_email, code))
}

/// Pending invites are redeemable for this many days before they expire.
const INVITE_EXPIRY_DAYS: i64 = 7;

/// Redeems a pending invite. Scoped to the redeeming account's own email so one
/// user can't guess and consume an invite meant for someone else, and to
/// unexpired invites only.
pub fn redeem_invite(conn: &Connection, member_user_id: i64, member_email: &str, code: &str) -> Result<()> {
    let code = normalize_code(code);
    let mut stmt = conn.prepare(
        "SELECT id, invite_code_hash FROM vault_members
         WHERE accepted_at IS NULL
           AND lower(member_email) = lower(?)
           AND expires_at IS NOT NULL AND expires_at > ?
         ORDER BY id DESC",
    )?;
    let candidates = stmt
        .query_map(params![member_email, Utc::now().to_rfc3339()], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })?
        .filter_map(|r| r.ok());

    let matched_id = candidates
        .into_iter()
        .find(|(_, hash)| verify(&code, hash).unwrap_or(false))
        .map(|(id, _)| id)
        .ok_or_else(|| anyhow!("Invalid or expired invite code."))?;

    conn.execute(
        "UPDATE vault_members SET member_user_id = ?, accepted_at = ? WHERE id = ?",
        params![member_user_id, now_string(), matched_id],
    )?;

    Ok(())
}

pub fn list_vault_members(conn: &Connection, owner_id: i64) -> Result<Vec<VaultMember>> {
    let mut stmt = conn.prepare(
        "SELECT member_email, invited_at, accepted_at FROM vault_members
         WHERE owner_user_id = ? ORDER BY invited_at DESC",
    )?;
    let rows = stmt.query_map(params![owner_id], |row| {
        Ok(VaultMember {
            email: row.get(0)?,
            invited_at: row.get(1)?,
            accepted_at: row.get(2)?,
        })
    })?;

    let mut members = Vec::new();
    for row in rows {
        members.push(row?);
    }
    Ok(members)
}

fn slugify(name: &str) -> String {
    let base: String = name
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");

    if base.is_empty() {
        "site".to_string()
    } else {
        base
    }
}

fn unique_site_id(conn: &Connection, name: &str) -> Result<String> {
    let base = slugify(name);
    let mut candidate = base.clone();
    let mut suffix = 2;
    loop {
        let exists: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sites WHERE id = ?",
            params![candidate],
            |row| row.get(0),
        )?;
        if exists == 0 {
            return Ok(candidate);
        }
        candidate = format!("{base}-{suffix}");
        suffix += 1;
    }
}

/// Adds a custom marketplace source so Perpetua can track deals from sites beyond
/// the built-in list, then connects it for the requesting user right away.
pub fn create_site(
    conn: &Connection,
    user_id: i64,
    name: &str,
    url: &str,
    description: Option<&str>,
) -> Result<SiteConnection> {
    let name = name.trim();
    let url = url.trim();
    if name.is_empty() {
        return Err(anyhow!("Site name is required"));
    }
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(anyhow!("Site URL must start with http:// or https://"));
    }

    let id = unique_site_id(conn, name)?;
    let description = description
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("Custom site added for tracking lifetime deal purchases.");

    conn.execute(
        "INSERT INTO sites (id, name, url, description, custom) VALUES (?, ?, ?, ?, 1)",
        params![id, name, url, description],
    )?;

    connect_site(conn, user_id, &id)?;

    list_site_connections(conn, user_id)?
        .into_iter()
        .find(|site| site.id == id)
        .ok_or_else(|| anyhow!("failed to load created site"))
}

/// Removes a user-added site definition entirely (for every local account), along
/// with anyone's connection to it. Built-in sites can't be removed this way.
pub fn delete_site(conn: &Connection, site_id: &str) -> Result<()> {
    let is_custom: Option<i64> = conn
        .query_row(
            "SELECT custom FROM sites WHERE id = ?",
            params![site_id],
            |row| row.get(0),
        )
        .optional()?;

    match is_custom {
        None => return Err(anyhow!("Site not found")),
        Some(0) => return Err(anyhow!("Built-in sites can't be removed")),
        Some(_) => {}
    }

    conn.execute("DELETE FROM connected_sites WHERE site_id = ?", params![site_id])?;
    conn.execute("DELETE FROM sites WHERE id = ?", params![site_id])?;
    Ok(())
}

pub fn list_site_connections(conn: &Connection, user_id: i64) -> Result<Vec<SiteConnection>> {
    let mut stmt = conn.prepare(
        "SELECT s.id, s.name, s.url, s.description, cs.connected_at IS NOT NULL, cs.last_synced, s.custom
         FROM sites s
         LEFT JOIN connected_sites cs
           ON cs.site_id = s.id AND cs.user_id = ?
         ORDER BY s.name ASC",
    )?;

    let rows = stmt.query_map(params![user_id], |row| {
        Ok(SiteConnection {
            id: row.get(0)?,
            name: row.get(1)?,
            url: row.get(2)?,
            description: row.get(3)?,
            connected: row.get::<_, i64>(4)? != 0,
            last_synced: row.get(5)?,
            custom: row.get::<_, i64>(6)? != 0,
        })
    })?;

    let mut sites = Vec::new();
    for row in rows {
        sites.push(row?);
    }
    Ok(sites)
}

pub fn connect_site(conn: &Connection, user_id: i64, site_id: &str) -> Result<()> {
    let now = now_string();
    conn.execute(
        "INSERT INTO connected_sites (user_id, site_id, connected_at, last_synced)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, site_id) DO UPDATE SET connected_at = excluded.connected_at, last_synced = excluded.last_synced",
        params![user_id, site_id, now, now],
    )?;
    Ok(())
}

pub fn disconnect_site(conn: &Connection, user_id: i64, site_id: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM connected_sites WHERE user_id = ? AND site_id = ?",
        params![user_id, site_id],
    )?;
    Ok(())
}

pub fn export_licenses_json(conn: &Connection, user_id: i64) -> Result<VaultExportFile> {
    let licenses = get_licenses(conn, user_id)?;
    let snapshot = LicenseExportSnapshot {
        exported_at: now_string(),
        licenses: licenses.iter().map(license_to_payload).collect(),
    };

    Ok(VaultExportFile {
        filename: format!("perpetua-licenses-{}.json", Utc::now().format("%Y-%m-%d")),
        content: serde_json::to_string_pretty(&snapshot)?,
    })
}

pub fn export_licenses_csv(conn: &Connection, user_id: i64) -> Result<VaultExportFile> {
    let licenses = get_licenses(conn, user_id)?;
    let mut writer = csv::Writer::from_writer(Vec::new());

    for license in &licenses {
        writer.serialize(license_to_payload(license))?;
    }

    let content = String::from_utf8(
        writer
            .into_inner()
            .map_err(|error| anyhow!(error.to_string()))?,
    )?;

    Ok(VaultExportFile {
        filename: format!("perpetua-licenses-{}.csv", Utc::now().format("%Y-%m-%d")),
        content,
    })
}

pub fn import_licenses_json(
    conn: &Connection,
    user_id: i64,
    content: &str,
) -> Result<ImportLicensesResult> {
    let parsed: ImportFile = serde_json::from_str(content)?;
    let licenses = match parsed {
        ImportFile::Snapshot(snapshot) => snapshot.licenses,
        ImportFile::Licenses(licenses) => licenses,
    };

    import_license_payloads(conn, user_id, licenses)
}

pub fn import_licenses_csv(
    conn: &Connection,
    user_id: i64,
    content: &str,
) -> Result<ImportLicensesResult> {
    let mut reader = csv::Reader::from_reader(content.as_bytes());
    let mut payloads = Vec::new();

    for row in reader.deserialize::<CsvLicenseRow>() {
        let row = row?;
        payloads.push(LicensePayload {
            product_name: row.product_name,
            license_key: row.license_key,
            purchase_date: row.purchase_date,
            expiry_date: row.expiry_date,
            status: row.status,
            source_site: row.source_site,
            product_url: row.product_url,
            redemption_url: row.redemption_url,
            download_url: row.download_url,
            notes: row.notes,
            action_required: row.action_required,
            action_description: row.action_description,
            action_deadline: row.action_deadline,
            keepalive_days: row.keepalive_days,
            last_active: row.last_active,
        });
    }

    import_license_payloads(conn, user_id, payloads)
}

fn import_license_payloads(
    conn: &Connection,
    user_id: i64,
    payloads: Vec<LicensePayload>,
) -> Result<ImportLicensesResult> {
    let total_rows = payloads.len();
    let mut imported = 0;
    let mut skipped_duplicates = 0;
    let transaction = conn.unchecked_transaction()?;

    for payload in payloads {
        let payload = sanitize_license_payload(payload)?;
        if license_exists(
            &transaction,
            user_id,
            &payload.product_name,
            &payload.license_key,
        )? {
            skipped_duplicates += 1;
            continue;
        }

        add_license(&transaction, user_id, payload)?;
        imported += 1;
    }

    transaction.commit()?;

    Ok(ImportLicensesResult {
        total_rows,
        imported,
        skipped_duplicates,
    })
}

pub fn create_backup(conn: &Connection) -> Result<BackupEntry> {
    let directory = backup_dir()?;
    create_backup_in_dir(conn, &directory)
}

pub fn create_backup_in_dir(conn: &Connection, directory: &std::path::Path) -> Result<BackupEntry> {
    fs::create_dir_all(directory)?;
    let file_name = format!("perpetua-backup-{}.db", Utc::now().format("%Y%m%d-%H%M%S-%3f"));
    let backup_path = directory.join(&file_name);
    let mut destination = Connection::open(&backup_path)?;
    let backup = Backup::new(conn, &mut destination)?;
    backup.step(-1)?;
    drop(backup);
    destination.execute_batch("PRAGMA wal_checkpoint(FULL);")?;

    rotate_backups(directory)?;
    backup_entry_from_path(&backup_path)
}

pub fn list_backups() -> Result<Vec<BackupEntry>> {
    let directory = backup_dir()?;
    list_backups_in_dir(&directory)
}

pub fn list_backups_in_dir(directory: &std::path::Path) -> Result<Vec<BackupEntry>> {
    fs::create_dir_all(directory)?;
    let mut entries = Vec::new();

    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) == Some("db") {
            entries.push(backup_entry_from_path(&path)?);
        }
    }

    entries.sort_by_key(|entry| Reverse(entry.created_at.clone()));
    Ok(entries)
}

fn backup_entry_from_path(path: &std::path::Path) -> Result<BackupEntry> {
    let metadata = fs::metadata(path)?;
    let created_at = metadata
        .modified()
        .map(chrono::DateTime::<Utc>::from)?
        .to_rfc3339();

    Ok(BackupEntry {
        file_name: path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| anyhow!("invalid backup file name"))?
            .to_string(),
        created_at,
        size_bytes: metadata.len(),
    })
}

fn rotate_backups(directory: &std::path::Path) -> Result<()> {
    let mut backups = Vec::new();

    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("db") {
            continue;
        }
        // Pre-restore safety snapshots are kept until the user removes them.
        let is_rotating_backup = path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with("perpetua-backup-"));
        if !is_rotating_backup {
            continue;
        }
        let metadata = entry.metadata()?;
        backups.push((metadata.modified()?, path));
    }

    backups.sort_by_key(|(modified, _)| Reverse(*modified));
    for (_, path) in backups.into_iter().skip(MAX_BACKUPS) {
        fs::remove_file(path)?;
    }

    Ok(())
}

/// Everything the async cloud-sync step (route handler) needs, gathered while
/// the DB lock is briefly held. Owned values only — this crosses an `.await`
/// boundary in the caller, so it must not borrow from `conn`.
pub struct CloudSyncContext {
    pub webdav_url: String,
    pub webdav_username: String,
    pub webdav_password: String,
    pub remote_path: String,
    pub recovery_key: String,
    pub backup_path: std::path::PathBuf,
}

pub fn get_cloud_backup_settings(conn: &Connection, user_id: i64) -> Result<CloudBackupSettings> {
    let mut settings = conn
        .query_row(
            "SELECT enabled, webdav_url, webdav_username, remote_path, recovery_key_generated_at, last_synced_at, last_sync_error,
                    schedule_enabled, schedule_interval_hours
             FROM cloud_backup_settings WHERE user_id = ?",
            params![user_id],
            |row| {
                let hours: i64 = row.get(8)?;
                Ok(CloudBackupSettings {
                    enabled: bool_from_sql(row.get(0)?),
                    webdav_url: row.get(1)?,
                    webdav_username: row.get(2)?,
                    remote_path: row.get(3)?,
                    recovery_key_generated_at: row.get(4)?,
                    last_synced_at: row.get(5)?,
                    last_sync_error: row.get(6)?,
                    schedule_enabled: bool_from_sql(row.get(7)?),
                    schedule_interval_hours: if hours > 0 { hours } else { 24 },
                })
            },
        )
        .optional()?
        .unwrap_or_default();
    if settings.schedule_interval_hours <= 0 {
        settings.schedule_interval_hours = 24;
    }
    Ok(settings)
}

/// Enables (or updates) cloud backup. The AES-256 recovery key is generated the
/// first time and then kept stable — the backup already sitting in the cloud is
/// encrypted under it, and silently rotating would make that copy
/// undecryptable until the next sync. Rotation is explicit (`rotate_key`).
/// Returns the new recovery key only when one was generated; `None` means the
/// existing key still applies and there is nothing new to show or email.
pub fn enable_cloud_backup(
    conn: &Connection,
    user_id: i64,
    settings: EnableCloudBackupRequest,
) -> Result<(AccountRecoverySettings, String, Option<String>)> {
    if !is_pro(conn)? {
        return Err(anyhow!("Cloud backup is a Pro feature."));
    }

    let mail_settings = get_account_recovery_settings(conn, user_id)?;
    let backup_email = mail_settings
        .backup_email
        .clone()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| {
            anyhow!(
                "Set a backup email under Backup email & account recovery before enabling cloud \
                 backup — it's where your recovery key safety-net copy goes."
            )
        })?;
    if mail_settings.smtp_host.is_none() {
        return Err(anyhow!("Set up your SMTP relay before enabling cloud backup."));
    }

    let webdav_url = settings.webdav_url.trim().to_string();
    let webdav_username = settings.webdav_username.trim().to_string();
    let remote_path = settings.remote_path.trim().to_string();
    if webdav_url.is_empty() {
        return Err(anyhow!("WebDAV server URL is required."));
    }
    crate::cloud_backup::validate_server_url(&webdav_url)?;

    let existing_password = crate::secret_store::read(crate::secret_store::WEBDAV_PASSWORD, user_id);
    if settings.webdav_password.is_empty() {
        if existing_password.is_none() {
            return Err(anyhow!("WebDAV password is required."));
        }
    } else {
        crate::secret_store::write(crate::secret_store::WEBDAV_PASSWORD, user_id, &settings.webdav_password)?;
    }

    let existing_key = crate::secret_store::read(crate::secret_store::BACKUP_KEY, user_id);
    let new_key = if settings.rotate_key || existing_key.is_none() {
        let key = crate::cloud_backup::generate_recovery_key();
        crate::secret_store::write(crate::secret_store::BACKUP_KEY, user_id, &key)?;
        Some(key)
    } else {
        None
    };

    conn.execute(
        "INSERT INTO cloud_backup_settings (user_id, enabled, webdav_url, webdav_username, webdav_password, remote_path, recovery_key_generated_at)
         VALUES (?, 1, ?, ?, NULL, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           enabled = 1, webdav_url = excluded.webdav_url, webdav_username = excluded.webdav_username,
           webdav_password = NULL, remote_path = excluded.remote_path,
           recovery_key_generated_at = COALESCE(?, cloud_backup_settings.recovery_key_generated_at)",
        params![
            user_id,
            webdav_url,
            webdav_username,
            remote_path,
            now_string(),
            new_key.as_ref().map(|_| now_string()),
        ],
    )?;

    Ok((mail_settings, backup_email, new_key))
}

/// Prepares everything a manual "back up to cloud now" needs, and produces a
/// fresh local backup — all synchronous, done while the DB lock is held. The
/// caller (the API route handler) must drop the lock before doing the actual
/// network upload; see `record_cloud_sync_result` for recording the outcome
/// afterward under a fresh, brief lock.
pub struct CloudAccess {
    pub webdav_url: String,
    pub webdav_username: String,
    pub webdav_password: String,
    pub remote_path: String,
    pub recovery_key: String,
}

pub fn load_cloud_access(conn: &Connection, user_id: i64) -> Result<CloudAccess> {
    if !is_pro(conn)? {
        return Err(anyhow!("Cloud backup is a Pro feature."));
    }

    let (enabled, webdav_url, webdav_username, remote_path) = conn
        .query_row(
            "SELECT enabled, webdav_url, webdav_username, remote_path FROM cloud_backup_settings WHERE user_id = ?",
            params![user_id],
            |row| {
                Ok((
                    bool_from_sql(row.get(0)?),
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        )
        .optional()?
        .ok_or_else(|| anyhow!("Cloud backup isn't set up yet."))?;

    if !enabled {
        return Err(anyhow!("Cloud backup isn't enabled."));
    }
    let webdav_url = webdav_url.ok_or_else(|| anyhow!("Cloud backup isn't fully configured."))?;
    let webdav_username = webdav_username.unwrap_or_default();

    let webdav_password = crate::secret_store::read(crate::secret_store::WEBDAV_PASSWORD, user_id)
        .ok_or_else(|| anyhow!("WebDAV password is missing — re-enable cloud backup to re-enter it."))?;
    let recovery_key = crate::secret_store::read(crate::secret_store::BACKUP_KEY, user_id)
        .ok_or_else(|| anyhow!("Recovery key is missing — re-enable cloud backup to generate a new one."))?;

    Ok(CloudAccess {
        webdav_url,
        webdav_username,
        webdav_password,
        remote_path,
        recovery_key,
    })
}

pub fn prepare_cloud_sync(conn: &Connection, user_id: i64) -> Result<CloudSyncContext> {
    let access = load_cloud_access(conn, user_id)?;
    let directory = backup_dir()?;
    let backup_entry = create_backup_in_dir(conn, &directory)?;
    let backup_path = directory.join(&backup_entry.file_name);

    Ok(CloudSyncContext {
        webdav_url: access.webdav_url,
        webdav_username: access.webdav_username,
        webdav_password: access.webdav_password,
        remote_path: access.remote_path,
        recovery_key: access.recovery_key,
        backup_path,
    })
}

/// Newest license or account timestamp in this vault. Used as the
/// last-write-wins clock for multi-device sync.
pub fn vault_revision(conn: &Connection) -> Result<String> {
    let from_licenses: Option<String> =
        conn.query_row("SELECT MAX(updated_at) FROM licenses", [], |row| row.get(0))?;
    let from_users: Option<String> =
        conn.query_row("SELECT MAX(created_at) FROM users", [], |row| row.get(0))?;
    Ok(match (from_licenses, from_users) {
        (Some(licenses), Some(users)) if licenses >= users => licenses,
        (Some(_), Some(users)) => users,
        (Some(licenses), None) => licenses,
        (None, Some(users)) => users,
        (None, None) => String::new(),
    })
}

pub fn revision_from_sqlite_bytes(bytes: &[u8]) -> Result<String> {
    let path = std::env::temp_dir().join(format!("perpetua-rev-{}.db", uuid::Uuid::new_v4()));
    fs::write(&path, bytes)?;
    let revision = match Connection::open(&path) {
        Ok(remote) => vault_revision(&remote),
        Err(error) => Err(anyhow!("Remote backup is not a readable vault: {error}")),
    };
    let _ = fs::remove_file(&path);
    let revision = revision?;
    if revision.is_empty() {
        return Err(anyhow!("Remote backup does not look like a Perpetua vault."));
    }
    Ok(revision)
}

/// Compares revisions only. Does not restore or upload.
/// A wrong-key ciphertext is not a vault and returns an error, so the caller
/// must not replace the local database.
pub fn plan_device_sync(conn: &Connection, remote_plaintext: &[u8]) -> Result<crate::models::DeviceSyncResult> {
    let local_revision = vault_revision(conn)?;
    let remote_revision = revision_from_sqlite_bytes(remote_plaintext)?;
    let action = match crate::cloud_backup::decide_sync(&local_revision, &remote_revision) {
        crate::cloud_backup::SyncDecision::Upload => "upload",
        crate::cloud_backup::SyncDecision::Download => "download",
        crate::cloud_backup::SyncDecision::UpToDate => "up_to_date",
    };
    Ok(crate::models::DeviceSyncResult {
        action: action.to_string(),
        local_revision,
        remote_revision,
    })
}

/// Records the outcome of a cloud-sync attempt after the (lock-free) network
/// upload completes. Called under a fresh, brief lock, separate from
/// `prepare_cloud_sync`.
pub fn record_cloud_sync_result(conn: &Connection, user_id: i64, error: Option<&str>) -> Result<()> {
    if let Some(error) = error {
        crate::diag::log(&format!("cloud backup failed for user {user_id}: {error}"));
        conn.execute(
            "UPDATE cloud_backup_settings SET last_sync_error = ? WHERE user_id = ?",
            params![error, user_id],
        )?;
    } else {
        conn.execute(
            "UPDATE cloud_backup_settings SET last_synced_at = ?, last_sync_error = NULL WHERE user_id = ?",
            params![now_string(), user_id],
        )?;
    }
    Ok(())
}

pub const CLOUD_SCHEDULE_HOURS: &[i64] = &[6, 12, 24, 168];

/// Whether a scheduled upload should run. Off unless the user opted in.
/// A missing or unparseable last-success time is due; a recent success is not.
pub fn cloud_schedule_due(
    enabled: bool,
    interval_hours: i64,
    last_synced_at: Option<&str>,
    now: chrono::DateTime<Utc>,
) -> bool {
    if !enabled {
        return false;
    }
    let hours = if CLOUD_SCHEDULE_HOURS.contains(&interval_hours) {
        interval_hours
    } else {
        24
    };
    let Some(stamp) = last_synced_at.filter(|value| !value.is_empty()) else {
        return true;
    };
    let Ok(synced) = chrono::DateTime::parse_from_rfc3339(stamp) else {
        return true;
    };
    now.signed_duration_since(synced.with_timezone(&Utc)) >= Duration::hours(hours)
}

pub fn set_cloud_schedule(
    conn: &Connection,
    user_id: i64,
    enabled: bool,
    interval_hours: i64,
) -> Result<CloudBackupSettings> {
    if !is_pro(conn)? {
        return Err(anyhow!("Cloud backup is a Pro feature."));
    }
    if enabled && !CLOUD_SCHEDULE_HOURS.contains(&interval_hours) {
        return Err(anyhow!("Schedule interval must be 6, 12, 24, or 168 hours."));
    }
    let hours = if CLOUD_SCHEDULE_HOURS.contains(&interval_hours) {
        interval_hours
    } else {
        24
    };
    let changed = conn.execute(
        "UPDATE cloud_backup_settings
         SET schedule_enabled = ?, schedule_interval_hours = ?
         WHERE user_id = ? AND enabled = 1",
        params![enabled as i64, hours, user_id],
    )?;
    if changed == 0 {
        return Err(anyhow!("Turn on cloud backup before scheduling it."));
    }
    get_cloud_backup_settings(conn, user_id)
}

pub fn users_due_for_scheduled_sync(conn: &Connection, now: chrono::DateTime<Utc>) -> Result<Vec<i64>> {
    let mut stmt = conn.prepare(
        "SELECT user_id, schedule_interval_hours, last_synced_at
         FROM cloud_backup_settings
         WHERE enabled = 1 AND schedule_enabled = 1",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, Option<String>>(2)?,
        ))
    })?;
    let mut due = Vec::new();
    for row in rows {
        let (user_id, hours, last_synced) = row?;
        if cloud_schedule_due(true, hours, last_synced.as_deref(), now) {
            due.push(user_id);
        }
    }
    Ok(due)
}

/// Replaces the live vault database with `plaintext` (a decrypted backup
/// file's bytes) and swaps it into the shared connection in place — no app
/// restart needed. Returns the file name of the automatic pre-restore
/// snapshot when the install already held a vault.
pub async fn restore_vault_from_bytes(db: &Arc<Mutex<Connection>>, plaintext: &[u8]) -> Result<Option<String>> {
    restore_vault_from_bytes_at(db, plaintext, &db_path()?, &backup_dir()?).await
}

/// Path-explicit half of `restore_vault_from_bytes`, so tests can point it at
/// a tempdir instead of the real OS app-data directory.
///
/// Order of operations, each step guarding the next:
/// 1. write the candidate to a sibling temp file;
/// 2. verify it (SQLite integrity check + it is a Perpetua vault) and run the
///    current schema migrations on it, so a backup from an older release
///    comes up with every column the running code expects;
/// 3. snapshot the live vault into the backups folder (never rotated away);
/// 4. swap: live → `.bak`, candidate → live, reopen; if reopening fails the
///    `.bak` is moved back so the app is never left on an empty database.
pub async fn restore_vault_from_bytes_at(
    db: &Arc<Mutex<Connection>>,
    plaintext: &[u8],
    path: &std::path::Path,
    snapshot_dir: &std::path::Path,
) -> Result<Option<String>> {
    let tmp_path = path.with_extension("db.restoring");
    fs::write(&tmp_path, plaintext)?;

    let prepared = (|| -> Result<()> {
        verify_vault_file(&tmp_path)?;
        let candidate = Connection::open(&tmp_path)?;
        apply_schema(&candidate)?;
        Ok(())
    })();
    if let Err(error) = prepared {
        let _ = fs::remove_file(&tmp_path);
        return Err(anyhow!("Backup can't be restored: {error}"));
    }

    let mut guard = db.lock().await;

    let snapshot = if vault_has_users(&guard).unwrap_or(false) {
        Some(snapshot_before_restore(&guard, snapshot_dir)?)
    } else {
        None
    };

    // Release the old connection's file handle before renaming over it —
    // required on Windows, which won't allow replacing an open file.
    drop(std::mem::replace(&mut *guard, Connection::open_in_memory()?));
    let bak_path = path.with_extension("db.pre-restore");
    let had_live_file = path.exists();
    if had_live_file {
        fs::rename(path, &bak_path)?;
    }
    let swapped = fs::rename(&tmp_path, path).and_then(|_| Connection::open(path).map_err(std::io::Error::other));
    match swapped {
        Ok(conn) => {
            *guard = conn;
            if had_live_file {
                let _ = fs::remove_file(&bak_path);
            }
            Ok(snapshot)
        }
        Err(error) => {
            crate::diag::log(&format!("restore swap failed, rolling back: {error}"));
            if had_live_file {
                let _ = fs::remove_file(path);
                let _ = fs::rename(&bak_path, path);
            }
            *guard = Connection::open(path).or_else(|_| Connection::open_in_memory())?;
            Err(anyhow!("Restore failed while swapping databases; your previous vault was kept: {error}"))
        }
    }
}

/// Copies the live vault into `directory` under a name the normal backup
/// rotation leaves alone (`rotate_backups` only counts `perpetua-backup-*`),
/// so an accidental restore is always undoable by hand.
fn snapshot_before_restore(conn: &Connection, directory: &std::path::Path) -> Result<String> {
    fs::create_dir_all(directory)?;
    let file_name = format!("perpetua-pre-restore-{}.db", Utc::now().format("%Y%m%d-%H%M%S-%3f"));
    let snapshot_path = directory.join(&file_name);
    let mut destination = Connection::open(&snapshot_path)?;
    let backup = Backup::new(conn, &mut destination)?;
    backup.step(-1)?;
    drop(backup);
    Ok(file_name)
}
