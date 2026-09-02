use axum::{
    extract::{Extension, Path, Query, State},
    http::{header, HeaderMap, HeaderValue, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::{delete, get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;
use tokio::sync::Mutex;
use tower_http::cors::CorsLayer;

use crate::models::{
    AccountRecoverySettings, ActivateRequest, ApiResponse, CreateSiteRequest, EnableCloudBackupRequest,
    EnableCloudBackupResult, ForgotPasswordRequest, ImportLicensesRequest, InviteMemberRequest,
    LicensePayload, LicenseUpdate, LoginRequest, RedeemInviteRequest, RegisterRequest,
    ReminderSettingsUpdate, ResetPasswordRequest, RestoreCloudBackupRequest,
};
use crate::services::{
    activate_pro, add_license, authenticate_user, build_auth_response, confirm_password_reset,
    connect_site, create_backup, create_site, create_user, delete_license, delete_site,
    disconnect_site, enable_cloud_backup, export_licenses_csv, export_licenses_json,
    get_account_recovery_settings, get_cloud_backup_settings, get_entitlement, get_license_by_id,
    get_license_stats, get_licenses, get_reminder_items, get_reminder_settings, get_user_by_email,
    get_user_by_id, import_licenses_csv, import_licenses_json, list_backups, list_site_connections,
    list_vault_members, mark_license_active, mark_onboarding_complete, mark_pro_activated,
    prepare_cloud_sync, prepare_invite, prepare_password_reset, record_cloud_sync_result,
    redeem_invite, resolve_data_owner_id, restore_vault_from_bytes, update_account_recovery_settings,
    update_license, update_reminder_settings, validate_credentials, verify_jwt, FreeLimitReached,
};
use rusqlite::Connection;
use std::collections::VecDeque;
use std::time::{Duration, Instant};

type DbState = Arc<Mutex<Connection>>;

/// A minimal fixed-window request limiter. There's no reverse proxy in front of
/// this localhost server to rate-limit at, and the credential/code-guessing
/// routes below have no other brute-force defense (see services::redeem_invite
/// and services::prepare_password_reset for the guessable-code surface this
/// bounds). One instance is shared by every caller of its route group — fine
/// for a single-user local API where every request effectively comes from the
/// same machine. Scoped per-router (via Extension, constructed fresh in
/// `build_router`) rather than a process-global static so concurrent test
/// suites sharing one process don't trip each other's windows.
struct RateLimiter {
    max_requests: usize,
    window: Duration,
    hits: std::sync::Mutex<VecDeque<Instant>>,
}

impl RateLimiter {
    fn new(max_requests: usize, window: Duration) -> Self {
        Self {
            max_requests,
            window,
            hits: std::sync::Mutex::new(VecDeque::new()),
        }
    }

    fn allow(&self) -> bool {
        let now = Instant::now();
        // Recover the guard even if poisoned (some other holder panicked
        // while holding the lock) rather than propagating the panic here —
        // this lock only ever guards a plain VecDeque of timestamps, so a
        // poisoned-but-recovered guard is still perfectly usable, and a
        // rate limiter that itself crashes the process on first fault would
        // turn a minor issue into a denial-of-service amplifier.
        let mut hits = self.hits.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        while matches!(hits.front(), Some(oldest) if now.duration_since(*oldest) > self.window) {
            hits.pop_front();
        }
        if hits.len() >= self.max_requests {
            false
        } else {
            hits.push_back(now);
            true
        }
    }
}

// Distinct newtypes so both limiters can live in the Extension map at once
// (Extension is keyed by type, not by value).
#[derive(Clone)]
struct AuthRateLimiter(Arc<RateLimiter>);
#[derive(Clone)]
struct SharingRateLimiter(Arc<RateLimiter>);

fn rate_limited() -> Response {
    failure(
        StatusCode::TOO_MANY_REQUESTS,
        "Too many requests. Please wait a moment and try again.",
    )
}

pub(crate) fn build_router(db: Arc<Mutex<Connection>>, jwt_secret: Arc<String>) -> Router {
    let auth_limiter = AuthRateLimiter(Arc::new(RateLimiter::new(10, Duration::from_secs(60))));
    let sharing_limiter = SharingRateLimiter(Arc::new(RateLimiter::new(10, Duration::from_secs(60))));

    Router::new()
        .route("/api/health", get(health))
        .route("/api/auth/login", post(login))
        .route("/api/auth/register", post(register))
        .route("/api/auth/me", get(me))
        .route("/api/auth/onboarding/complete", post(complete_onboarding_route))
        .route("/api/auth/forgot-password", post(forgot_password_route))
        .route("/api/auth/reset-password", post(reset_password_route))
        .route("/api/account/recovery", get(get_recovery_route).patch(update_recovery_route))
        .route("/api/sharing/invite", post(invite_member_route))
        .route("/api/sharing/redeem", post(redeem_invite_route))
        .route("/api/sharing/members", get(list_members_route))
        .route("/api/licenses", get(get_user_licenses).post(add_user_license))
        .route("/api/licenses/stats", get(get_user_license_stats))
        .route("/api/entitlement", get(get_entitlement_route))
        .route("/api/activate", post(activate_route))
        .route(
            "/api/licenses/:id",
            get(get_single_license).patch(update_single_license).delete(delete_single_license),
        )
        .route("/api/licenses/:id/active", post(mark_active_route))
        .route("/api/sites/connections", get(get_site_connections))
        .route("/api/sites", post(create_site_route))
        .route("/api/sites/:id/connect", post(connect_site_route))
        .route("/api/sites/:id/delete", post(delete_site_route))
        .route("/api/sites/:id", delete(disconnect_site_route))
        .route("/api/vault/export/json", get(export_json_route))
        .route("/api/vault/export/csv", get(export_csv_route))
        .route("/api/vault/import", post(import_licenses_route))
        .route("/api/vault/backups", get(get_backups_route).post(create_backup_route))
        .route("/api/cloud-backup/settings", get(get_cloud_backup_settings_route))
        .route("/api/cloud-backup/enable", post(enable_cloud_backup_route))
        .route("/api/cloud-backup/sync", post(sync_cloud_backup_route))
        .route("/api/cloud-backup/restore", post(restore_cloud_backup_route))
        .route("/api/reminders/items", get(get_reminder_items_route))
        .route("/api/reminders/settings", get(get_settings).patch(update_settings))
        .route("/api/vendor-policies", get(vendor_policies_meta))
        .route("/api/vendor-policies/suggest", get(vendor_policy_suggest))
        .layer(Extension(auth_limiter))
        .layer(Extension(sharing_limiter))
        .layer(webview_cors_layer())
        .with_state((db, jwt_secret))
}

/// This server binds to 127.0.0.1 and is reachable from any page open in any
/// browser on the machine, so CORS is the only thing standing between an
/// arbitrary website and the local API. Only the app's own webview origin
/// (plus the Vite dev server in debug builds) may call it cross-origin.
///
/// Tauri 2's webview origin (see `tauri::manager::AppManager::tauri_protocol_url`):
/// on Windows/Android it's `http://tauri.localhost`, or `https://tauri.localhost`
/// if `app.windows[].useHttpsScheme` / `useHttpsScheme` is set in tauri.conf.json
/// (not set here); on macOS/Linux it's `tauri://localhost`. Listing all of them
/// costs nothing since only the one matching the actual runtime origin ever
/// gets used, and it keeps this from silently breaking if that config changes.
fn webview_cors_layer() -> CorsLayer {
    #[allow(unused_mut)]
    let mut origins = vec![
        HeaderValue::from_static("tauri://localhost"),
        HeaderValue::from_static("http://tauri.localhost"),
        HeaderValue::from_static("https://tauri.localhost"),
    ];
    #[cfg(debug_assertions)]
    origins.push(HeaderValue::from_static("http://localhost:5173"));

    CorsLayer::new()
        .allow_origin(origins)
        .allow_methods([Method::GET, Method::POST, Method::PATCH, Method::DELETE])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE])
}

/// Default local API port. Avoid 3000/3001 — Windows Hyper-V often excludes them
/// (`netsh interface ipv4 show excludedportrange`), which yields bind error 10013.
pub const DEFAULT_API_PORT: u16 = 18765;

pub fn api_port() -> u16 {
    std::env::var("PERPETUA_API_PORT")
        .ok()
        .and_then(|raw| raw.parse().ok())
        .unwrap_or(DEFAULT_API_PORT)
}

pub async fn start_server(db: DbState, jwt_secret: Arc<String>) {
    let app = build_router(db, jwt_secret);
    let port = api_port();
    let addr = format!("127.0.0.1:{port}");

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|err| panic!("failed to bind Perpetua API on {addr}: {err}"));
    println!("Perpetua API server running on http://{addr}");
    axum::serve(listener, app)
        .await
        .expect("Perpetua API server failed");
}

fn success<T: serde::Serialize>(data: T) -> Response {
    (
        StatusCode::OK,
        Json(ApiResponse {
            success: true,
            data: Some(data),
            message: None,
        }),
    )
        .into_response()
}

fn created<T: serde::Serialize>(data: T) -> Response {
    (
        StatusCode::CREATED,
        Json(ApiResponse {
            success: true,
            data: Some(data),
            message: None,
        }),
    )
        .into_response()
}

fn failure(status: StatusCode, message: &str) -> Response {
    (
        status,
        Json(ApiResponse::<serde_json::Value> {
            success: false,
            data: None,
            message: Some(message.to_string()),
        }),
    )
        .into_response()
}

async fn authorized_user(
    headers: &HeaderMap,
    db: &DbState,
    jwt_secret: &str,
) -> Result<crate::models::User, Response> {
    let auth_header = headers
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();

    let token = auth_header.strip_prefix("Bearer ").unwrap_or_default();
    if token.is_empty() {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(ApiResponse::<serde_json::Value> {
                success: false,
                data: None,
                message: Some("Authentication required".to_string()),
            }),
        )
            .into_response());
    }

    let claims = verify_jwt(jwt_secret, token)
        .map_err(|_| {
            (
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::<serde_json::Value> {
                    success: false,
                    data: None,
                    message: Some("Invalid or expired token".to_string()),
                }),
            )
                .into_response()
        })?;
    let conn = db.lock().await;
    let user = get_user_by_id(&conn, claims.sub)
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<serde_json::Value> {
                    success: false,
                    data: None,
                    message: Some("Failed to load user".to_string()),
                }),
            )
                .into_response()
        })?
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::<serde_json::Value> {
                    success: false,
                    data: None,
                    message: Some("User not found".to_string()),
                }),
            )
                .into_response()
        })?;

    Ok(user)
}

/// Resolves the vault whose data a request should act on: the caller's own,
/// unless they're an accepted member of someone else's shared (Pro) vault.
fn resolved_owner(conn: &Connection, user: &crate::models::User) -> Result<i64, Response> {
    resolve_data_owner_id(conn, user.id)
        .map_err(|_| failure(StatusCode::INTERNAL_SERVER_ERROR, "Failed to resolve vault access"))
}

async fn health() -> Response {
    success(json!({ "status": "ok" }))
}

#[derive(Deserialize)]
struct VendorSuggestQuery {
    source_site: Option<String>,
    product_name: Option<String>,
}

async fn vendor_policies_meta() -> Response {
    success(crate::vendor_policy::dataset_meta())
}

async fn vendor_policy_suggest(Query(query): Query<VendorSuggestQuery>) -> Response {
    success(crate::vendor_policy::suggest_keepalive(
        query.source_site.as_deref(),
        query.product_name.as_deref(),
    ))
}

async fn login(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    Extension(limiter): Extension<AuthRateLimiter>,
    Json(req): Json<LoginRequest>,
) -> Response {
    if !limiter.0.allow() {
        return rate_limited();
    }
    let conn = db.lock().await;

    match authenticate_user(&conn, &req.email, &req.password) {
        Ok(Some(user)) => match build_auth_response(jwt_secret.as_str(), user) {
            Ok(response) => success(response),
            Err(_) => failure(StatusCode::INTERNAL_SERVER_ERROR, "Failed to create session"),
        },
        Ok(None) => failure(StatusCode::UNAUTHORIZED, "Invalid credentials"),
        Err(_) => failure(StatusCode::INTERNAL_SERVER_ERROR, "Failed to authenticate user"),
    }
}

async fn register(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    Extension(limiter): Extension<AuthRateLimiter>,
    Json(req): Json<RegisterRequest>,
) -> Response {
    if !limiter.0.allow() {
        return rate_limited();
    }
    if let Err(error) = validate_credentials(&req.email, &req.password) {
        return failure(StatusCode::BAD_REQUEST, &error.to_string());
    }

    let conn = db.lock().await;

    match get_user_by_email(&conn, &req.email) {
        Ok(Some(_)) => return failure(StatusCode::BAD_REQUEST, "User already exists"),
        Ok(None) => {}
        Err(_) => return failure(StatusCode::INTERNAL_SERVER_ERROR, "Failed to check existing user"),
    }

    match create_user(&conn, &req.email, &req.password) {
        Ok(user) => match build_auth_response(jwt_secret.as_str(), user) {
            Ok(response) => created(response),
            Err(_) => failure(StatusCode::INTERNAL_SERVER_ERROR, "Failed to create session"),
        },
        Err(_) => failure(StatusCode::INTERNAL_SERVER_ERROR, "Failed to create user"),
    }
}

async fn me(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    headers: HeaderMap,
) -> Response {
    match authorized_user(&headers, &db, jwt_secret.as_str()).await {
        Ok(user) => success(user),
        Err(error) => error,
    }
}

async fn complete_onboarding_route(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    headers: HeaderMap,
) -> Response {
    let user = match authorized_user(&headers, &db, jwt_secret.as_str()).await {
        Ok(user) => user,
        Err(error) => return error,
    };

    let conn = db.lock().await;
    match mark_onboarding_complete(&conn, user.id) {
        Ok(_) => success(json!({ "onboarding_completed": true })),
        Err(_) => failure(StatusCode::INTERNAL_SERVER_ERROR, "Failed to update onboarding state"),
    }
}

async fn forgot_password_route(
    State((db, _jwt_secret)): State<(DbState, Arc<String>)>,
    Extension(limiter): Extension<AuthRateLimiter>,
    Json(req): Json<ForgotPasswordRequest>,
) -> Response {
    if !limiter.0.allow() {
        return rate_limited();
    }
    let prepared = {
        let conn = db.lock().await;
        prepare_password_reset(&conn, &req.email)
    };

    match prepared {
        Ok(Some((mail_settings, backup_email, code))) => {
            let _ = crate::mail::send_email(
                &mail_settings,
                &backup_email,
                "Perpetua password reset code",
                &format!("Your Perpetua password reset code is: {code}\n\nThis code expires in 15 minutes. If you didn't request this, you can ignore this email."),
            )
            .await;
            success(json!({ "message": "If that account has a backup email configured, a reset code was sent." }))
        }
        Ok(None) => success(json!({ "message": "If that account has a backup email configured, a reset code was sent." })),
        Err(_) => failure(StatusCode::INTERNAL_SERVER_ERROR, "Failed to process request"),
    }
}

async fn reset_password_route(
    State((db, _jwt_secret)): State<(DbState, Arc<String>)>,
    Extension(limiter): Extension<AuthRateLimiter>,
    Json(req): Json<ResetPasswordRequest>,
) -> Response {
    if !limiter.0.allow() {
        return rate_limited();
    }
    let conn = db.lock().await;
    match confirm_password_reset(&conn, &req.email, &req.code, &req.new_password) {
        Ok(_) => success(json!({ "reset": true })),
        Err(error) => failure(StatusCode::BAD_REQUEST, &error.to_string()),
    }
}

async fn get_recovery_route(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    headers: HeaderMap,
) -> Response {
    let user = match authorized_user(&headers, &db, jwt_secret.as_str()).await {
        Ok(user) => user,
        Err(error) => return error,
    };

    let conn = db.lock().await;
    match get_account_recovery_settings(&conn, user.id) {
        Ok(settings) => success(settings),
        Err(_) => failure(StatusCode::INTERNAL_SERVER_ERROR, "Failed to fetch recovery settings"),
    }
}

async fn update_recovery_route(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    headers: HeaderMap,
    Json(payload): Json<AccountRecoverySettings>,
) -> Response {
    let user = match authorized_user(&headers, &db, jwt_secret.as_str()).await {
        Ok(user) => user,
        Err(error) => return error,
    };

    let conn = db.lock().await;
    match update_account_recovery_settings(&conn, user.id, payload) {
        Ok(settings) => success(settings),
        Err(_) => failure(StatusCode::INTERNAL_SERVER_ERROR, "Failed to update recovery settings"),
    }
}

async fn invite_member_route(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    Extension(limiter): Extension<SharingRateLimiter>,
    headers: HeaderMap,
    Json(req): Json<InviteMemberRequest>,
) -> Response {
    if !limiter.0.allow() {
        return rate_limited();
    }
    let user = match authorized_user(&headers, &db, jwt_secret.as_str()).await {
        Ok(user) => user,
        Err(error) => return error,
    };

    let prepared = {
        let conn = db.lock().await;
        prepare_invite(&conn, user.id, &req.email)
    };

    let (mail_settings, to, code) = match prepared {
        Ok(prepared) => prepared,
        Err(error) => return failure(StatusCode::BAD_REQUEST, &error.to_string()),
    };

    match crate::mail::send_email(
        &mail_settings,
        &to,
        "You've been invited to a shared Perpetua vault",
        &format!("You've been invited to share a Perpetua license vault.\n\nYour invite code is: {code}\n\nRegister or sign in to Perpetua on the same computer as the person who invited you, then enter this code under \"Have an invite code?\"."),
    )
    .await
    {
        Ok(_) => success(json!({ "invited": true })),
        Err(error) => failure(StatusCode::BAD_REQUEST, &error.to_string()),
    }
}

async fn redeem_invite_route(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    Extension(limiter): Extension<SharingRateLimiter>,
    headers: HeaderMap,
    Json(req): Json<RedeemInviteRequest>,
) -> Response {
    if !limiter.0.allow() {
        return rate_limited();
    }
    let user = match authorized_user(&headers, &db, jwt_secret.as_str()).await {
        Ok(user) => user,
        Err(error) => return error,
    };

    let conn = db.lock().await;
    match redeem_invite(&conn, user.id, &user.email, &req.code) {
        Ok(_) => success(json!({ "redeemed": true })),
        Err(error) => failure(StatusCode::BAD_REQUEST, &error.to_string()),
    }
}

async fn list_members_route(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    headers: HeaderMap,
) -> Response {
    let user = match authorized_user(&headers, &db, jwt_secret.as_str()).await {
        Ok(user) => user,
        Err(error) => return error,
    };

    let conn = db.lock().await;
    match list_vault_members(&conn, user.id) {
        Ok(members) => success(members),
        Err(_) => failure(StatusCode::INTERNAL_SERVER_ERROR, "Failed to fetch shared members"),
    }
}

async fn get_user_licenses(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    headers: HeaderMap,
) -> Response {
    let user = match authorized_user(&headers, &db, jwt_secret.as_str()).await {
        Ok(user) => user,
        Err(error) => return error,
    };

    let conn = db.lock().await;
    let owner_id = match resolved_owner(&conn, &user) {
        Ok(id) => id,
        Err(error) => return error,
    };
    match get_licenses(&conn, owner_id) {
        Ok(licenses) => success(licenses),
        Err(_) => failure(StatusCode::INTERNAL_SERVER_ERROR, "Failed to fetch licenses"),
    }
}

async fn get_user_license_stats(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    headers: HeaderMap,
) -> Response {
    let user = match authorized_user(&headers, &db, jwt_secret.as_str()).await {
        Ok(user) => user,
        Err(error) => return error,
    };

    let conn = db.lock().await;
    let owner_id = match resolved_owner(&conn, &user) {
        Ok(id) => id,
        Err(error) => return error,
    };
    match get_license_stats(&conn, owner_id) {
        Ok(stats) => success(stats),
        Err(_) => failure(StatusCode::INTERNAL_SERVER_ERROR, "Failed to fetch license stats"),
    }
}

async fn get_single_license(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Response {
    let user = match authorized_user(&headers, &db, jwt_secret.as_str()).await {
        Ok(user) => user,
        Err(error) => return error,
    };

    let conn = db.lock().await;
    let owner_id = match resolved_owner(&conn, &user) {
        Ok(id) => id,
        Err(error) => return error,
    };
    match get_license_by_id(&conn, owner_id, id) {
        Ok(Some(license)) => success(license),
        Ok(None) => failure(StatusCode::NOT_FOUND, "License not found"),
        Err(_) => failure(StatusCode::INTERNAL_SERVER_ERROR, "Failed to fetch license"),
    }
}

async fn add_user_license(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    headers: HeaderMap,
    Json(payload): Json<LicensePayload>,
) -> Response {
    let user = match authorized_user(&headers, &db, jwt_secret.as_str()).await {
        Ok(user) => user,
        Err(error) => return error,
    };

    let conn = db.lock().await;
    let owner_id = match resolved_owner(&conn, &user) {
        Ok(id) => id,
        Err(error) => return error,
    };
    match add_license(&conn, owner_id, payload) {
        Ok(license) => created(license),
        Err(error) => match error.downcast_ref::<FreeLimitReached>() {
            // 402 Payment Required: free-tier cap hit — the UI shows the upgrade modal.
            Some(limit) => failure(StatusCode::PAYMENT_REQUIRED, &limit.to_string()),
            None => failure(StatusCode::INTERNAL_SERVER_ERROR, "Failed to add license"),
        },
    }
}

async fn get_entitlement_route(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    headers: HeaderMap,
) -> Response {
    let user = match authorized_user(&headers, &db, jwt_secret.as_str()).await {
        Ok(user) => user,
        Err(error) => return error,
    };

    let conn = db.lock().await;
    let owner_id = match resolved_owner(&conn, &user) {
        Ok(id) => id,
        Err(error) => return error,
    };
    match get_entitlement(&conn, owner_id) {
        Ok(entitlement) => success(entitlement),
        Err(_) => failure(StatusCode::INTERNAL_SERVER_ERROR, "Failed to load entitlement"),
    }
}

async fn activate_route(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    headers: HeaderMap,
    Json(req): Json<ActivateRequest>,
) -> Response {
    let user = match authorized_user(&headers, &db, jwt_secret.as_str()).await {
        Ok(user) => user,
        Err(error) => return error,
    };

    let key = req.key.trim().to_string();

    if crate::polar::is_configured() {
        // Real purchases: validate + reserve a device slot via Polar (public API).
        match crate::polar::activate(&key, "Perpetua desktop").await {
            Ok(activation) => {
                let conn = db.lock().await;
                match mark_pro_activated(&conn, user.id, &key, Some(&activation.id)) {
                    Ok(entitlement) => success(entitlement),
                    Err(_) => failure(StatusCode::INTERNAL_SERVER_ERROR, "Failed to record activation"),
                }
            }
            Err(error) => failure(StatusCode::BAD_REQUEST, &error.to_string()),
        }
    } else {
        // Offline fallback: self-issued HS256 keys (dev / tests).
        let conn = db.lock().await;
        match activate_pro(&conn, user.id, &key) {
            Ok(entitlement) => success(entitlement),
            Err(error) => failure(StatusCode::BAD_REQUEST, &error.to_string()),
        }
    }
}

async fn update_single_license(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<LicenseUpdate>,
) -> Response {
    let user = match authorized_user(&headers, &db, jwt_secret.as_str()).await {
        Ok(user) => user,
        Err(error) => return error,
    };

    let conn = db.lock().await;
    let owner_id = match resolved_owner(&conn, &user) {
        Ok(id) => id,
        Err(error) => return error,
    };
    match update_license(&conn, owner_id, id, payload) {
        Ok(Some(license)) => success(license),
        Ok(None) => failure(StatusCode::NOT_FOUND, "License not found"),
        Err(_) => failure(StatusCode::INTERNAL_SERVER_ERROR, "Failed to update license"),
    }
}

async fn mark_active_route(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Response {
    let user = match authorized_user(&headers, &db, jwt_secret.as_str()).await {
        Ok(user) => user,
        Err(error) => return error,
    };

    let conn = db.lock().await;
    let owner_id = match resolved_owner(&conn, &user) {
        Ok(id) => id,
        Err(error) => return error,
    };
    match mark_license_active(&conn, owner_id, id) {
        Ok(Some(license)) => success(license),
        Ok(None) => failure(StatusCode::NOT_FOUND, "License not found"),
        Err(_) => failure(StatusCode::INTERNAL_SERVER_ERROR, "Failed to update license"),
    }
}

async fn delete_single_license(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Response {
    let user = match authorized_user(&headers, &db, jwt_secret.as_str()).await {
        Ok(user) => user,
        Err(error) => return error,
    };

    let conn = db.lock().await;
    let owner_id = match resolved_owner(&conn, &user) {
        Ok(id) => id,
        Err(error) => return error,
    };
    match delete_license(&conn, owner_id, id) {
        Ok(true) => success(json!({ "deleted": true })),
        Ok(false) => failure(StatusCode::NOT_FOUND, "License not found"),
        Err(_) => failure(StatusCode::INTERNAL_SERVER_ERROR, "Failed to delete license"),
    }
}

async fn get_site_connections(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    headers: HeaderMap,
) -> Response {
    let user = match authorized_user(&headers, &db, jwt_secret.as_str()).await {
        Ok(user) => user,
        Err(error) => return error,
    };

    let conn = db.lock().await;
    let owner_id = match resolved_owner(&conn, &user) {
        Ok(id) => id,
        Err(error) => return error,
    };
    match list_site_connections(&conn, owner_id) {
        Ok(sites) => success(sites),
        Err(_) => failure(StatusCode::INTERNAL_SERVER_ERROR, "Failed to fetch site connections"),
    }
}

async fn create_site_route(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    headers: HeaderMap,
    Json(req): Json<CreateSiteRequest>,
) -> Response {
    let user = match authorized_user(&headers, &db, jwt_secret.as_str()).await {
        Ok(user) => user,
        Err(error) => return error,
    };

    let conn = db.lock().await;
    let owner_id = match resolved_owner(&conn, &user) {
        Ok(id) => id,
        Err(error) => return error,
    };
    match create_site(&conn, owner_id, &req.name, &req.url, req.description.as_deref()) {
        Ok(site) => created(site),
        Err(error) => failure(StatusCode::BAD_REQUEST, &error.to_string()),
    }
}

async fn connect_site_route(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    let user = match authorized_user(&headers, &db, jwt_secret.as_str()).await {
        Ok(user) => user,
        Err(error) => return error,
    };

    let conn = db.lock().await;
    let owner_id = match resolved_owner(&conn, &user) {
        Ok(id) => id,
        Err(error) => return error,
    };
    match connect_site(&conn, owner_id, &id) {
        Ok(_) => success(json!({ "connected": true })),
        Err(_) => failure(StatusCode::INTERNAL_SERVER_ERROR, "Failed to connect site"),
    }
}

async fn delete_site_route(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    if let Err(error) = authorized_user(&headers, &db, jwt_secret.as_str()).await {
        return error;
    }

    let conn = db.lock().await;
    match delete_site(&conn, &id) {
        Ok(_) => success(json!({ "deleted": true })),
        Err(error) => failure(StatusCode::BAD_REQUEST, &error.to_string()),
    }
}

async fn disconnect_site_route(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    let user = match authorized_user(&headers, &db, jwt_secret.as_str()).await {
        Ok(user) => user,
        Err(error) => return error,
    };

    let conn = db.lock().await;
    let owner_id = match resolved_owner(&conn, &user) {
        Ok(id) => id,
        Err(error) => return error,
    };
    match disconnect_site(&conn, owner_id, &id) {
        Ok(_) => success(json!({ "connected": false })),
        Err(_) => failure(StatusCode::INTERNAL_SERVER_ERROR, "Failed to disconnect site"),
    }
}

async fn get_settings(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    headers: HeaderMap,
) -> Response {
    let user = match authorized_user(&headers, &db, jwt_secret.as_str()).await {
        Ok(user) => user,
        Err(error) => return error,
    };

    let conn = db.lock().await;
    match get_reminder_settings(&conn, user.id) {
        Ok(Some(settings)) => success(settings),
        Ok(None) => failure(StatusCode::NOT_FOUND, "Settings not found"),
        Err(_) => failure(StatusCode::INTERNAL_SERVER_ERROR, "Failed to fetch settings"),
    }
}

async fn update_settings(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    headers: HeaderMap,
    Json(payload): Json<ReminderSettingsUpdate>,
) -> Response {
    let user = match authorized_user(&headers, &db, jwt_secret.as_str()).await {
        Ok(user) => user,
        Err(error) => return error,
    };

    let conn = db.lock().await;
    match update_reminder_settings(&conn, user.id, payload) {
        Ok(Some(settings)) => success(settings),
        Ok(None) => failure(StatusCode::NOT_FOUND, "Settings not found"),
        Err(_) => failure(StatusCode::INTERNAL_SERVER_ERROR, "Failed to update settings"),
    }
}

async fn get_reminder_items_route(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    headers: HeaderMap,
) -> Response {
    let user = match authorized_user(&headers, &db, jwt_secret.as_str()).await {
        Ok(user) => user,
        Err(error) => return error,
    };

    let conn = db.lock().await;
    let owner_id = match resolved_owner(&conn, &user) {
        Ok(id) => id,
        Err(error) => return error,
    };
    match get_reminder_items(&conn, owner_id) {
        Ok(items) => success(items),
        Err(_) => failure(StatusCode::INTERNAL_SERVER_ERROR, "Failed to fetch reminder items"),
    }
}

async fn export_json_route(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    headers: HeaderMap,
) -> Response {
    let user = match authorized_user(&headers, &db, jwt_secret.as_str()).await {
        Ok(user) => user,
        Err(error) => return error,
    };

    let conn = db.lock().await;
    let owner_id = match resolved_owner(&conn, &user) {
        Ok(id) => id,
        Err(error) => return error,
    };
    match export_licenses_json(&conn, owner_id) {
        Ok(file) => success(file),
        Err(_) => failure(StatusCode::INTERNAL_SERVER_ERROR, "Failed to export licenses"),
    }
}

async fn export_csv_route(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    headers: HeaderMap,
) -> Response {
    let user = match authorized_user(&headers, &db, jwt_secret.as_str()).await {
        Ok(user) => user,
        Err(error) => return error,
    };

    let conn = db.lock().await;
    let owner_id = match resolved_owner(&conn, &user) {
        Ok(id) => id,
        Err(error) => return error,
    };
    match export_licenses_csv(&conn, owner_id) {
        Ok(file) => success(file),
        Err(_) => failure(StatusCode::INTERNAL_SERVER_ERROR, "Failed to export licenses"),
    }
}

async fn import_licenses_route(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    headers: HeaderMap,
    Json(payload): Json<ImportLicensesRequest>,
) -> Response {
    let user = match authorized_user(&headers, &db, jwt_secret.as_str()).await {
        Ok(user) => user,
        Err(error) => return error,
    };

    let conn = db.lock().await;
    let owner_id = match resolved_owner(&conn, &user) {
        Ok(id) => id,
        Err(error) => return error,
    };
    let result = match payload.format.trim().to_lowercase().as_str() {
        "json" => import_licenses_json(&conn, owner_id, &payload.content),
        "csv" => import_licenses_csv(&conn, owner_id, &payload.content),
        _ => return failure(StatusCode::BAD_REQUEST, "Unsupported import format"),
    };

    match result {
        Ok(summary) => success(summary),
        Err(error) => match error.downcast_ref::<FreeLimitReached>() {
            Some(limit) => failure(StatusCode::PAYMENT_REQUIRED, &limit.to_string()),
            None => failure(StatusCode::BAD_REQUEST, &error.to_string()),
        },
    }
}

async fn get_backups_route(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    headers: HeaderMap,
) -> Response {
    let _user = match authorized_user(&headers, &db, jwt_secret.as_str()).await {
        Ok(user) => user,
        Err(error) => return error,
    };

    match list_backups() {
        Ok(backups) => success(backups),
        Err(_) => failure(StatusCode::INTERNAL_SERVER_ERROR, "Failed to list backups"),
    }
}

async fn create_backup_route(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    headers: HeaderMap,
) -> Response {
    let _user = match authorized_user(&headers, &db, jwt_secret.as_str()).await {
        Ok(user) => user,
        Err(error) => return error,
    };

    let conn = db.lock().await;
    match create_backup(&conn) {
        Ok(backup) => created(backup),
        Err(_) => failure(StatusCode::INTERNAL_SERVER_ERROR, "Failed to create backup"),
    }
}

async fn get_cloud_backup_settings_route(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    headers: HeaderMap,
) -> Response {
    let user = match authorized_user(&headers, &db, jwt_secret.as_str()).await {
        Ok(user) => user,
        Err(error) => return error,
    };

    let conn = db.lock().await;
    match get_cloud_backup_settings(&conn, user.id) {
        Ok(settings) => success(settings),
        Err(_) => failure(StatusCode::INTERNAL_SERVER_ERROR, "Failed to fetch cloud backup settings"),
    }
}

async fn enable_cloud_backup_route(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    headers: HeaderMap,
    Json(req): Json<EnableCloudBackupRequest>,
) -> Response {
    let user = match authorized_user(&headers, &db, jwt_secret.as_str()).await {
        Ok(user) => user,
        Err(error) => return error,
    };

    let prepared = {
        let conn = db.lock().await;
        enable_cloud_backup(&conn, user.id, req)
    };

    let (mail_settings, backup_email, recovery_key) = match prepared {
        Ok(prepared) => prepared,
        Err(error) => return failure(StatusCode::BAD_REQUEST, &error.to_string()),
    };

    let email_result = crate::mail::send_email(
        &mail_settings,
        &backup_email,
        "Your Perpetua cloud backup recovery key",
        &format!(
            "Cloud backup is now enabled for your Perpetua vault.\n\nYour recovery key is:\n\n{recovery_key}\n\nSAVE THIS SOMEWHERE SAFE. Perpetua cannot recover it for you — without it, your encrypted cloud backup cannot be decrypted, even by you. This email is a safety net in case you lose the copy you were shown in the app.\n\nIf you didn't enable cloud backup, someone with access to this device did — check your account."
        ),
    )
    .await;

    // Enabling cloud backup and generating the key must not be rolled back
    // just because SMTP hiccupped — the on-screen display is the primary
    // safety net, this email is secondary.
    let result = match email_result {
        Ok(_) => EnableCloudBackupResult { recovery_key, emailed: true, email_error: None },
        Err(error) => EnableCloudBackupResult { recovery_key, emailed: false, email_error: Some(error.to_string()) },
    };
    success(result)
}

async fn sync_cloud_backup_route(
    State((db, jwt_secret)): State<(DbState, Arc<String>)>,
    headers: HeaderMap,
) -> Response {
    let user = match authorized_user(&headers, &db, jwt_secret.as_str()).await {
        Ok(user) => user,
        Err(error) => return error,
    };

    let prepared = {
        let conn = db.lock().await;
        prepare_cloud_sync(&conn, user.id)
    };

    let context = match prepared {
        Ok(context) => context,
        Err(error) => return failure(StatusCode::BAD_REQUEST, &error.to_string()),
    };

    let plaintext = match std::fs::read(&context.backup_path) {
        Ok(bytes) => bytes,
        Err(_) => return failure(StatusCode::INTERNAL_SERVER_ERROR, "Failed to read local backup"),
    };

    let target = crate::cloud_backup::WebDavTarget {
        base_url: &context.webdav_url,
        username: &context.webdav_username,
        password: &context.webdav_password,
        remote_path: &context.remote_path,
    };

    let upload_result = crate::cloud_backup::upload(&target, &context.recovery_key, &plaintext).await;

    let conn = db.lock().await;
    let error_message = upload_result.as_ref().err().map(|error| error.to_string());
    let _ = record_cloud_sync_result(&conn, user.id, error_message.as_deref());

    match upload_result {
        Ok(_) => match get_cloud_backup_settings(&conn, user.id) {
            Ok(settings) => success(settings),
            Err(_) => failure(StatusCode::INTERNAL_SERVER_ERROR, "Backup uploaded, but failed to refresh status"),
        },
        Err(error) => failure(StatusCode::BAD_GATEWAY, &error.to_string()),
    }
}

/// Unauthenticated by design: a brand-new install has no local user account
/// to log in with, so restoring from a cloud backup is how it gets one. Rate
/// limited the same as login/register since WebDAV creds + a recovery key
/// form a credential-guessing surface.
async fn restore_cloud_backup_route(
    State((db, _jwt_secret)): State<(DbState, Arc<String>)>,
    Extension(limiter): Extension<AuthRateLimiter>,
    Json(req): Json<RestoreCloudBackupRequest>,
) -> Response {
    if !limiter.0.allow() {
        return rate_limited();
    }

    let target = crate::cloud_backup::WebDavTarget {
        base_url: &req.webdav_url,
        username: &req.webdav_username,
        password: &req.webdav_password,
        remote_path: &req.remote_path,
    };

    let plaintext = match crate::cloud_backup::download(&target, &req.recovery_key).await {
        Ok(bytes) => bytes,
        Err(error) => return failure(StatusCode::BAD_GATEWAY, &error.to_string()),
    };

    match restore_vault_from_bytes(&db, &plaintext).await {
        Ok(()) => success(json!({ "restored": true })),
        Err(error) => failure(StatusCode::INTERNAL_SERVER_ERROR, &error.to_string()),
    }
}
