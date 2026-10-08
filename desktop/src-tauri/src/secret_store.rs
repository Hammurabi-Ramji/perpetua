//! Where Perpetua-managed secrets live: the OS credential store (Windows
//! Credential Manager / macOS Keychain / Secret Service) rather than the
//! SQLite vault, so they aren't sitting in plaintext on disk next to license
//! keys. Each secret class gets its own keyring service name (see the
//! constants below) so unrelated secrets never collide, and each is further
//! keyed by an account string (a user id, or `user_id:license_id` for a
//! vendor credential).

#[cfg(not(test))]
mod imp {
    use anyhow::{anyhow, Result};

    fn entry(service: &str, account: &str) -> Result<keyring::Entry> {
        keyring::Entry::new(service, account).map_err(|err| anyhow!(err.to_string()))
    }

    pub fn read_account(service: &str, account: &str) -> Option<String> {
        entry(service, account).ok()?.get_password().ok()
    }

    pub fn write_account(service: &str, account: &str, value: &str) -> Result<()> {
        let entry = entry(service, account)?;
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
    use std::cell::RefCell;

    // Per-thread so parallel tests with the same user id do not share a
    // recovery key or SMTP password. `#[tokio::test]` uses a current-thread
    // runtime, so a single test still sees its own writes.
    thread_local! {
        static STORE: RefCell<Vec<(String, String, String)>> = RefCell::new(Vec::new());
    }

    pub fn read_account(service: &str, account: &str) -> Option<String> {
        STORE.with(|store| {
            store
                .borrow()
                .iter()
                .find(|(stored_service, stored_account, _)| stored_service == service && stored_account == account)
                .map(|(_, _, value)| value.clone())
        })
    }

    pub fn write_account(service: &str, account: &str, value: &str) -> Result<()> {
        STORE.with(|store| {
            let mut store = store.borrow_mut();
            store.retain(|(stored_service, stored_account, _)| !(stored_service == service && stored_account == account));
            if !value.is_empty() {
                store.push((service.to_string(), account.to_string(), value.to_string()));
            }
        });
        Ok(())
    }
}

pub const SMTP: &str = "com.perpetua.app.smtp";
pub const WEBDAV_PASSWORD: &str = "com.perpetua.app.webdav-password";
pub const BACKUP_KEY: &str = "com.perpetua.app.backup-key";
/// Vendor login for Auto-Maintain. Keyed by `{user_id}:{license_id}`.
/// Never written to SQLite and never returned by the API.
pub const VENDOR_CRED: &str = "com.perpetua.app.vendor-cred";

pub fn read(service: &str, user_id: i64) -> Option<String> {
    read_account(service, &user_id.to_string())
}

pub fn write(service: &str, user_id: i64, value: &str) -> anyhow::Result<()> {
    write_account(service, &user_id.to_string(), value)
}

pub fn read_account(service: &str, account: &str) -> Option<String> {
    imp::read_account(service, account)
}

pub fn write_account(service: &str, account: &str, value: &str) -> anyhow::Result<()> {
    imp::write_account(service, account, value)
}
