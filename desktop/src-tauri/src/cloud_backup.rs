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
use std::time::Duration;

const NONCE_LEN: usize = 12;
const BACKUP_OBJECT_NAME: &str = "perpetua-backup-latest.enc";
/// Uploads land here first and are moved into place only once complete, so a
/// connection dropped mid-PUT can never truncate the one remote copy.
const UPLOAD_TEMP_NAME: &str = "perpetua-backup-latest.enc.uploading";

/// Hard ceiling on a downloaded backup. A vault is a few MB; this exists so a
/// hostile or misbehaving server can't stream gigabytes into memory.
const MAX_DOWNLOAD_BYTES: u64 = 256 * 1024 * 1024;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);

/// WebDAV speaks HTTP Basic auth, i.e. the password travels in a header — over
/// plain `http://` it is readable by anyone on the path. Only loopback (a
/// local test server, an SSH tunnel) may skip TLS.
pub fn validate_server_url(raw: &str) -> Result<()> {
    let url = reqwest::Url::parse(raw.trim()).map_err(|_| anyhow!("WebDAV server URL isn't a valid URL."))?;
    match url.scheme() {
        "https" => Ok(()),
        "http" => {
            let host = url.host_str().unwrap_or_default();
            if host == "127.0.0.1" || host == "localhost" || host == "[::1]" || host == "::1" {
                Ok(())
            } else {
                Err(anyhow!(
                    "WebDAV server URL must use https:// — your password would otherwise be sent in the clear."
                ))
            }
        }
        _ => Err(anyhow!("WebDAV server URL must start with https://")),
    }
}

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
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(REQUEST_TIMEOUT)
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

/// Encrypts-then-uploads the current backup to the fixed remote object name.
///
/// Atomic from the remote copy's point of view: the ciphertext is PUT under a
/// temporary name and only then MOVEd over the live object, so a failed or
/// partial upload leaves the previous backup intact. Servers that reject MOVE
/// fall back to a direct PUT. Either way the object is read back and
/// decrypted afterwards — "the server said 201" is not the same as "the bytes
/// on the server decrypt to my vault".
pub async fn upload(target: &WebDavTarget<'_>, recovery_key_b64: &str, plaintext: &[u8]) -> Result<()> {
    validate_server_url(target.base_url)?;
    ensure_remote_folder(target).await?;
    let encrypted = encrypt(recovery_key_b64, plaintext)?;
    let client = client()?;
    let final_url = object_url(target, BACKUP_OBJECT_NAME);
    let temp_url = object_url(target, UPLOAD_TEMP_NAME);

    let put_temp = client
        .put(&temp_url)
        .basic_auth(target.username, Some(target.password))
        .body(encrypted.clone())
        .send()
        .await
        .map_err(|err| anyhow!("WebDAV upload failed: {err}"))?;
    if !put_temp.status().is_success() {
        return Err(anyhow!("WebDAV server returned {}", put_temp.status()));
    }

    let moved = client
        .request(Method::from_bytes(b"MOVE").expect("MOVE is a valid HTTP method token"), &temp_url)
        .basic_auth(target.username, Some(target.password))
        .header("Destination", &final_url)
        .header("Overwrite", "T")
        .send()
        .await;
    let move_ok = matches!(&moved, Ok(response) if response.status().is_success());
    if !move_ok {
        // Fall back to overwriting in place, then tidy the temp object.
        let put_final = client
            .put(&final_url)
            .basic_auth(target.username, Some(target.password))
            .body(encrypted.clone())
            .send()
            .await
            .map_err(|err| anyhow!("WebDAV upload failed: {err}"))?;
        if !put_final.status().is_success() {
            return Err(anyhow!("WebDAV server returned {}", put_final.status()));
        }
        let _ = client
            .delete(&temp_url)
            .basic_auth(target.username, Some(target.password))
            .send()
            .await;
    }

    // Read-back verification: the remote object must decrypt to what we sent.
    let remote = download_raw(target).await?;
    if remote != encrypted {
        return Err(anyhow!(
            "Upload verification failed: the backup read back from the server does not match what was sent."
        ));
    }
    Ok(())
}

async fn download_raw(target: &WebDavTarget<'_>) -> Result<Vec<u8>> {
    let response = client()?
        .get(object_url(target, BACKUP_OBJECT_NAME))
        .basic_auth(target.username, Some(target.password))
        .send()
        .await
        .map_err(|err| anyhow!("WebDAV download failed: {err}"))?;

    if !response.status().is_success() {
        return Err(anyhow!("WebDAV server returned {} — no backup found at this location?", response.status()));
    }
    if let Some(len) = response.content_length() {
        if len > MAX_DOWNLOAD_BYTES {
            return Err(anyhow!("Remote backup is implausibly large ({len} bytes); refusing to download."));
        }
    }

    let encrypted = response
        .bytes()
        .await
        .map_err(|err| anyhow!("Failed reading WebDAV response body: {err}"))?;
    if encrypted.len() as u64 > MAX_DOWNLOAD_BYTES {
        return Err(anyhow!("Remote backup is implausibly large; refusing to use it."));
    }
    Ok(encrypted.to_vec())
}

/// Downloads and decrypts the current cloud backup.
pub async fn download(target: &WebDavTarget<'_>, recovery_key_b64: &str) -> Result<Vec<u8>> {
    validate_server_url(target.base_url)?;
    let encrypted = download_raw(target).await?;
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
    fn server_url_requires_https_except_loopback() {
        assert!(validate_server_url("https://app.koofr.net/dav/Koofr").is_ok());
        assert!(validate_server_url("http://127.0.0.1:8080/dav").is_ok());
        assert!(validate_server_url("http://localhost:8080/dav").is_ok());
        assert!(validate_server_url("http://dav.example.com/").is_err());
        assert!(validate_server_url("ftp://dav.example.com/").is_err());
        assert!(validate_server_url("not a url").is_err());
    }

    #[tokio::test]
    async fn failed_upload_does_not_replace_the_previous_object() {
        use std::sync::atomic::{AtomicBool, Ordering};
        use std::sync::Arc;
        let replaced = Arc::new(AtomicBool::new(false));
        let flag = replaced.clone();
        let app = axum::Router::new()
            .route(
                "/dav/backups/perpetua-backup-latest.enc.uploading",
                axum::routing::put(|| async { axum::http::StatusCode::INTERNAL_SERVER_ERROR }),
            )
            .route(
                "/dav/backups/perpetua-backup-latest.enc",
                axum::routing::put(move || {
                    let flag = flag.clone();
                    async move {
                        flag.store(true, Ordering::SeqCst);
                        axum::http::StatusCode::CREATED
                    }
                }),
            );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.expect("bind");
        let port = listener.local_addr().expect("addr").port();
        tokio::spawn(async move {
            axum::serve(listener, app).await.expect("serve");
        });

        let base = format!("http://127.0.0.1:{port}/dav");
        let target = WebDavTarget {
            base_url: &base,
            username: "user",
            password: "secret",
            remote_path: "/backups",
        };
        let key = generate_recovery_key();
        let error = upload(&target, &key, b"new-bytes").await.expect_err("upload must fail");
        assert!(error.to_string().contains("500") || error.to_string().contains("INTERNAL"));
        assert!(!replaced.load(Ordering::SeqCst), "previous remote object must stay put");
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
