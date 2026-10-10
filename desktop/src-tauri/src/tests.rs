use std::sync::Arc;
use std::thread;
use std::time::Duration;

use axum::body::{to_bytes, Body};
use axum::http::{Request, StatusCode};
use tempfile::tempdir;
use tokio::sync::Mutex;
use tower::util::ServiceExt;

use crate::api::build_router;
use crate::database::{backup_dir_at, db_path_at, init_db_at};
use crate::models::{AccountRecoverySettings, EnableCloudBackupRequest, LicensePayload};
use crate::services::{
    activate_pro, add_license, authenticate_user, collect_due_notifications, mark_notice_delivered, pending_notifications, confirm_password_reset,
    create_backup_in_dir, create_jwt, create_user, delete_license, enable_cloud_backup,
    export_licenses_csv, export_licenses_json, get_entitlement, get_license_by_id, get_license_stats,
    get_licenses, get_reminder_items, import_licenses_csv, import_licenses_json, list_backups_in_dir,
    mark_license_active, mint_pro_key, prepare_invite, prepare_password_reset, redeem_invite,
    resolve_data_owner_id, restore_vault_from_bytes_at, update_account_recovery_settings, update_license,
    verify_pro_key, FREE_LICENSE_LIMIT,
};

fn sample_license(product_name: &str, expiry_date: Option<&str>) -> LicensePayload {
    LicensePayload {
        product_name: product_name.to_string(),
        license_key: format!("{product_name}-KEY"),
        purchase_date: Some("2026-01-01".to_string()),
        expiry_date: expiry_date.map(ToString::to_string),
        status: Some("active".to_string()),
        source_site: Some("appsumo".to_string()),
        product_url: Some("https://example.com".to_string()),
        redemption_url: Some("https://redeem.example.com".to_string()),
        download_url: Some("https://download.example.com".to_string()),
        notes: Some("line one, line two\nline three".to_string()),
        action_required: Some(false),
        action_description: None,
        action_deadline: None,
        keepalive_days: None,
        last_active: None,
    }
}

#[test]
fn keepalive_days_out_of_range_is_rejected_and_stored_bad_rows_do_not_panic() {
    let temp = tempdir().expect("temp dir");
    let conn = init_db_at(temp.path()).expect("db");
    let user = create_user(&conn, "keepalive@example.com", "password123").expect("user");

    for days in [3651_i64, 99_999_999_999_i64] {
        let mut payload = sample_license("Too Long", None);
        payload.keepalive_days = Some(days);
        assert!(add_license(&conn, user.id, payload).is_err());
    }

    conn.execute(
        "INSERT INTO licenses (user_id, product_name, license_key, purchase_date, status,
            action_required, created_at, updated_at, keepalive_days)
         VALUES (?, 'Bad Row', 'BAD-KEY', '2026-01-01', 'active', 0, '2026-01-01', '2026-01-01', 99999999999)",
        rusqlite::params![user.id],
    )
    .expect("insert bad row");

    let _ = get_reminder_items(&conn, user.id).expect("reminders do not fail");
    let _ = collect_due_notifications(&conn).expect("notifications do not fail");
}

#[test]
fn services_persist_auth_and_license_crud() {
    let temp = tempdir().expect("temp dir");
    let conn = init_db_at(temp.path()).expect("db");
    let user = create_user(&conn, "suite@example.com", "password123").expect("user");

    let authenticated = authenticate_user(&conn, "suite@example.com", "password123")
        .expect("authenticate")
        .expect("authenticated user");
    assert_eq!(authenticated.email, "suite@example.com");

    let created = add_license(&conn, user.id, sample_license("Figma Pro", Some("2099-01-01")))
        .expect("license created");
    assert_eq!(created.product_name, "Figma Pro");

    let updated = update_license(
        &conn,
        user.id,
        created.id,
        crate::models::LicenseUpdate {
            notes: Some("updated notes".to_string()),
            ..Default::default()
        },
    )
    .expect("license updated")
    .expect("updated license");
    assert_eq!(updated.notes.as_deref(), Some("updated notes"));

    let fetched = get_license_by_id(&conn, user.id, created.id)
        .expect("fetch license")
        .expect("license exists");
    assert_eq!(fetched.product_name, "Figma Pro");

    assert!(delete_license(&conn, user.id, created.id).expect("delete license"));
    assert!(get_licenses(&conn, user.id).expect("license list").is_empty());
}

#[test]
fn stats_and_reminders_cover_expiry_and_action_deadlines() {
    let temp = tempdir().expect("temp dir");
    let conn = init_db_at(temp.path()).expect("db");
    let user = create_user(&conn, "alerts@example.com", "password123").expect("user");
    // This scenario needs 4 licenses; unlock Pro so the free-tier cap doesn't interfere.
    activate_pro(&conn, user.id, &mint_pro_key("test-suite").expect("mint key")).expect("activate");
    let now = chrono::Utc::now().date_naive();
    let upcoming_expiry = (now + chrono::Duration::days(15)).format("%Y-%m-%d").to_string();
    let action_deadline = (now + chrono::Duration::days(10)).format("%Y-%m-%d").to_string();
    let expired_date = (now - chrono::Duration::days(1)).format("%Y-%m-%d").to_string();

    add_license(&conn, user.id, sample_license("Active Forever", None)).expect("active license");
    add_license(
        &conn,
        user.id,
        sample_license("Expiring Soon", Some(&upcoming_expiry)),
    )
    .expect("expiring license");
    add_license(
        &conn,
        user.id,
        LicensePayload {
            action_required: Some(true),
            action_description: Some("Redeem before loss".to_string()),
            action_deadline: Some(action_deadline),
            ..sample_license("Redeem Me", None)
        },
    )
    .expect("action license");
    add_license(&conn, user.id, sample_license("Expired Suite", Some(&expired_date)))
        .expect("expired license");

    let stats = get_license_stats(&conn, user.id).expect("stats");
    assert_eq!(stats.total, 4);
    assert_eq!(stats.expiring, 1);
    assert_eq!(stats.expired, 1);
    assert_eq!(stats.active, 3);

    let items = get_reminder_items(&conn, user.id).expect("reminder items");
    assert!(items.iter().any(|item| item.kind == "action"));
    assert!(items.iter().any(|item| item.kind == "expiry" && item.status == "overdue"));
}

#[test]
fn background_notifications_fire_for_due_items_and_dedupe_per_day() {
    let temp = tempdir().expect("temp dir");
    let conn = init_db_at(temp.path()).expect("db");
    let user = create_user(&conn, "notify@example.com", "password123").expect("user");
    let now = chrono::Utc::now().date_naive();
    let in_three = (now + chrono::Duration::days(3)).format("%Y-%m-%d").to_string();
    let in_twenty = (now + chrono::Duration::days(20)).format("%Y-%m-%d").to_string();
    let today = now.format("%Y-%m-%d").to_string();

    // Action due today -> notify; expiry in 3 days -> notify (within 7-day window).
    add_license(
        &conn,
        user.id,
        LicensePayload {
            action_required: Some(true),
            action_description: Some("Redeem now".to_string()),
            action_deadline: Some(today),
            ..sample_license("Redeem Today", None)
        },
    )
    .expect("action license");
    add_license(&conn, user.id, sample_license("Expiring Soon", Some(&in_three)))
        .expect("expiring license");
    // Expiry in 20 days -> outside the 7-day notify window, no notification.
    add_license(&conn, user.id, sample_license("Far Off", Some(&in_twenty)))
        .expect("far license");

    let first = pending_notifications(&conn).expect("first pass");
    assert_eq!(first.len(), 2, "due action + near expiry should notify");

    // Not marked until delivery is confirmed: still pending.
    assert_eq!(pending_notifications(&conn).expect("pending").len(), 2);
    for n in &first {
        mark_notice_delivered(&conn, n).expect("mark");
    }

    // Same day: already-notified items are not re-sent.
    let second = pending_notifications(&conn).expect("second pass");
    assert!(second.is_empty(), "no duplicate notifications within a day");
}

#[test]
fn users_with_desktop_reminders_off_get_no_notices() {
    let temp = tempdir().expect("temp dir");
    let conn = init_db_at(temp.path()).expect("db");
    let user = create_user(&conn, "quiet@example.com", "password123").expect("user");
    let today = chrono::Utc::now().date_naive().format("%Y-%m-%d").to_string();
    add_license(&conn, user.id, sample_license("Expires Today", Some(&today))).expect("license");
    assert_eq!(collect_due_notifications(&conn).expect("on").len(), 1);

    conn.execute(
        "UPDATE users SET browser_notifications = 0 WHERE id = ?",
        rusqlite::params![user.id],
    )
    .expect("disable");
    assert!(collect_due_notifications(&conn).expect("off").is_empty());
}

#[test]
fn keepalive_flags_inactive_licenses_and_mark_active_resets() {
    let temp = tempdir().expect("temp dir");
    let conn = init_db_at(temp.path()).expect("db");
    let user = create_user(&conn, "keep@example.com", "password123").expect("user");
    let now = chrono::Utc::now().date_naive();
    let stale = (now - chrono::Duration::days(40)).format("%Y-%m-%d").to_string();

    // Must log in every 30 days, but last active 40 days ago -> 10 days overdue.
    add_license(
        &conn,
        user.id,
        LicensePayload {
            keepalive_days: Some(30),
            last_active: Some(stale),
            ..sample_license("Inactive Tool", None)
        },
    )
    .expect("license");

    let items = get_reminder_items(&conn, user.id).expect("items");
    let keepalive = items
        .iter()
        .find(|item| item.kind == "keepalive")
        .expect("keepalive reminder present");
    assert_eq!(keepalive.status, "overdue");

    // "Mark as used" resets the clock to today.
    let updated = mark_license_active(&conn, user.id, keepalive.license_id)
        .expect("mark active")
        .expect("license returned");
    assert_eq!(updated.last_active.as_deref(), Some(now.format("%Y-%m-%d").to_string().as_str()));

    // No longer overdue after resetting activity.
    let after = get_reminder_items(&conn, user.id).expect("items after");
    assert!(
        after
            .iter()
            .all(|item| item.kind != "keepalive" || item.status != "overdue"),
        "keep-alive should no longer be overdue after marking active"
    );
}

#[test]
fn keepalive_prompts_proactively_before_revocation() {
    let temp = tempdir().expect("temp dir");
    let conn = init_db_at(temp.path()).expect("db");
    let user = create_user(&conn, "lead@example.com", "password123").expect("user");
    let now = chrono::Utc::now().date_naive();
    // 90-day cadence, last used 70 days ago: real revocation is ~20 days out,
    // but the safety margin (¼ of 90 ≈ 22 days) means we should prompt NOW.
    let last = (now - chrono::Duration::days(70)).format("%Y-%m-%d").to_string();
    add_license(
        &conn,
        user.id,
        LicensePayload {
            keepalive_days: Some(90),
            last_active: Some(last),
            ..sample_license("Big Cadence Tool", None)
        },
    )
    .expect("license");

    let notices = collect_due_notifications(&conn).expect("notices");
    assert_eq!(notices.len(), 1, "should prompt proactively, ~20 days before revocation");
    assert_eq!(notices[0].kind, "keepalive");
    assert!(
        notices[0].body.contains("revoked around"),
        "notice should name the real revocation date"
    );
}

#[test]
fn free_tier_caps_licenses_until_pro_unlock() {
    let temp = tempdir().expect("temp dir");
    let conn = init_db_at(temp.path()).expect("db");
    let user = create_user(&conn, "free@example.com", "password123").expect("user");

    // Free plan: first FREE_LICENSE_LIMIT licenses succeed.
    for i in 0..FREE_LICENSE_LIMIT {
        add_license(&conn, user.id, sample_license(&format!("Deal {i}"), None))
            .expect("license within free limit");
    }

    let before = get_entitlement(&conn, user.id).expect("entitlement");
    assert!(!before.pro);
    assert_eq!(before.used, FREE_LICENSE_LIMIT);
    assert_eq!(before.remaining, Some(0));

    // The next add is blocked.
    let blocked = add_license(&conn, user.id, sample_license("One Too Many", None));
    assert!(blocked.is_err(), "add beyond the free limit should fail");

    // Bad keys are rejected.
    assert!(verify_pro_key("not-a-real-key").is_err());

    // A minted key unlocks Pro and removes the cap.
    let key = mint_pro_key("order-123").expect("mint key");
    let after = activate_pro(&conn, user.id, &key).expect("activate pro");
    assert!(after.pro);
    assert!(after.activated_at.is_some());

    add_license(&conn, user.id, sample_license("Now Unlimited", None))
        .expect("add succeeds after Pro unlock");
    assert_eq!(get_licenses(&conn, user.id).expect("list").len(), FREE_LICENSE_LIMIT + 1);
}

#[test]
fn import_export_round_trip_skips_duplicates_and_preserves_csv_notes() {
    let source_dir = tempdir().expect("source dir");
    let source_conn = init_db_at(source_dir.path()).expect("source db");
    let source_user = create_user(&source_conn, "export@example.com", "password123").expect("source user");
    add_license(
        &source_conn,
        source_user.id,
        sample_license("Comma Notes", Some("2099-01-01")),
    )
    .expect("source license");

    let json_export = export_licenses_json(&source_conn, source_user.id).expect("json export");
    let csv_export = export_licenses_csv(&source_conn, source_user.id).expect("csv export");

    let json_dir = tempdir().expect("json dir");
    let json_conn = init_db_at(json_dir.path()).expect("json db");
    let json_user = create_user(&json_conn, "json@example.com", "password123").expect("json user");
    let imported = import_licenses_json(&json_conn, json_user.id, &json_export.content).expect("json import");
    assert_eq!(imported.imported, 1);
    let duplicate = import_licenses_json(&json_conn, json_user.id, &json_export.content).expect("duplicate import");
    assert_eq!(duplicate.imported, 0);
    assert_eq!(duplicate.skipped_duplicates, 1);

    let csv_dir = tempdir().expect("csv dir");
    let csv_conn = init_db_at(csv_dir.path()).expect("csv db");
    let csv_user = create_user(&csv_conn, "csv@example.com", "password123").expect("csv user");
    let csv_import = import_licenses_csv(&csv_conn, csv_user.id, &csv_export.content).expect("csv import");
    assert_eq!(csv_import.imported, 1);
    let imported_license = get_licenses(&csv_conn, csv_user.id).expect("csv licenses");
    assert_eq!(
        imported_license[0].notes.as_deref(),
        Some("line one, line two\nline three")
    );
}

#[test]
fn invalid_import_is_all_or_nothing() {
    let temp = tempdir().expect("temp dir");
    let conn = init_db_at(temp.path()).expect("db");
    let user = create_user(&conn, "import@example.com", "password123").expect("user");

    let payload = r#"
    [
      {
        "product_name": "Valid",
        "license_key": "VALID-KEY",
        "purchase_date": "2026-01-01",
        "expiry_date": "2099-01-01",
        "status": "active"
      },
      {
        "product_name": "Broken",
        "license_key": "BROKEN-KEY",
        "purchase_date": "2026-01-01",
        "expiry_date": "01-01-2099",
        "status": "active"
      }
    ]
    "#;

    assert!(import_licenses_json(&conn, user.id, payload).is_err());
    assert!(get_licenses(&conn, user.id).expect("post-import licenses").is_empty());
}

#[test]
fn backup_rotation_keeps_only_recent_db_files_and_preserves_other_files() {
    let temp = tempdir().expect("temp dir");
    let conn = init_db_at(temp.path()).expect("db");
    let backup_dir = backup_dir_at(temp.path()).expect("backup dir");
    std::fs::write(backup_dir.join("keep.txt"), "leave me").expect("write non-db file");

    for _ in 0..6 {
        create_backup_in_dir(&conn, &backup_dir).expect("create backup");
        thread::sleep(Duration::from_millis(20));
    }

    let backups = list_backups_in_dir(&backup_dir).expect("list backups");
    assert_eq!(backups.len(), 5);
    assert!(backup_dir.join("keep.txt").exists());
}

#[test]
fn polar_disabled_by_default_and_parses_activation_response() {
    // With no POLAR_ORGANIZATION_ID embedded, the offline key path is used —
    // this is what keeps the rest of the suite working without network.
    assert!(!crate::polar::is_configured());

    // A successful Polar activate response deserializes into our minimal shape.
    let sample = r#"{
        "id": "a1b2c3d4-0000-0000-0000-000000000000",
        "license_key_id": "key-uuid",
        "label": "Perpetua desktop",
        "meta": {},
        "created_at": "2026-06-18T00:00:00Z",
        "license_key": { "status": "granted", "id": "key-uuid" }
    }"#;
    let activation: crate::polar::PolarActivation =
        serde_json::from_str(sample).expect("parse activation");
    assert_eq!(activation.id, "a1b2c3d4-0000-0000-0000-000000000000");
    assert_eq!(activation.license_key.status, "granted");
}

async fn read_json(response: axum::response::Response) -> serde_json::Value {
    let body = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("read body");
    serde_json::from_slice(&body).expect("json body")
}

fn http(method: &str, uri: &str, token: Option<&str>, body: Option<&str>) -> Request<Body> {
    let mut builder = Request::builder().uri(uri).method(method);
    if body.is_some() {
        builder = builder.header("content-type", "application/json");
    }
    if let Some(token) = token {
        builder = builder.header("authorization", format!("Bearer {token}"));
    }
    builder
        .body(body.map(|s| Body::from(s.to_string())).unwrap_or_else(Body::empty))
        .expect("request")
}

#[test]
fn validate_credentials_rejects_bad_input() {
    use crate::services::validate_credentials;
    assert!(validate_credentials("user@example.com", "password123").is_ok());
    assert!(validate_credentials("user@example.com", "short").is_err()); // too short
    assert!(validate_credentials("not-an-email", "password123").is_err()); // no @
    assert!(validate_credentials("", "password123").is_err()); // empty
    assert!(validate_credentials("@x.com", "password123").is_err()); // starts with @
}

#[tokio::test]
async fn register_route_rejects_weak_credentials_and_duplicates() {
    let temp = tempdir().expect("temp dir");
    let conn = init_db_at(temp.path()).expect("db");
    let router = build_router(Arc::new(Mutex::new(conn)), Arc::new("test-secret".to_string()));

    let weak = router
        .clone()
        .oneshot(http(
            "POST",
            "/api/auth/register",
            None,
            Some(r#"{"email":"a@b.com","password":"short"}"#),
        ))
        .await
        .expect("weak");
    assert_eq!(weak.status(), StatusCode::BAD_REQUEST);

    let bad_email = router
        .clone()
        .oneshot(http(
            "POST",
            "/api/auth/register",
            None,
            Some(r#"{"email":"nope","password":"password123"}"#),
        ))
        .await
        .expect("bad email");
    assert_eq!(bad_email.status(), StatusCode::BAD_REQUEST);

    let ok = router
        .clone()
        .oneshot(http(
            "POST",
            "/api/auth/register",
            None,
            Some(r#"{"email":"ok@b.com","password":"password123"}"#),
        ))
        .await
        .expect("ok");
    assert_eq!(ok.status(), StatusCode::CREATED);

    let dup = router
        .oneshot(http(
            "POST",
            "/api/auth/register",
            None,
            Some(r#"{"email":"ok@b.com","password":"password123"}"#),
        ))
        .await
        .expect("dup");
    assert_eq!(dup.status(), StatusCode::BAD_REQUEST);
}

async fn register_and_token(router: &axum::Router) -> String {
    let response = router
        .clone()
        .oneshot(http(
            "POST",
            "/api/auth/register",
            None,
            Some(r#"{"email":"crud@example.com","password":"password123"}"#),
        ))
        .await
        .expect("register");
    read_json(response).await["data"]["token"]
        .as_str()
        .expect("token")
        .to_string()
}

#[tokio::test]
async fn license_crud_over_http() {
    let temp = tempdir().expect("temp dir");
    let conn = init_db_at(temp.path()).expect("db");
    let router = build_router(Arc::new(Mutex::new(conn)), Arc::new("test-secret".to_string()));
    let token = register_and_token(&router).await;

    let created = router
        .clone()
        .oneshot(http(
            "POST",
            "/api/licenses",
            Some(&token),
            Some(r#"{"product_name":"Tool","license_key":"K1"}"#),
        ))
        .await
        .expect("create");
    assert_eq!(created.status(), StatusCode::CREATED);
    let id = read_json(created).await["data"]["id"].as_i64().expect("id");

    let updated = router
        .clone()
        .oneshot(http(
            "PATCH",
            &format!("/api/licenses/{id}"),
            Some(&token),
            Some(r#"{"notes":"updated via http"}"#),
        ))
        .await
        .expect("update");
    assert_eq!(updated.status(), StatusCode::OK);
    assert_eq!(read_json(updated).await["data"]["notes"], "updated via http");

    let deleted = router
        .clone()
        .oneshot(http("DELETE", &format!("/api/licenses/{id}"), Some(&token), None))
        .await
        .expect("delete");
    assert_eq!(deleted.status(), StatusCode::OK);

    let missing = router
        .oneshot(http("GET", &format!("/api/licenses/{id}"), Some(&token), None))
        .await
        .expect("missing");
    assert_eq!(missing.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn keepalive_mark_active_over_http() {
    let temp = tempdir().expect("temp dir");
    let conn = init_db_at(temp.path()).expect("db");
    let router = build_router(Arc::new(Mutex::new(conn)), Arc::new("test-secret".to_string()));
    let token = register_and_token(&router).await;

    let stale = (chrono::Utc::now().date_naive() - chrono::Duration::days(40))
        .format("%Y-%m-%d")
        .to_string();
    let created = router
        .clone()
        .oneshot(http(
            "POST",
            "/api/licenses",
            Some(&token),
            Some(&format!(
                r#"{{"product_name":"Rytr","license_key":"K1","keepalive_days":30,"last_active":"{stale}"}}"#
            )),
        ))
        .await
        .expect("create");
    let id = read_json(created).await["data"]["id"].as_i64().expect("id");

    let items = router
        .clone()
        .oneshot(http("GET", "/api/reminders/items", Some(&token), None))
        .await
        .expect("items");
    let body = read_json(items).await;
    let keepalive = body["data"]
        .as_array()
        .expect("array")
        .iter()
        .find(|item| item["kind"] == "keepalive")
        .expect("keepalive item");
    assert_eq!(keepalive["status"], "overdue");

    let marked = router
        .clone()
        .oneshot(http("POST", &format!("/api/licenses/{id}/active"), Some(&token), None))
        .await
        .expect("mark active");
    assert_eq!(marked.status(), StatusCode::OK);

    let after = router
        .oneshot(http("GET", "/api/reminders/items", Some(&token), None))
        .await
        .expect("items after");
    let after_body = read_json(after).await;
    let still_overdue = after_body["data"]
        .as_array()
        .expect("array")
        .iter()
        .any(|item| item["kind"] == "keepalive" && item["status"] == "overdue");
    assert!(!still_overdue, "keep-alive should not be overdue after mark-active");
}

#[tokio::test]
async fn paywall_flow_blocks_at_cap_and_unlocks_after_activation() {
    let temp = tempdir().expect("temp dir");
    let conn = init_db_at(temp.path()).expect("db");
    let router = build_router(Arc::new(Mutex::new(conn)), Arc::new("test-secret".to_string()));

    // Register and grab the bearer token.
    let register = router
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/auth/register")
                .method("POST")
                .header("content-type", "application/json")
                .body(Body::from(
                    r#"{"email":"buyer@example.com","password":"password123"}"#,
                ))
                .expect("request"),
        )
        .await
        .expect("register response");
    assert_eq!(register.status(), StatusCode::CREATED);
    let token = read_json(register).await["data"]["token"]
        .as_str()
        .expect("token")
        .to_string();

    let add_license_req = |body: &str| {
        Request::builder()
            .uri("/api/licenses")
            .method("POST")
            .header("content-type", "application/json")
            .header("authorization", format!("Bearer {token}"))
            .body(Body::from(body.to_string()))
            .expect("request")
    };

    // First three adds succeed on the free plan.
    for i in 0..3 {
        let body = format!(r#"{{"product_name":"Deal {i}","license_key":"KEY-{i}"}}"#);
        let response = router.clone().oneshot(add_license_req(&body)).await.expect("add");
        assert_eq!(response.status(), StatusCode::CREATED, "add {i} should succeed");
    }

    // Fourth add is blocked with 402 Payment Required.
    let blocked = router
        .clone()
        .oneshot(add_license_req(r#"{"product_name":"Deal 4","license_key":"KEY-4"}"#))
        .await
        .expect("blocked add");
    assert_eq!(blocked.status(), StatusCode::PAYMENT_REQUIRED);

    // Entitlement reports free, cap reached.
    let ent = router
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/entitlement")
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty())
                .expect("request"),
        )
        .await
        .expect("entitlement");
    let ent_body = read_json(ent).await;
    assert_eq!(ent_body["data"]["pro"], false);
    assert_eq!(ent_body["data"]["remaining"], 0);

    // Activate with a minted key.
    let key = mint_pro_key("order-xyz").expect("mint key");
    let activate = router
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/activate")
                .method("POST")
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {token}"))
                .body(Body::from(format!(r#"{{"key":"{key}"}}"#)))
                .expect("request"),
        )
        .await
        .expect("activate");
    assert_eq!(activate.status(), StatusCode::OK);
    assert_eq!(read_json(activate).await["data"]["pro"], true);

    // The previously-blocked add now succeeds.
    let unblocked = router
        .clone()
        .oneshot(add_license_req(r#"{"product_name":"Deal 4","license_key":"KEY-4"}"#))
        .await
        .expect("unblocked add");
    assert_eq!(unblocked.status(), StatusCode::CREATED);
}

#[tokio::test]
async fn auth_me_route_requires_valid_bearer_token() {
    let temp = tempdir().expect("temp dir");
    let conn = init_db_at(temp.path()).expect("db");
    let user = create_user(&conn, "api@example.com", "password123").expect("user");
    let token = create_jwt("test-secret", &user).expect("token");

    let router = build_router(Arc::new(Mutex::new(conn)), Arc::new("test-secret".to_string()));

    let unauthorized = router
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/auth/me")
                .method("GET")
                .body(Body::empty())
                .expect("request"),
        )
        .await
        .expect("unauthorized response");
    assert_eq!(unauthorized.status(), StatusCode::UNAUTHORIZED);

    let authorized = router
        .oneshot(
            Request::builder()
                .uri("/api/auth/me")
                .method("GET")
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty())
                .expect("request"),
        )
        .await
        .expect("authorized response");
    assert_eq!(authorized.status(), StatusCode::OK);

    let body = to_bytes(authorized.into_body(), usize::MAX)
        .await
        .expect("read body");
    let body_text = String::from_utf8(body.to_vec()).expect("utf8 body");
    assert!(body_text.contains("api@example.com"));
}

#[tokio::test]
async fn vendor_policy_suggest_route_returns_appsumo_match() {
    let dir = tempdir().expect("tempdir");
    let conn = init_db_at(dir.path()).expect("db");
    let secret = Arc::new("test-secret".to_string());
    let router = build_router(Arc::new(Mutex::new(conn)), secret);

    let response = router
        .oneshot(
            Request::builder()
                .uri("/api/vendor-policies/suggest?source_site=AppSumo&product_name=Deal")
                .method("GET")
                .body(Body::empty())
                .expect("request"),
        )
        .await
        .expect("response");
    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("read body");
    let body_text = String::from_utf8(body.to_vec()).expect("utf8 body");
    assert!(body_text.contains("\"matched\":true"));
    assert!(body_text.contains("\"keepalive_days\":90"));
}

fn sample_recovery_settings() -> AccountRecoverySettings {
    AccountRecoverySettings {
        backup_email: None,
        smtp_host: Some("smtp.example.com".to_string()),
        smtp_port: Some(587),
        smtp_username: Some("me@example.com".to_string()),
        smtp_password: Some("app-password".to_string()),
        smtp_from: Some("me@example.com".to_string()),
        smtp_password_set: false,
    }
}

#[test]
fn password_reset_round_trip_requires_backup_email_and_smtp() {
    let temp = tempdir().expect("temp dir");
    let conn = init_db_at(temp.path()).expect("db");
    let user = create_user(&conn, "locked-out@example.com", "originalpass1").expect("user");

    // No backup email / SMTP configured yet — nothing to send, no code issued.
    assert!(prepare_password_reset(&conn, "locked-out@example.com")
        .expect("prepare")
        .is_none());

    let mut settings = sample_recovery_settings();
    settings.backup_email = Some("backup@example.com".to_string());
    update_account_recovery_settings(&conn, user.id, settings).expect("save recovery settings");

    let (_, to, code) = prepare_password_reset(&conn, "locked-out@example.com")
        .expect("prepare")
        .expect("reset issued once backup email + SMTP are configured");
    assert_eq!(to, "backup@example.com");
    assert_eq!(code.len(), crate::services::CODE_LENGTH);

    // Wrong code is rejected.
    assert!(confirm_password_reset(&conn, "locked-out@example.com", "00000000", "newpassword1").is_err());

    // Requesting a second code invalidates the first.
    let (_, _, second_code) = prepare_password_reset(&conn, "locked-out@example.com")
        .expect("prepare again")
        .expect("second reset issued");
    assert_ne!(code, second_code);
    assert!(confirm_password_reset(&conn, "locked-out@example.com", &code, "newpassword1").is_err());
    let code = second_code;

    // Correct code resets the password — case-insensitively and ignoring
    // dashes/spaces, since users type these from an email.
    let typed = format!("{}-{}", code[..4].to_lowercase(), &code[4..]);
    confirm_password_reset(&conn, "locked-out@example.com", &typed, "newpassword1").expect("reset");
    assert!(authenticate_user(&conn, "locked-out@example.com", "originalpass1")
        .expect("auth check")
        .is_none());
    assert!(authenticate_user(&conn, "locked-out@example.com", "newpassword1")
        .expect("auth check")
        .is_some());

    // The same code can't be replayed.
    assert!(confirm_password_reset(&conn, "locked-out@example.com", &code, "anotherpass1").is_err());
}

#[test]
fn unknown_email_yields_no_reset_and_never_errors() {
    let temp = tempdir().expect("temp dir");
    let conn = init_db_at(temp.path()).expect("db");
    assert!(prepare_password_reset(&conn, "nobody@example.com")
        .expect("prepare never errors, even for unknown accounts")
        .is_none());
}

#[test]
fn sharing_requires_pro_and_grants_access_to_owners_vault() {
    let temp = tempdir().expect("temp dir");
    let conn = init_db_at(temp.path()).expect("db");
    let owner = create_user(&conn, "owner@example.com", "ownerpass1").expect("owner");
    let member = create_user(&conn, "member@example.com", "memberpass1").expect("member");

    update_account_recovery_settings(&conn, owner.id, sample_recovery_settings())
        .expect("save owner SMTP settings");

    // Free tier can't invite.
    assert!(prepare_invite(&conn, owner.id, "member@example.com").is_err());

    activate_pro(&conn, owner.id, &mint_pro_key("test-suite").expect("mint key")).expect("activate");

    let (_, to, code) = prepare_invite(&conn, owner.id, "member@example.com").expect("invite");
    assert_eq!(to, "member@example.com");

    // Before redemption, the member's own (empty) vault is what resolves.
    assert_eq!(resolve_data_owner_id(&conn, member.id).expect("resolve"), member.id);

    // Wrong code doesn't redeem.
    assert!(redeem_invite(&conn, member.id, &member.email, "00000000").is_err());

    // Right code, wrong (redeeming) account doesn't redeem someone else's invite.
    let stranger = create_user(&conn, "stranger@example.com", "strangerpass1").expect("stranger");
    assert!(redeem_invite(&conn, stranger.id, &stranger.email, &code).is_err());

    redeem_invite(&conn, member.id, &member.email, &code).expect("redeem");

    // Now the member's requests resolve to the owner's vault.
    assert_eq!(resolve_data_owner_id(&conn, member.id).expect("resolve"), owner.id);

    let owner_license = add_license(&conn, owner.id, sample_license("Owner's Deal", None)).expect("add");
    let via_member = get_license_by_id(&conn, resolve_data_owner_id(&conn, member.id).unwrap(), owner_license.id)
        .expect("fetch via member")
        .expect("member can see the owner's license");
    assert_eq!(via_member.product_name, "Owner's Deal");
}

fn sample_webdav_request() -> EnableCloudBackupRequest {
    EnableCloudBackupRequest {
        webdav_url: "https://app.koofr.net/dav/Koofr".to_string(),
        webdav_username: "me@example.com".to_string(),
        webdav_password: "webdav-app-password".to_string(),
        remote_path: "/perpetua-backups".to_string(),
        rotate_key: false,
    }
}

#[test]
fn enable_cloud_backup_requires_pro() {
    let temp = tempdir().expect("temp dir");
    let conn = init_db_at(temp.path()).expect("db");
    let user = create_user(&conn, "cloud-free@example.com", "password123").expect("user");
    let mut settings = sample_recovery_settings();
    settings.backup_email = Some("backup@example.com".to_string());
    update_account_recovery_settings(&conn, user.id, settings).expect("save recovery settings");

    assert!(enable_cloud_backup(&conn, user.id, sample_webdav_request()).is_err());

    activate_pro(&conn, user.id, &mint_pro_key("test-suite").expect("mint key")).expect("activate");
    assert!(enable_cloud_backup(&conn, user.id, sample_webdav_request()).is_ok());
}

#[test]
fn enable_cloud_backup_requires_backup_email_and_smtp() {
    let temp = tempdir().expect("temp dir");
    let conn = init_db_at(temp.path()).expect("db");
    let user = create_user(&conn, "cloud-pro@example.com", "password123").expect("user");
    activate_pro(&conn, user.id, &mint_pro_key("test-suite").expect("mint key")).expect("activate");

    // No backup email / SMTP configured at all.
    let error = enable_cloud_backup(&conn, user.id, sample_webdav_request())
        .expect_err("should require backup email first");
    assert!(error.to_string().contains("backup email"), "unexpected error: {error}");

    // Backup email set, but no SMTP relay.
    let mut partial = sample_recovery_settings();
    partial.smtp_host = None;
    partial.backup_email = Some("backup@example.com".to_string());
    update_account_recovery_settings(&conn, user.id, partial).expect("save partial settings");
    let error = enable_cloud_backup(&conn, user.id, sample_webdav_request())
        .expect_err("should require SMTP relay next");
    assert!(error.to_string().contains("SMTP"), "unexpected error: {error}");

    // Both configured: succeeds and returns a usable recovery key.
    let mut full = sample_recovery_settings();
    full.backup_email = Some("backup@example.com".to_string());
    update_account_recovery_settings(&conn, user.id, full).expect("save full settings");
    let (_, to, recovery_key) = enable_cloud_backup(&conn, user.id, sample_webdav_request()).expect("enable");
    assert_eq!(to, "backup@example.com");
    let recovery_key = recovery_key.expect("first enable generates a key");
    assert!(!recovery_key.is_empty());

    // Re-saving settings (e.g. a new WebDAV password) must NOT silently mint
    // a new key — that would orphan every backup already uploaded.
    let (_, _, again) = enable_cloud_backup(&conn, user.id, sample_webdav_request()).expect("re-enable");
    assert!(again.is_none(), "key must be stable across settings updates");

    // Blank password on re-save keeps the stored one.
    let mut blank_password = sample_webdav_request();
    blank_password.webdav_password = String::new();
    enable_cloud_backup(&conn, user.id, blank_password).expect("blank password keeps stored credential");

    // Explicit rotation issues a fresh, different key.
    let mut rotate = sample_webdav_request();
    rotate.rotate_key = true;
    let (_, _, rotated) = enable_cloud_backup(&conn, user.id, rotate).expect("rotate");
    let rotated = rotated.expect("rotation returns the new key");
    assert_ne!(rotated, recovery_key);

    // Plain-http remote (non-loopback) is refused.
    let mut insecure = sample_webdav_request();
    insecure.webdav_url = "http://dav.example.com/".to_string();
    assert!(enable_cloud_backup(&conn, user.id, insecure).is_err());
}

#[tokio::test]
async fn restore_vault_from_bytes_swaps_live_connection() {
    // Build the "original" vault and take a raw backup of it.
    let source_dir = tempdir().expect("source dir");
    let source_conn = init_db_at(source_dir.path()).expect("source db");
    create_user(&source_conn, "original@example.com", "password123").expect("original user");
    let backup_dir = tempdir().expect("backup dir");
    let backup_entry = create_backup_in_dir(&source_conn, backup_dir.path()).expect("raw backup");
    let backup_bytes = std::fs::read(backup_dir.path().join(&backup_entry.file_name)).expect("read backup file");

    // A separate "fresh install" vault, wrapped the same way AppState wraps it.
    let target_dir = tempdir().expect("target dir");
    let target_conn = init_db_at(target_dir.path()).expect("target db");
    create_user(&target_conn, "fresh-install-only@example.com", "password123").expect("fresh-install user");
    let db = Arc::new(Mutex::new(target_conn));
    let target_path = db_path_at(target_dir.path()).expect("target db path");
    let snapshot_dir = backup_dir_at(target_dir.path()).expect("snapshot dir");

    let snapshot = restore_vault_from_bytes_at(&db, &backup_bytes, &target_path, &snapshot_dir)
        .await
        .expect("restore");

    // The vault that was overwritten had an account in it, so a pre-restore
    // snapshot must exist and must itself be a readable vault.
    let snapshot = snapshot.expect("pre-restore snapshot taken for a non-empty vault");
    assert!(snapshot.starts_with("perpetua-pre-restore-"));
    let snapshot_conn = rusqlite::Connection::open(snapshot_dir.join(&snapshot)).expect("open snapshot");
    assert!(
        authenticate_user(&snapshot_conn, "fresh-install-only@example.com", "password123")
            .expect("auth check")
            .is_some(),
        "snapshot should hold the pre-restore account"
    );

    // Every subsequent lock sees the restored data, not the pre-restore vault.
    let guard = db.lock().await;
    assert!(
        authenticate_user(&guard, "original@example.com", "password123")
            .expect("auth check")
            .is_some(),
        "restored vault should contain the original account"
    );
    assert!(
        authenticate_user(&guard, "fresh-install-only@example.com", "password123")
            .expect("auth check")
            .is_none(),
        "pre-restore account should no longer exist after restore"
    );
}

#[tokio::test]
async fn restore_route_is_reachable_without_auth_header_on_empty_vault() {
    let temp = tempdir().expect("temp dir");
    let conn = init_db_at(temp.path()).expect("db");
    let router = build_router(Arc::new(Mutex::new(conn)), Arc::new("test-secret".to_string()));

    // No Authorization header at all — a fresh install has no session to send
    // one with. This must fail on bad WebDAV/decrypt, not on missing auth;
    // a 401 here would mean someone accidentally gated restore behind login,
    // which would make it impossible to ever use.
    let response = router
        .oneshot(http(
            "POST",
            "/api/cloud-backup/restore",
            None,
            // Port 1 on loopback: fails fast with connection-refused instead
            // of risking a slow DNS timeout in a sandboxed test environment.
            Some(r#"{"webdav_url":"http://127.0.0.1:1","webdav_username":"u","webdav_password":"p","remote_path":"/x","recovery_key":"not-a-real-key"}"#),
        ))
        .await
        .expect("response");

    assert_ne!(response.status(), StatusCode::UNAUTHORIZED);
    assert_ne!(response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn restore_route_is_gated_once_an_account_exists() {
    let temp = tempdir().expect("temp dir");
    let conn = init_db_at(temp.path()).expect("db");
    let router = build_router(Arc::new(Mutex::new(conn)), Arc::new("test-secret".to_string()));
    let token = register_and_token(&router).await;
    const BODY: &str = r#"{"webdav_url":"http://127.0.0.1:1","webdav_username":"u","webdav_password":"p","remote_path":"/x","recovery_key":"not-a-real-key"}"#;
    const CONFIRMED: &str = r#"{"webdav_url":"http://127.0.0.1:1","webdav_username":"u","webdav_password":"p","remote_path":"/x","recovery_key":"not-a-real-key","confirm":true}"#;

    // Vault status tells the UI whether to offer the pre-login restore form.
    let status = router
        .clone()
        .oneshot(http("GET", "/api/vault/status", None, None))
        .await
        .expect("status");
    assert_eq!(read_json(status).await["data"]["has_users"], true);

    // With an account present, anonymous restore is refused outright.
    let anonymous = router
        .clone()
        .oneshot(http("POST", "/api/cloud-backup/restore", None, Some(CONFIRMED)))
        .await
        .expect("anonymous");
    assert_eq!(anonymous.status(), StatusCode::UNAUTHORIZED);

    // Logged in but without the explicit confirmation flag: refused.
    let unconfirmed = router
        .clone()
        .oneshot(http("POST", "/api/cloud-backup/restore", Some(&token), Some(BODY)))
        .await
        .expect("unconfirmed");
    assert_eq!(unconfirmed.status(), StatusCode::BAD_REQUEST);

    // Logged in and confirmed: proceeds to the WebDAV fetch (which fails on
    // the closed port — the point is that it got past the gate).
    let confirmed = router
        .oneshot(http("POST", "/api/cloud-backup/restore", Some(&token), Some(CONFIRMED)))
        .await
        .expect("confirmed");
    assert_eq!(confirmed.status(), StatusCode::BAD_GATEWAY);
}

#[tokio::test]
async fn non_loopback_host_header_is_refused() {
    let temp = tempdir().expect("temp dir");
    let conn = init_db_at(temp.path()).expect("db");
    let router = build_router(Arc::new(Mutex::new(conn)), Arc::new("test-secret".to_string()));

    let rebinding = Request::builder()
        .uri("/api/health")
        .method("GET")
        .header("host", "attacker.example:18765")
        .body(Body::empty())
        .expect("request");
    let response = router.clone().oneshot(rebinding).await.expect("response");
    assert_eq!(response.status(), StatusCode::MISDIRECTED_REQUEST);

    for host in ["127.0.0.1:18765", "localhost:18765", "[::1]:18765", "LOCALHOST"] {
        let request = Request::builder()
            .uri("/api/health")
            .method("GET")
            .header("host", host)
            .body(Body::empty())
            .expect("request");
        let response = router.clone().oneshot(request).await.expect("response");
        assert_ne!(response.status(), StatusCode::MISDIRECTED_REQUEST, "host {host} should be accepted");
    }
}

#[test]
fn login_is_case_insensitive_on_email() {
    let temp = tempdir().expect("temp dir");
    let conn = init_db_at(temp.path()).expect("db");
    create_user(&conn, "Mixed.Case@Example.com", "password123").expect("user");

    let user = authenticate_user(&conn, "mixed.case@example.com", "password123")
        .expect("auth")
        .expect("case-insensitive login");
    assert_eq!(user.email, "mixed.case@example.com");
    assert!(create_user(&conn, "MIXED.CASE@example.com", "password123").is_err(), "same mailbox, different case");
}

#[test]
fn license_payload_accepts_rfc3339_dates_and_bounds_keepalive() {
    let temp = tempdir().expect("temp dir");
    let conn = init_db_at(temp.path()).expect("db");
    let user = create_user(&conn, "dates@example.com", "password123").expect("user");

    // The browser extension historically sent `toISOString()` output.
    let mut payload = sample_license("ISO Dates", None);
    payload.purchase_date = Some("2026-03-04T15:22:11.123Z".to_string());
    payload.expiry_date = Some("2027-03-04T00:00:00Z".to_string());
    let created = add_license(&conn, user.id, payload).expect("add");
    assert_eq!(created.purchase_date.as_deref(), Some("2026-03-04"));
    assert_eq!(created.expiry_date.as_deref(), Some("2027-03-04"));

    let mut garbage = sample_license("Garbage Date", None);
    garbage.purchase_date = Some("yesterday".to_string());
    assert!(add_license(&conn, user.id, garbage).is_err());

    let mut too_long = sample_license("Too Long", None);
    too_long.keepalive_days = Some(crate::services::MAX_KEEPALIVE_DAYS + 1);
    assert!(add_license(&conn, user.id, too_long).is_err());

    let mut non_positive = sample_license("Zero", None);
    non_positive.keepalive_days = Some(0);
    let created = add_license(&conn, user.id, non_positive).expect("add zero keepalive");
    assert!(created.keepalive_days.is_none(), "non-positive keepalive is dropped, not stored");
}

#[test]
fn reminders_skip_inactive_licenses_and_honour_notification_preference() {
    let temp = tempdir().expect("temp dir");
    let conn = init_db_at(temp.path()).expect("db");
    let user = create_user(&conn, "quiet@example.com", "password123").expect("user");
    let soon = (crate::services::today_local() + chrono::Duration::days(3))
        .format("%Y-%m-%d")
        .to_string();

    let mut refunded = sample_license("Refunded Deal", Some(&soon));
    refunded.status = Some("refunded".to_string());
    add_license(&conn, user.id, refunded).expect("refunded");
    let mut live = sample_license("Live Deal", Some(&soon));
    live.status = Some("active".to_string());
    add_license(&conn, user.id, live).expect("live");

    let items = get_reminder_items(&conn, user.id).expect("items");
    assert_eq!(items.len(), 1, "refunded/cancelled licenses must not nag");
    assert_eq!(items[0].product_name, "Live Deal");

    // New accounts default to desktop reminders on.
    assert_eq!(collect_due_notifications(&conn).expect("first pass").len(), 1);

    // Turning the preference off silences the scheduler for this account.
    let other = create_user(&conn, "loud@example.com", "password123").expect("other user");
    add_license(&conn, other.id, sample_license("Other Live Deal", Some(&soon))).expect("other live");
    conn.execute("UPDATE users SET browser_notifications = 0 WHERE id = ?1", rusqlite::params![other.id])
        .expect("disable notifications");
    assert!(collect_due_notifications(&conn).expect("second pass").is_empty());
}

const RESTORE_BODY_NO_CONFIRM: &str = r#"{"webdav_url":"http://127.0.0.1:1","webdav_username":"u","webdav_password":"p","remote_path":"/x","recovery_key":"not-a-real-key"}"#;
const RESTORE_BODY_CONFIRM: &str = r#"{"webdav_url":"http://127.0.0.1:1","webdav_username":"u","webdav_password":"p","remote_path":"/x","recovery_key":"not-a-real-key","confirm":true}"#;

#[tokio::test]
async fn restore_route_requires_auth_when_users_exist() {
    let temp = tempdir().expect("temp dir");
    let conn = init_db_at(temp.path()).expect("db");
    create_user(&conn, "existing@example.com", "password123").expect("user");
    let router = build_router(Arc::new(Mutex::new(conn)), Arc::new("test-secret".to_string()));

    let response = router
        .oneshot(http("POST", "/api/cloud-backup/restore", None, Some(RESTORE_BODY_CONFIRM)))
        .await
        .expect("response");

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn restore_route_requires_confirm_when_users_exist() {
    let temp = tempdir().expect("temp dir");
    let conn = init_db_at(temp.path()).expect("db");
    let user = create_user(&conn, "existing@example.com", "password123").expect("user");
    let token = create_jwt("test-secret", &user).expect("token");
    let router = build_router(Arc::new(Mutex::new(conn)), Arc::new("test-secret".to_string()));

    let response = router
        .oneshot(http(
            "POST",
            "/api/cloud-backup/restore",
            Some(&token),
            Some(RESTORE_BODY_NO_CONFIRM),
        ))
        .await
        .expect("response");

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

fn host_request(host: &str) -> Request<Body> {
    Request::builder()
        .uri("/api/health")
        .method("GET")
        .header("host", host)
        .body(Body::empty())
        .expect("request")
}

#[tokio::test]
async fn host_guard_rejects_foreign_host_with_421() {
    let temp = tempdir().expect("temp dir");
    let conn = init_db_at(temp.path()).expect("db");
    let router = build_router(Arc::new(Mutex::new(conn)), Arc::new("test-secret".to_string()));

    for host in ["evil.example.com", "evil.example.com:18765", "127.0.0.1.evil.com:18765"] {
        let response = router.clone().oneshot(host_request(host)).await.expect("response");
        assert_eq!(response.status(), StatusCode::MISDIRECTED_REQUEST, "host {host}");
    }
}

#[tokio::test]
async fn host_guard_allows_loopback_hosts_and_missing_host() {
    let temp = tempdir().expect("temp dir");
    let conn = init_db_at(temp.path()).expect("db");
    let router = build_router(Arc::new(Mutex::new(conn)), Arc::new("test-secret".to_string()));

    for host in ["localhost:18765", "127.0.0.1:18765", "[::1]:18765", "LOCALHOST:18765"] {
        let response = router.clone().oneshot(host_request(host)).await.expect("response");
        assert_eq!(response.status(), StatusCode::OK, "host {host}");
    }

    // No Host header at all (plain oneshot) must still pass.
    let response = router
        .oneshot(http("GET", "/api/health", None, None))
        .await
        .expect("response");
    assert_eq!(response.status(), StatusCode::OK);
}

#[test]
fn webdav_scheme_check_requires_https_except_loopback() {
    use crate::cloud_backup::validate_server_url as check_webdav_scheme;
    assert!(check_webdav_scheme("http://example.com").is_err());
    assert!(check_webdav_scheme("http://127.0.0.1@evil.com/x").is_err());
    assert!(check_webdav_scheme("ftp://example.com").is_err());
    assert!(check_webdav_scheme("example.com/dav").is_err());
    assert!(check_webdav_scheme("http://127.0.0.1:1234").is_ok());
    assert!(check_webdav_scheme("http://localhost/dav").is_ok());
    assert!(check_webdav_scheme("http://[::1]:8080/dav").is_ok());
    assert!(check_webdav_scheme("https://x").is_ok());
}
