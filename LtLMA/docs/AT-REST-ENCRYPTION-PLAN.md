# At-rest encryption of the vault: design and feasibility

Status of this document: **design + feasibility only. No production code was
changed.** Closes the design half of the gap "SQLite not encrypted at rest"
(PROJECT-STATUS-AUDIT.md, gap table and Priority Queue item 5; SSOT.md R3;
`legal/PRIVACY.md` "At rest"; `docs/STATUS.md`).

Claim labels used throughout:

- **Built** - exists in the repo today (file and function cited), or was
  executed and observed in the spike described in section 4.
- **Specified** - decided here, not implemented.
- **Aspirational** - desirable, not committed.
- **Unverified** - not run or not confirmed; treat as a risk, not a fact.

---

## 1. Summary and recommendation

**Recommended: SQLCipher through rusqlite's `bundled-sqlcipher-vendored-openssl`
feature, with a random 256-bit raw key held in the OS keyring, on by default,
migrated automatically from existing plaintext vaults.** OS disk encryption
(BitLocker / FileVault / LUKS) stays documented as a complementary baseline,
not as the answer. Field-level encryption is rejected.

Why:

- It is the only option that protects *everything* in the file (license keys,
  notes, URLs, emails, the Pro `license_key` in `app_state`, metadata, the
  journal) with the smallest code change: one open path (`init_db_at`) plus
  the backup/restore paths. (Built: spike, section 4.)
- The key-in-keyring pattern is already shipped and documented for the SMTP
  password, WebDAV password and cloud-backup key (`secret_store.rs`).
- The migration can reuse the PR #6 "derive state from observed data, retry on
  every open, never strand plaintext" pattern.

Honest limits (must go into Privacy.md when shipped): protects against
offline disk theft, other OS users, stray copies of the data directory,
cloud-sync/backup tools that grab `%APPDATA%`, and leaked local backups. It
does **not** protect against malware running as the same OS user, who can read
the keyring entry and the file. (Specified.)

Biggest risks, in order: (1) key loss bricks the vault (section 6), (2) the
cloud-restore flow breaks unless redesigned (section 8.2), (3) Windows build
friction: Perl/MAX_PATH/+8 min cold build (section 5), (4) full-app
linking not yet validated beyond a minimal binary (Unverified, section 5.4).

Effort: roughly **9-11 engineer-days**, about 2 calendar weeks including a
soak (section 11).

---

## 2. Current state (verified by reading the code)

| Area | Fact | Label |
|---|---|---|
| Driver | `rusqlite = { version = "0.31", features = ["bundled", "backup"] }`; locked `libsqlite3-sys 0.28.0`. No sqlx. | Built |
| Open path | Exactly one production open of the vault: `database::init_db_at` -> `Connection::open(db_path_at(..))` (`database.rs:81`), called from `init_db()`; 3 call sites in `main.rs` (GUI setup, `serve`, `check-reminders`). 26 test sites use `init_db_at(tempdir)`. | Built |
| Schema/migration | `CREATE TABLE IF NOT EXISTS` batch + best-effort `ALTER TABLE ... ADD COLUMN` (errors ignored). No schema version table, no `PRAGMA user_version`. | Built |
| Journal mode | App never sets `journal_mode`; default rollback journal (`-journal` file), not WAL. (`wal_checkpoint` in `create_backup_in_dir` is a no-op on the destination.) | Built |
| Local backup | `services::create_backup_in_dir`: `Connection::open(dest)` + `rusqlite::backup::Backup` into `backups/perpetua-backup-*.db`, keep 5 (`MAX_BACKUPS`, `rotate_backups`). Files are plaintext SQLite copies. | Built |
| Cloud backup | `cloud_backup.rs`: whole backup `.db` bytes encrypted with AES-256-GCM (`nonce(12) \|\| ct+tag`), key = per-user random "recovery key" in keyring (`secret_store::BACKUP_KEY`), shown once + emailed. One fixed remote object. | Built |
| Cloud restore | `POST /api/cloud-backup/restore` is unauthenticated (rate-limited): downloads + decrypts, then `restore_vault_from_bytes_at`: write `licenses.db.restoring`, probe-open it, drop live connection, `fs::rename` over live DB, reopen. | Built |
| Keyring | `secret_store.rs`: `read/write(service, user_id)` over `keyring` v3 (windows-native / apple-native / sync-secret-service). Services: SMTP, WEBDAV_PASSWORD, BACKUP_KEY. Test build swaps in an in-memory `static` store. Keyed by **user id**, not vault. | Built |
| PR #6 migration pattern | `get_account_recovery_settings`: state is derived from data ("is the legacy column non-empty"), keyring written first, column cleared only after success, retried on every read. | Built |
| `jwt.secret` | Plaintext file `jwt.secret` next to the DB (`load_or_create_jwt_secret_at`). Not in keyring. | Built |
| Browser extension | Talks only HTTP to `127.0.0.1:18765` with a bearer JWT (`browser-extension/lib/api.js`, `/vault/import`, `/licenses`). Never touches the DB file. | Built |
| "Ledger" | No ledger code exists in `LtLMA/` (grep for `ledger`, `blake3` found nothing in the Rust or extension code; hits are in `polar-webhook` comments and an audit doc). The BLAKE3 ledger in the HCC architecture lives in SOE-1, not in this repo. | Built (absence); ask owner if a different "ledger" was meant |
| `Cargo.toml` | Has uncommitted changes. `git diff --ignore-space-at-eol` is empty, so they are line-ending only (git warns "LF will be replaced by CRLF"). Not touched by this work. | Built |

What sits unencrypted today that matters: `licenses.license_key`, `notes`,
URLs, dates; `users.email`, bcrypt hashes; `app_state.license_key` (the Pro
key) and `polar_activation_id`; `vault_members` emails; `jwt.secret`;
`backups/*.db` (up to 5 plaintext full copies).

---

## 3. Options

### A. SQLCipher (whole-database page encryption) - recommended

- Mechanism: AES-256-CBC per page + HMAC-SHA512 per page (SQLCipher 4
  defaults), header and journal encrypted. Everything is covered, including
  indexes, free pages and `sqlite_master`.
- Code change is small and centralized: key the connection right after
  `Connection::open`, before any statement.
- rusqlite 0.31 offers `bundled-sqlcipher` (needs OpenSSL discoverable) and
  `bundled-sqlcipher-vendored-openssl` (builds OpenSSL from source with
  `openssl-src`). Use the vendored variant for reproducible Windows/macOS
  builds. `bundled` must be removed (they are mutually exclusive).
- Cost: build complexity (section 5), +~4 MB binary, small runtime overhead
  (typically single to low-double-digit percent; Unverified here, irrelevant
  at this DB size).
- Licensing: SQLCipher community edition is BSD-style (attribution required),
  OpenSSL 3 is Apache-2.0. Add both to third-party notices. (Unverified by
  counsel.) Crypto export/classification posture should be re-checked, though
  AES-GCM already ships in cloud backup. (Unverified.)

### B. Field-level encryption (AES-GCM on chosen columns, `aes-gcm` already a dependency)

- Pros: no new native build; precise control.
- Cons (decisive): leaves metadata, emails, URLs, dates, Pro key and table
  structure in the clear unless every column is wrapped; breaks SQL `LIKE`
  search, ordering, the duplicate check on import, CSV/JSON export queries
  (`services.rs` is 1,700 lines of direct SQL), and every INSERT/UPDATE/SELECT
  that touches the column; per-field nonce and format versioning; key still
  needs the same keyring handling; backups and journals still contain whatever
  was not wrapped. Larger code surface and a larger bug surface than A for a
  strictly weaker guarantee.
- Verdict: reject, except as a stopgap for the single `app_state.license_key`
  value (cheap, optional).

### C. OS-level (BitLocker / EFS / FileVault / LUKS)

- Pros: zero code, strongest against offline theft of a powered-off machine.
- Cons: not under the product's control and not verifiable by it; BitLocker is
  unavailable on Windows Home (device encryption varies; Unverified per
  SKU); no protection once the user is logged in; no protection for copied
  files, backups, or synced folders; EFS ties to the Windows account and
  complicates the restore-to-new-machine story.
- Verdict: keep as the documented baseline recommendation in Privacy.md and
  the user guide; not a substitute.

### D. Other engines (SQLite Multiple Ciphers, SEE, application-level wrapped file)

- SEE is commercially licensed; SQLite3 Multiple Ciphers has no first-class
  rusqlite 0.31 feature that was evaluated here. Both are Unverified and add
  integration risk versus a feature flag that rusqlite already ships.
  Not recommended for v1.

### Comparison

| | A SQLCipher | B Field-level | C OS-level |
|---|---|---|---|
| Covers whole file + journal | Yes | No | Yes (volume) |
| Product-controlled/verifiable | Yes | Yes | No |
| Code surface | Small, central | Large, scattered | None |
| Search/export unaffected | Yes | No | Yes |
| New native build dependency | Yes (OpenSSL) | No | No |
| Protects when logged in | No (same-user malware) | No | No |
| Key-loss risk | Yes (managed) | Yes | OS-managed |

---

## 4. Feasibility spike (Built, executed 2026-10-06)

Scratch project outside the repo (`...\scratchpad\aer\spike`; repo
`Cargo.toml` / `Cargo.lock` untouched). Dependency:
`rusqlite 0.31` with `bundled-sqlcipher-vendored-openssl` and `backup`, the
same major version the app uses. Observed results:

- Builds and runs on this machine (Windows 11, stable MSVC 1.98.1, VS 2022
  BuildTools). `PRAGMA cipher_version` = **4.5.3 community**.
- `sqlcipher_export` from a plaintext DB to an encrypted DB with a raw hex key
  (`"x'<64 hex>'"`) works. The output file does not start with
  `SQLite format 3` and does not contain the known secret string.
- Reading back with the key works; a wrong key fails on first read.
- `rusqlite::backup::Backup` encrypted source -> keyed destination connection
  produces an encrypted backup. **The destination connection must be keyed
  before `Backup::new`**, otherwise the backup is plaintext. This is a
  required change in `create_backup_in_dir`.
- Encrypted -> plaintext export (`ATTACH ... KEY ''` + `sqlcipher_export`)
  works (usable for a v1-compatible cloud payload).
- A plaintext file opened with a key errors; an encrypted file opened without
  a key errors. So "is this file encrypted?" can be decided by attempting an
  unkeyed read of `sqlite_master` (or by checking the 16-byte header
  `SQLite format 3\0`).
- WAL mode: `-wal` contents did not leak the inserted string.
- `PRAGMA rekey` works (key rotation is available later).
- Atomic-style in-place migration (export to `*.encrypting`, rename live to
  `*.pre-encryption`, rename new to live, reopen with key) works at spike
  scale.

Not tested in the spike (Unverified): full Tauri app link with the rest of
the dependency tree (see 5.4); macOS and Linux builds; `serialize`/in-memory
export; concurrent use; behaviour under a real Credential Manager.

---

## 5. Windows build implications

### 5.1 Measured

| Metric | Result | Label |
|---|---|---|
| Cold build of the spike incl. OpenSSL from source | **491 s (~8 min)** on this machine, with warm registry cache. Plain `bundled` SQLite: 26 s. | Built |
| Spike release `.exe` | **5.99 MB** vs 1.72 MB with plain `bundled` (about **+4.3 MB**, OpenSSL `libcrypto` statically linked). | Built |
| Installed MSI size impact | Current MSI is 16.05 MB (`target/release/bundle/msi/Perpetua_1.0.0_x64_en-US.msi`). Expected increase roughly +1.5 to +2.5 MB after compression. | Unverified (estimate; measure on a real `tauri build`) |
| OpenSSL built `no-asm` | The `openssl-src` log shows `no-asm` for `VC-WIN64A` (no NASM needed). Crypto uses the C code paths; irrelevant for a small DB with a raw key (no PBKDF2). | Built |
| Extra tools required | Strawberry-style Perl (see 5.2). NASM not required. Visual Studio BuildTools with `nmake` already present here. | Built |

### 5.2 Gotchas hit during the spike (Built)

1. **Git-for-Windows' bundled Perl fails** (missing `Locale::Maketext::Simple`
   under its msys layout) - `openssl-src` cannot configure with it. A real
   Strawberry/ActiveState Perl first on `PATH` is required. (A Strawberry
   install from another local project was used read-only for the spike; no
   system-wide Strawberry is installed on this machine, only a stale
   `C:\Strawberry\relocation.txt.new`.)
2. **MAX_PATH:** with a long `CARGO_TARGET_DIR` (the session scratchpad,
   >150 chars) the OpenSSL compile failed in `nmake` on a deeply nested
   `.obj` path; with a short target dir (`C:\aer-t`) it succeeded. The first
   failure's exact compiler message was truncated, so the MAX_PATH cause is
   **likely but not proven**. The repo default (`LtLMA\src-tauri\target`,
   `C:\IEDB\PERPETUA\...`) is moderately long: needs a check or a documented
   short `CARGO_TARGET_DIR`. `build-release.ps1` already forces the in-tree
   target dir, so this matters for it.
3. Linker emits benign `LNK4099` warnings (missing `ossl_static.pdb`).
4. Per-profile build: debug (`cargo test`) and release each compile OpenSSL
   separately - expect the +8 min twice on a fresh clone. (Unverified; only
   release was run.)

### 5.3 CI (`.github/workflows/release.yml`)

- `windows-latest` runners are widely documented as shipping Strawberry Perl;
  confirm in the first CI run. (Unverified.) `Swatinem/rust-cache` is already
  used, so warm CI builds should not pay the OpenSSL cost again.
- Linux job already installs `libssl-dev` (not needed with vendored, harmless).
  macOS has Perl. (Unverified until built.)
- Add a CI assertion that `PRAGMA cipher_version` is non-empty at startup of a
  test, so a silent regression to plain SQLite (e.g. someone re-adding
  `bundled`) fails the build rather than shipping an unencrypted vault. This
  is the most important guard. (Specified.)

### 5.4 Residual risk: full-app link (Unverified)

The spike is a minimal binary. The vendored OpenSSL objects were compiled
with `/MT` (seen in the `cl` command line) while Rust's MSVC target defaults
to `/MD`; the spike linked and ran, and `openssl-sys` is commonly used in
Tauri apps on Windows, but this has not been validated against this app's
full dependency tree (reqwest/rustls, lettre, tauri). `reqwest` here uses
`rustls-tls`, so there is no second OpenSSL consumer; `keyring`'s
`windows-native` uses the Windows API. **Phase 1 of the plan (section 11) is a
branch where only the Cargo feature is swapped and a full `tauri build`, MSI
install and smoke run are executed before any other work.**

Fallback if vendored OpenSSL proves too painful on Windows: `bundled-sqlcipher`
(non-vendored) with a vcpkg/prebuilt static OpenSSL via `OPENSSL_DIR` /
`OPENSSL_STATIC=1`. Faster builds, more developer setup, harder to reproduce.
(Unverified.)

---

## 6. Key management

### 6.1 Design (Specified)

- **Key**: 32 bytes from the OS CSPRNG (`OsRng`, same source as
  `generate_recovery_key`), used as a **raw key** `PRAGMA key = "x'<64 hex>'"`
  so SQLCipher skips PBKDF2 (fast open, no password to forget). Pin
  `PRAGMA cipher_compatibility = 4` (and explicit `cipher_page_size`) right
  after keying so a future library default change cannot silently orphan
  existing vaults.
- **Storage**: new constant `secret_store::VAULT_KEY = "com.perpetua.app.vault-key"`.
  `secret_store` is keyed by user id, but the vault key is per-installation,
  so use a reserved sentinel id (e.g. `0`; real ids start at 1 with
  `AUTOINCREMENT`) or add a small `read_global/write_global` pair.
  Windows Credential Manager blob limit (2,560 bytes) is far above 64 chars.
- **Write order** (mirrors PR #6): generate key -> write to keyring -> read it
  back and compare -> only then create or convert the DB. Never create an
  encrypted DB whose key is not already durably stored.
- **Never overwrite**: if an encrypted DB exists and the keyring has no key,
  do **not** generate a new key and create a fresh vault. Enter an explicit
  "vault locked: key missing" state (section 6.3).
- **No key on disk fallback**: if no keyring backend is usable (typically
  Linux without Secret Service), stay in plaintext mode and show a clear
  status, rather than writing a key next to the DB (which would be theatre).
  Decision for the owner (open question Q3).
- **Tests**: the existing in-memory keyring stub (`#[cfg(test)]`) is a single
  global; get-or-create must be guarded by a mutex or tests running in
  parallel will race two different keys. Prefer injecting the key:
  `init_db_with_key(base_dir, key)` for tests and tools, with
  `init_db_at(base_dir)` resolving the key from `secret_store` and delegating.
- **`jwt.secret`** (plaintext file) should move to the keyring in the same
  change or the next: it is not vault content, but it sits beside the
  "encrypted" DB and forges API tokens for the local server. (Specified,
  optional scope.)

### 6.2 Recovery (Specified)

1. **Vault recovery key**: after first encryption, show the vault key once
   (grouped base32/hex) and offer to email it through the existing SMTP flow,
   exactly like the cloud-backup recovery key (`enable_cloud_backup` /
   `api.rs` emailed key). Add "Restore key from recovery key" which re-writes
   the keyring entry. Without this, a lost keyring entry is unrecoverable.
2. **Cloud backup as DR**: with the envelope v2 design (8.2) a cloud backup
   alone is enough to restore on a new machine; it does not depend on the
   local vault key surviving.
3. **Local backups** are encrypted under the same vault key, so they do **not**
   help if the key is lost. UI copy must say so.

### 6.3 Loss and failure scenarios

| Scenario | Result | Mitigation |
|---|---|---|
| Windows profile/password reset by admin, DPAPI master key lost; Credential Manager cleared | Keyring entry gone; vault unreadable | Vault recovery key; cloud backup restore |
| User deletes the credential via Credential Manager / cleanup tool | Same | Same; plus "vault locked" screen that explains and offers key import, never silently creating a new vault |
| Reinstall OS, keep data disk | Encrypted DB present, no key | Recovery key / cloud restore |
| Copy `%APPDATA%\perpetua` to a new PC (works today, plaintext) | Opens as locked | Document as a behaviour change; use cloud backup or key export |
| macOS Keychain locked / Linux Secret Service not running at login (autostart `--minimized` starts the app at login) | `keyring` read error at startup | Treat as "temporarily unavailable", not "missing": retry with backoff, do not regenerate; surface a banner. Distinguish `NoEntry` from other keyring errors (the stub and current `read` collapse both to `None`; the real implementation must not) |
| App upgrade / rollback to a pre-encryption build | Old build cannot open the encrypted DB | Keep the `.pre-encryption` copy for the grace window; gate downgrades in release notes |
| Corrupted DB | Same as today, plus HMAC makes tampering detectable | Local/cloud backups; `cipher_integrity_check` |
| Migration crash mid-way | See section 7 | Idempotent migration |
| Malware as same user | Not protected | Documented limit |

Rotation: `PRAGMA rekey` works (spike, section 4). Not in v1; the design must
not preclude it (store a `key_version` in the keyring entry name if rotation is
later added).

---

## 7. Migration of existing plaintext vaults

Principles carried over from PR #6 (`get_account_recovery_settings`): derive
state from what is observable on disk, store the new secret **before** removing
the old plaintext, make every step idempotent, retry on every launch, and
never leave the user without a working copy. Specified, not implemented.

### 7.1 State detection at startup (in `init_db_at`, before the schema batch)

Check the first 16 bytes of `licenses.db`:

| Observed | Meaning | Action |
|---|---|---|
| file missing | fresh install | generate key -> keyring -> create encrypted DB |
| `SQLite format 3\0` header | plaintext vault | migrate (7.2) |
| other bytes + keyring has key | encrypted vault | open keyed |
| other bytes + no key (`NoEntry`) | locked vault | "vault locked" state, no writes |
| other bytes + keyring error | key temporarily unavailable | retry; do not regenerate |
| `licenses.db` missing but `.encrypting` / `.pre-encryption` present | crashed between renames | complete or roll back (7.3) |

### 7.2 Procedure

1. Open the plaintext DB, `PRAGMA wal_checkpoint(TRUNCATE)` (harmless if the
   DB is not in WAL), run `PRAGMA integrity_check`; abort and leave
   everything untouched if it fails.
2. Obtain the key: reuse an existing keyring key (interrupted earlier attempt)
   or generate-store-verify one (6.1).
3. `ATTACH DATABASE 'licenses.db.encrypting' AS enc KEY "x'<hex>'"`,
   `SELECT sqlcipher_export('enc')`, `DETACH`.
4. Verify the new file by opening it keyed: per-table row counts equal the
   plaintext source, `PRAGMA integrity_check` ok, `PRAGMA user_version`/
   schema equal. Any mismatch -> delete `.encrypting`, keep plaintext live,
   report failure.
5. Close all handles (required on Windows), remove stale `licenses.db-journal`
   / `-wal` / `-shm`. Then swap with two renames:
   `licenses.db -> licenses.db.pre-encryption`, then
   `licenses.db.encrypting -> licenses.db`. `std::fs::rename` already replaces
   an existing target on Windows and is what `restore_vault_from_bytes_at`
   relies on. (Built pattern.)
6. Reopen keyed, run the normal schema batch and a smoke query. On success,
   convert the legacy backups (7.4) and then remove the pre-encryption copy
   (7.5).

The app is not available during the swap (a fraction of a second at this size);
the DB mutex (`Arc<Mutex<Connection>>`) is not yet shared at `init_db_at`
time, so there is no concurrent-use problem. The `serve` and
`check-reminders` CLI paths go through the same function. (Built structure.)

### 7.3 Crash recovery (idempotent restart rules)

- Only `.encrypting` exists, `licenses.db` is plaintext -> delete
  `.encrypting`, redo from step 1.
- `licenses.db` missing, `.pre-encryption` and a **verifiable** `.encrypting`
  exist -> finish the second rename.
- `licenses.db` missing, only `.pre-encryption` exists -> rename it back and
  redo.
- `licenses.db` encrypted and key works -> migration is complete; clean up
  leftovers.

### 7.4 Legacy plaintext backups (easy to forget)

`backups/*.db` are up to five plaintext copies of the vault
(`rotate_backups`, `MAX_BACKUPS = 5`). Leaving them defeats the feature.
After a verified migration, re-export each to an encrypted file with the same
procedure (or delete them and immediately create a fresh encrypted backup).
Failures are retried at next launch (same "derive from data" rule: any
`backups/*.db` with a plaintext header is pending conversion).

### 7.5 The pre-encryption plaintext copy

It is the user's safety net during the transition but also a plaintext copy of
the vault. Proposed (owner decision, Q2): keep it until the first successful
encrypted unlock plus one successful encrypted local backup, then overwrite
and delete (best effort; SSD wear levelling and Windows shadow copies mean
secure deletion cannot be guaranteed, which must be stated honestly).

### 7.6 Failure policy

Migration failure must **fail open to the existing plaintext vault** (the user
keeps working) with a visible "encryption pending" status and retry each
launch, stopping automatic retries after a small count and surfacing
diagnostics. It must **never** fail by creating an empty encrypted vault or by
deleting the plaintext original before the encrypted copy is verified.

---

## 8. Impact on other code

### 8.1 Local backup (`create_backup_in_dir`)

Key the destination connection before `Backup::new` (verified in spike).
`list_backups_in_dir`, `rotate_backups`, `backup_entry_from_path` are
unchanged (they only look at `.db` names and metadata). (Specified.)

### 8.2 Cloud backup and restore - the one real redesign

Today the cloud payload is the plaintext `.db` bytes, AES-GCM wrapped with the
user's recovery key, and restore writes those bytes as the live DB
(`restore_vault_from_bytes_at`). With an encrypted vault:

- `prepare_cloud_sync` -> `create_backup_in_dir` yields a file encrypted under
  the **local** vault key. Uploading it as-is and restoring on a new machine
  produces an undecryptable DB, because that machine has no such key. This
  would silently break the headline "restore on a new machine" feature.
  (Built behaviour today; Specified breakage.)

Options:

- **v2 envelope (recommended)**: payload = small header (magic + version) +
  vault key + the encrypted DB bytes, all inside the existing AES-256-GCM
  envelope keyed by the recovery key. No plaintext on disk at any time.
  On restore, decrypt the envelope, write the encrypted DB to
  `licenses.db.restoring`, open it with the embedded key, `PRAGMA rekey` to the
  **local** vault key (or adopt it if the machine has none), probe, then swap
  as today. Existing v1 blobs (raw plaintext SQLite, detectable by the
  `SQLite format 3\0` header) stay restorable: write to a temp, export into a
  keyed DB, delete the temp. This also gives a natural upgrade path. (Specified.)
- **Plaintext export inside the envelope** (v1-compatible): works (spike) but
  forces a transient plaintext file on disk. Acceptable as a fallback only.

Related changes in `restore_vault_from_bytes_at`: the probe
(`Connection::open(&tmp_path)` + `SELECT COUNT(*) FROM users`) must be keyed;
keep the existing order (drop live connection, rename, reopen keyed). Do not
write a new key to the keyring until the restored DB has been verified, and if
the keyring write fails after the swap, roll back, so the old key is never
lost. Also note the route is unauthenticated by design (rate limited) and will
replace a live vault; unchanged but worth re-reviewing once encryption makes
"restore" the main recovery path.

The user-facing recovery key and the WebDAV flow do not change. The Privacy.md
sentence "encrypted with AES-256-GCM before it leaves your device" stays true.

### 8.3 Browser extension

No change (Built, read `lib/api.js`): it only speaks to the local HTTP API, so
the storage engine is invisible to it. The one security-relevant interaction is
the bearer JWT signed with the plaintext `jwt.secret` (6.1). `restore`
swapping the live connection under the API is already handled by the shared
`Arc<Mutex<Connection>>`.

### 8.4 "Ledger"

No ledger code exists in LtLMA (section 2). If a tamper-evident ledger is added
later, SQLCipher's per-page HMAC does not replace it, and the ledger would live
in the same encrypted DB. Nothing to do now.

### 8.5 Other call sites and tooling

- `main.rs` three `init_db*` call sites: unchanged signatures if `init_db_at`
  resolves the key itself. `perpetua serve` / `check-reminders` on a vault
  that is encrypted need keyring access: they run as the same OS user, fine;
  headless QA with `PERPETUA_DATA_DIR` creates a *separate* encrypted vault
  under the same global keyring account unless the key is namespaced by data
  dir. **Namespacing is required**: use the data-dir path hash in the keyring
  account name, or QA runs will overwrite the real vault key. (Specified,
  important.)
- Export CSV/JSON (`export_licenses_*`) intentionally writes plaintext files
  for the user; out of scope, but call it out in the docs.
- `PROJECT-STATUS-AUDIT.md` is not edited here. After implementation: update
  `legal/PRIVACY.md` "At rest", `README.md:90`, `docs/STATUS.md`,
  `docs/TESTING.md`, `SSOT.md` R3, and add third-party notices.
- Frontend `localStorage` holds the session token (`src/lib/api.ts`); not part
  of this work.

---

## 9. Test plan

Unit/integration (Rust, `src-tauri/src/tests.rs` style with tempdirs and the
injected key):

1. Fresh install creates an encrypted DB: header is not `SQLite format 3`,
   known license string not present in raw bytes (file and any `-journal`).
2. Reopen with right key reads; wrong key / no key fails with a typed
   "vault locked" error (not a panic, not a new vault).
3. Plaintext -> encrypted migration: seed a plaintext vault from the existing
   fixtures (users, licenses, app_state, cloud settings), migrate, assert
   per-table equality.
4. Fault injection at every step boundary of 7.2 (failpoint between each
   rename, kill after export, corrupt `.encrypting`, key write failure,
   key read-back mismatch): assert the vault is always openable afterwards and
   a second launch converges to encrypted with no data loss.
5. Idempotency: run migration twice; encrypted vault is untouched.
6. Legacy backups converted; no `backups/*.db` with a plaintext header after a
   successful migration.
7. Local backup is encrypted and restorable with the key; backup of an
   encrypted vault with an unkeyed destination is impossible by construction
   (regression test for the spike finding).
8. Cloud: round-trip v2 envelope on a "new machine" (different tempdir and
   empty keyring stub); v1 blob restore into a keyed DB; tampered blob fails;
   keyring-write failure after swap rolls back.
9. `PRAGMA cipher_version` non-empty (guard against `bundled` regression) on
   all three CI platforms.
10. Keyring behaviour: `NoEntry` vs error discrimination; parallel get-or-create
    does not create two keys; data-dir key namespacing.

System/manual:

- Clean-machine MSI/NSIS install (extends `docs/INSTALL_SMOKE.md`): fresh
  install; upgrade from the shipped plaintext 1.0.0 with a populated vault
  (the canonical migration test); delete Credential Manager entry and verify
  the locked screen and recovery-key restore; cloud backup on machine A,
  restore on machine B.
- Browser extension end-to-end against an encrypted vault (import + list).
- macOS and Linux: build and keyring smoke; Linux without Secret Service
  shows the plaintext-mode banner.
- Build: cold and warm build timing on Windows CI; `tauri build` from a fresh
  clone with default target dir (MAX_PATH check); record MSI/NSIS size delta.
- Performance sanity on a large import (e.g. 10k rows) before/after
  (Unverified expectation: negligible).

---

## 10. Risks and open questions for the owner

| # | Question / risk |
|---|---|
| Q1 | Default-on for all users (recommended: an opt-in leaves most vaults plaintext) vs Pro-only vs opt-in toggle. |
| Q2 | Pre-encryption plaintext copy retention window (7.5). |
| Q3 | If no keyring backend (Linux headless): plaintext with warning (recommended) vs a passphrase-derived key prompted at startup (adds UX and a second recovery problem). |
| Q4 | Vault recovery key: mandatory acknowledgement at first run, or best effort? (Recommended: shown once with an email option, required acknowledgement; this is the main defence against support tickets that cannot be fixed.) |
| Q5 | Accept the behaviour change that copying the data directory to a new PC no longer works without the recovery key or a cloud restore. |
| Q6 | Is `jwt.secret` -> keyring in scope for the same release? |
| R1 | Full-app link/CI viability is Unverified (5.4). |
| R2 | Downgrade after migration is not possible. |
| R3 | SQLCipher and OpenSSL attribution / export-classification review (Unverified, non-engineering). |

---

## 11. Effort estimate and phasing

Estimates are for one engineer familiar with the codebase; calendar time
includes CI cycles (8-minute cold builds) and a soak.

| Phase | Work | Days |
|---|---|---|
| 0 | Feasibility spike (done here) | 0 (done) |
| 1 | Branch swapping only the Cargo feature; full `tauri build`, MSI install smoke, CI on 3 OSes, document Perl/short-path prerequisites in `RELEASE.md`, record size/time | 1-1.5 |
| 2a | `VAULT_KEY` secret class, key provider, `init_db_at` keyed open, `cipher_version` guard, locked-vault state and error type, data-dir key namespacing | 1.5-2 |
| 2b | Migration (7.2-7.6) with crash recovery and legacy-backup conversion | 1.5-2 |
| 2c | Backup/cloud/restore: keyed backup destination, envelope v2 + v1 compatibility, keyed probe, rollback | 1.5-2 |
| 2d | UI/API: encryption status, "encryption pending" banner, recovery key display/email/import, locked screen | 1-1.5 |
| 3 | Tests per section 9 (fault injection is the bulk) and manual migration/upgrade smoke | 2 |
| 4 | Docs: Privacy.md, README, STATUS/TESTING/SSOT, third-party notices, release notes | 0.5 |
| **Total** | | **~9-11 days (~2 weeks calendar)** |

Suggested sequencing: Phase 1 is a go/no-go gate. If vendored OpenSSL cannot
be made reproducible on the Windows CI and dev machines, fall back to the
prebuilt-OpenSSL variant (5.4) before spending time on 2a-2d.

Not recommended to ship without: the verified migration fault-injection tests
(section 9, item 4), the recovery key flow (6.2), and the v2 cloud envelope
(8.2). Those three are what turn "encrypted" into "encrypted without
stranding users".

---

## 12. Reproducing the spike

```powershell
# Perl: a real Strawberry Perl must precede Git's perl on PATH.
# Use a SHORT target dir to avoid MAX_PATH during the OpenSSL build.
$env:CARGO_TARGET_DIR = "C:\aer-t"
cargo build --release   # Cargo.toml: rusqlite 0.31, features
                        # ["bundled-sqlcipher-vendored-openssl","backup"]
```

The spike sources were in the session scratchpad only and are not part of the
repo.
