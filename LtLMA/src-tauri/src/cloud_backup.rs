//! Encrypted off-device backup over WebDAV (Pro feature).
//!
//! The local `.db` backup produced by `services::create_backup_in_dir` is
//! encrypted with AES-256-GCM before it ever leaves the device, then PUT to a
//! user-supplied WebDAV server (Koofr is the first one this has been proven
//! against; any WebDAV-speaking server works the same way). The encryption
//! key lives only in the OS keyring (see `secret_store::BACKUP_KEY`) plus a
//! one-time on-screen display and an emailed safety-net copy — never in
//! SQLite, never on the wire unencrypted.
//!
//! v1 deliberately keeps one cloud copy at a time (fixed object name,
//! overwritten in place) rather than a remote history, to avoid needing
//! WebDAV directory listing (PROPFIND) for a first version. Local backups
//! keep their own independent rotation (see `services::rotate_backups`).

use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use anyhow::{anyhow, Result};
use base64::Engine;
use reqwest::Method;

const NONCE_LEN: usize = 12;
const BACKUP_OBJECT_NAME: &str = "perpetua-backup-latest.enc";

/// Generates a fresh random 256-bit key, base64-encoded for display, email,
/// and OS-keyring storage.
pub fn generate_recovery_key() -> String {
    let key = Aes256Gcm::generate_key(OsRng);
    base64::engine::general_purpose::STANDARD.encode(key)
}

fn parse_key(recovery_key_b64: &str) -> Result<Key<Aes256Gcm>> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(recovery_key_b64.trim())
        .map_err(|_| anyhow!("Recovery key is not valid — check for typos or missing characters."))?;
    if bytes.len() != 32 {
        return Err(anyhow!("Recovery key must decode to 32 bytes (AES-256)."));
    }
    Ok(*Key::<Aes256Gcm>::from_slice(&bytes))
}

/// Encrypts `plaintext` (the raw backup `.db` file bytes). Output layout:
/// `nonce (12 bytes) || ciphertext+tag` — the nonce travels with the blob so
/// it's self-describing and no separate metadata file is needed.
pub fn encrypt(recovery_key_b64: &str, plaintext: &[u8]) -> Result<Vec<u8>> {
    let key = parse_key(recovery_key_b64)?;
    let cipher = Aes256Gcm::new(&key);
    let nonce = Aes256Gcm::generate_nonce(OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext)
        .map_err(|_| anyhow!("Encryption failed."))?;

    let mut out = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

/// Decrypts a blob produced by `encrypt`. Fails (auth tag mismatch) if the
/// recovery key is wrong or the blob was corrupted/tampered with in transit.
pub fn decrypt(recovery_key_b64: &str, blob: &[u8]) -> Result<Vec<u8>> {
    if blob.len() < NONCE_LEN {
        return Err(anyhow!("Backup file is corrupt or truncated."));
    }
    let key = parse_key(recovery_key_b64)?;
    let cipher = Aes256Gcm::new(&key);
    let (nonce_bytes, ciphertext) = blob.split_at(NONCE_LEN);
    let nonce = Nonce::from_slice(nonce_bytes);
    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| anyhow!("Couldn't decrypt this backup — wrong recovery key, or the file is corrupted."))
}

/// One WebDAV target: server URL + Basic-auth credentials + the folder
/// backups are stored under. Generic — Koofr is just the first server this
/// has been pointed at.
pub struct WebDavTarget<'a> {
    pub base_url: &'a str,
    pub username: &'a str,
    pub password: &'a str,
    pub remote_path: &'a str,
}

fn client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .build()
        .map_err(|err| anyhow!("Failed to build HTTP client: {err}"))
}

fn collection_url(target: &WebDavTarget) -> String {
    format!(
        "{}/{}",
        target.base_url.trim_end_matches('/'),
        target.remote_path.trim_matches('/'),
    )
}

fn object_url(target: &WebDavTarget, file_name: &str) -> String {
    format!("{}/{}", collection_url(target), file_name)
}

/// Best-effort creation of the remote backup folder. Ignored on failure (most
/// commonly: it already exists, or the server disallows MKCOL on a non-empty
/// path) — this only exists to smooth over the common first-run case where
/// the folder doesn't exist yet, not to guarantee one does.
async fn ensure_remote_folder(target: &WebDavTarget<'_>) -> Result<()> {
    let _ = client()?
        .request(Method::from_bytes(b"MKCOL").expect("MKCOL is a valid HTTP method token"), collection_url(target))
        .basic_auth(target.username, Some(target.password))
        .send()
        .await;
    Ok(())
}

/// Encrypts-then-uploads the current backup to the fixed remote object name,
/// overwriting whatever was there before.
pub async fn upload(target: &WebDavTarget<'_>, recovery_key_b64: &str, plaintext: &[u8]) -> Result<()> {
    ensure_remote_folder(target).await?;
    let encrypted = encrypt(recovery_key_b64, plaintext)?;

    let response = client()?
        .put(object_url(target, BACKUP_OBJECT_NAME))
        .basic_auth(target.username, Some(target.password))
        .body(encrypted)
        .send()
        .await
        .map_err(|err| anyhow!("WebDAV upload failed: {err}"))?;

    if !response.status().is_success() {
        return Err(anyhow!("WebDAV server returned {}", response.status()));
    }
    Ok(())
}

/// Downloads and decrypts the current cloud backup.
pub async fn download(target: &WebDavTarget<'_>, recovery_key_b64: &str) -> Result<Vec<u8>> {
    let response = client()?
        .get(object_url(target, BACKUP_OBJECT_NAME))
        .basic_auth(target.username, Some(target.password))
        .send()
        .await
        .map_err(|err| anyhow!("WebDAV download failed: {err}"))?;

    if !response.status().is_success() {
        return Err(anyhow!("WebDAV server returned {} — no backup found at this location?", response.status()));
    }

    let encrypted = response
        .bytes()
        .await
        .map_err(|err| anyhow!("Failed reading WebDAV response body: {err}"))?;

    decrypt(recovery_key_b64, &encrypted)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypt_decrypt_round_trips() {
        let key = generate_recovery_key();
        let plaintext = b"a fake sqlite backup file's bytes";
        let encrypted = encrypt(&key, plaintext).expect("encrypt");
        let decrypted = decrypt(&key, &encrypted).expect("decrypt");
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn decrypt_fails_with_wrong_key() {
        let key_a = generate_recovery_key();
        let key_b = generate_recovery_key();
        let encrypted = encrypt(&key_a, b"secret bytes").expect("encrypt");
        assert!(decrypt(&key_b, &encrypted).is_err());
    }

    #[test]
    fn decrypt_fails_on_tampered_ciphertext() {
        let key = generate_recovery_key();
        let mut encrypted = encrypt(&key, b"secret bytes").expect("encrypt");
        let last = encrypted.len() - 1;
        encrypted[last] ^= 0xFF;
        assert!(decrypt(&key, &encrypted).is_err());
    }
}
