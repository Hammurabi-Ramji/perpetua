use anyhow::Result;
use rusqlite::Connection;
use std::path::{Path, PathBuf};

const APP_DIR: &str = "perpetua";
const DB_FILE: &str = "licenses.db";
const SECRET_FILE: &str = "jwt.secret";
const BACKUP_DIR: &str = "backups";

fn app_data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join(APP_DIR)
}

fn ensure_dir(dir: &Path) -> Result<PathBuf> {
    std::fs::create_dir_all(dir)?;
    Ok(dir.to_path_buf())
}

pub fn db_path() -> Result<PathBuf> {
    db_path_at(&app_data_dir())
}

pub fn backup_dir() -> Result<PathBuf> {
    backup_dir_at(&app_data_dir())
}

pub fn db_path_at(base_dir: &Path) -> Result<PathBuf> {
    Ok(ensure_dir(base_dir)?.join(DB_FILE))
}

pub fn backup_dir_at(base_dir: &Path) -> Result<PathBuf> {
    let dir = ensure_dir(base_dir)?.join(BACKUP_DIR);
    ensure_dir(&dir)
}

fn seed_supported_sites(conn: &Connection) -> Result<()> {
    let supported_sites = [
        (
            "appsumo",
            "AppSumo",
            "https://appsumo.com",
            "Track local AppSumo purchases and sync metadata manually."
        ),
        (
            "producthunt",
            "Product Hunt",
            "https://www.producthunt.com",
            "Track Product Hunt deal purchases and redemptions."
        ),
        (
            "stacksocial",
            "StackSocial",
            "https://www.stacksocial.com",
            "Track StackSocial purchases and expiration status."
        ),
        (
            "humblebundle",
            "Humble Bundle",
            "https://www.humblebundle.com",
            "Track Humble Bundle libraries and key redemption work."
        ),
    ];

    for (id, name, url, description) in supported_sites {
        conn.execute(
            "INSERT OR IGNORE INTO sites (id, name, url, description) VALUES (?, ?, ?, ?)",
            [id, name, url, description],
        )?;
    }

    Ok(())
}

pub fn init_db() -> Result<Connection> {
    init_db_at(&app_data_dir())
}

pub fn init_db_at(base_dir: &Path) -> Result<Connection> {
    let conn = Connection::open(db_path_at(base_dir)?)?;

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            notification_email TEXT,
            email_notifications INTEGER NOT NULL DEFAULT 1,
            browser_notifications INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            last_login TEXT
        );

        CREATE TABLE IF NOT EXISTS licenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            product_name TEXT NOT NULL,
            license_key TEXT NOT NULL,
            purchase_date TEXT,
            expiry_date TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            source_site TEXT,
            product_url TEXT,
            redemption_url TEXT,
            download_url TEXT,
            notes TEXT,
            action_required INTEGER NOT NULL DEFAULT 0,
            action_description TEXT,
            action_deadline TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            keepalive_days INTEGER,
            last_active TEXT,
            FOREIGN KEY (user_id) REFERENCES users (id)
        );

        CREATE TABLE IF NOT EXISTS sites (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            description TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS app_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS reminder_notifications (
            license_id INTEGER NOT NULL,
            kind TEXT NOT NULL,
            notified_on TEXT NOT NULL,
            PRIMARY KEY (license_id, kind)
        );

        CREATE TABLE IF NOT EXISTS connected_sites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            site_id TEXT NOT NULL,
            connected_at TEXT NOT NULL,
            last_synced TEXT,
            FOREIGN KEY (user_id) REFERENCES users (id),
            FOREIGN KEY (site_id) REFERENCES sites (id),
            UNIQUE(user_id, site_id)
        );

        CREATE TABLE IF NOT EXISTS mail_settings (
            user_id INTEGER PRIMARY KEY,
            smtp_host TEXT,
            smtp_port INTEGER,
            smtp_username TEXT,
            smtp_password TEXT,
            smtp_from TEXT,
            FOREIGN KEY (user_id) REFERENCES users (id)
        );

        CREATE TABLE IF NOT EXISTS password_resets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            code_hash TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            used INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        );

        CREATE TABLE IF NOT EXISTS vault_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_user_id INTEGER NOT NULL,
            member_email TEXT NOT NULL,
            member_user_id INTEGER,
            invite_code_hash TEXT NOT NULL,
            invited_at TEXT NOT NULL,
            accepted_at TEXT,
            FOREIGN KEY (owner_user_id) REFERENCES users (id),
            FOREIGN KEY (member_user_id) REFERENCES users (id)
        );
        ",
    )?;

    // Migrate existing vaults: add keep-alive columns if missing. ALTER fails when
    // the column already exists, which is fine to ignore.
    let _ = conn.execute("ALTER TABLE licenses ADD COLUMN keepalive_days INTEGER", []);
    let _ = conn.execute("ALTER TABLE licenses ADD COLUMN last_active TEXT", []);
    // Distinguishes user-added sites (deletable) from the built-in seeded ones (not).
    let _ = conn.execute(
        "ALTER TABLE sites ADD COLUMN custom INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE users ADD COLUMN onboarding_completed INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = conn.execute("ALTER TABLE users ADD COLUMN backup_email TEXT", []);
    // Pending invites now expire (see prepare_invite). redeem_invite requires
    // expires_at to be set and in the future, so any pre-migration invite rows
    // (NULL expires_at) simply can no longer be redeemed — fail closed rather
    // than treating them as never-expiring.
    let _ = conn.execute("ALTER TABLE vault_members ADD COLUMN expires_at TEXT", []);

    seed_supported_sites(&conn)?;
    Ok(conn)
}

pub fn load_or_create_jwt_secret() -> Result<String> {
    load_or_create_jwt_secret_at(&app_data_dir())
}

pub fn load_or_create_jwt_secret_at(base_dir: &Path) -> Result<String> {
    let secret_path = ensure_dir(base_dir)?.join(SECRET_FILE);

    if Path::new(&secret_path).exists() {
        return Ok(std::fs::read_to_string(secret_path)?.trim().to_string());
    }

    let secret = uuid::Uuid::new_v4().to_string();
    std::fs::write(secret_path, &secret)?;
    Ok(secret)
}
