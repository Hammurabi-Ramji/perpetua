//! Where Perpetua-managed secrets live: the OS credential store (Windows
//! Credential Manager / macOS Keychain / Secret Service) rather than the
//! SQLite vault, so they aren't sitting in plaintext on disk next to license
//! keys. Each secret class gets its own keyring service name (see the
//! constants below) so unrelated secrets never collide, and each is further
//! keyed by user id.

#[cfg(not(test))]
mod imp {
    use anyhow::{anyhow, Result};

    fn entry(service: &str, user_id: i64) -> Result<keyring::Entry> {
        keyring::Entry::new(service, &user_id.to_string()).map_err(|err| anyhow!(err.to_string()))
    }

    pub fn read(service: &str, user_id: i64) -> Option<String> {
        entry(service, user_id).ok()?.get_password().ok()
    }

    pub fn write(service: &str, user_id: i64, value: &str) -> Result<()> {
        let entry = entry(service, user_id)?;
        if value.is_empty() {
            match entry.delete_credential() {
                Ok(()) => Ok(()),
                Err(keyring::Error::NoEntry) => Ok(()),
                Err(err) => Err(anyhow!(err.to_string())),
            }
        } else {
            entry.set_password(value).map_err(|err| anyhow!(err.to_string()))
        }
    }
}

/// Test-only stand-in so the suite never touches the real OS credential store
/// on the machine running it.
#[cfg(test)]
mod imp {
    use anyhow::Result;
    use std::sync::Mutex;

    static STORE: Mutex<Vec<(String, i64, String)>> = Mutex::new(Vec::new());

    pub fn read(service: &str, user_id: i64) -> Option<String> {
        STORE
            .lock()
            .unwrap()
            .iter()
            .find(|(s, id, _)| s == service && *id == user_id)
            .map(|(_, _, value)| value.clone())
    }

    pub fn write(service: &str, user_id: i64, value: &str) -> Result<()> {
        let mut store = STORE.lock().unwrap();
        store.retain(|(s, id, _)| !(s == service && *id == user_id));
        if !value.is_empty() {
            store.push((service.to_string(), user_id, value.to_string()));
        }
        Ok(())
    }
}

pub const SMTP: &str = "com.perpetua.app.smtp";
pub const WEBDAV_PASSWORD: &str = "com.perpetua.app.webdav-password";
pub const BACKUP_KEY: &str = "com.perpetua.app.backup-key";

pub fn read(service: &str, user_id: i64) -> Option<String> {
    imp::read(service, user_id)
}

pub fn write(service: &str, user_id: i64, value: &str) -> anyhow::Result<()> {
    imp::write(service, user_id, value)
}
