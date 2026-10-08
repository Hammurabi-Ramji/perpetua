#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::sync::Arc;
use tauri::{Emitter, Manager};
use tokio::sync::Mutex;

use crate::database::{init_db, load_or_create_jwt_secret};

#[derive(Clone)]
struct AppState {
    db: Arc<Mutex<rusqlite::Connection>>,
    jwt_secret: Arc<String>,
}

mod activity;
mod api;
mod auto_maintain;
mod cloud_backup;
mod database;
mod diag;
mod mail;
mod models;
mod updater;
mod polar;
mod secret_store;
mod services;
mod vendor_policy;
#[cfg(test)]
mod tests;

fn main() {
    // Fulfillment helper: `perpetua mint-key <order-or-email>` prints a Pro license
    // key for a buyer, then exits. Run this after a sale to hand over their unlock.
    //
    // Only compiled into debug builds (dev/test convenience) or a release build
    // built with `--features fulfillment`. The customer-facing release binary
    // (build-release.ps1) never enables that feature, so a buyer can't mint
    // their own key from the shipped executable.
    let args: Vec<String> = std::env::args().collect();
    #[cfg(any(debug_assertions, feature = "fulfillment"))]
    if args.get(1).map(String::as_str) == Some("mint-key") {
        let buyer_ref = args.get(2).map(String::as_str).unwrap_or("unknown");
        match services::mint_pro_key(buyer_ref) {
            Ok(key) => println!("{key}"),
            Err(error) => {
                eprintln!("Failed to mint key: {error}");
                std::process::exit(1);
            }
        }
        return;
    }

    // Headless API server: `perpetua serve [data-dir]` runs just the Axum backend
    // (no desktop window) for testing/QA. An optional data dir keeps it off the
    // real vault. Honors PERPETUA_DATA_DIR too.
    if args.get(1).map(String::as_str) == Some("serve") {
        let base_dir = args
            .get(2)
            .cloned()
            .or_else(|| std::env::var("PERPETUA_DATA_DIR").ok());
        let runtime = tokio::runtime::Runtime::new().expect("tokio runtime");
        runtime.block_on(async move {
            let db = match &base_dir {
                Some(dir) => database::init_db_at(std::path::Path::new(dir)),
                None => init_db(),
            }
            .expect("Failed to initialize database");
            let jwt_secret = match &base_dir {
                Some(dir) => database::load_or_create_jwt_secret_at(std::path::Path::new(dir)),
                None => load_or_create_jwt_secret(),
            }
            .expect("Failed to initialize Perpetua secret");
            if let Err(error) = api::start_server(Arc::new(Mutex::new(db)), Arc::new(jwt_secret)).await {
                eprintln!("{error}");
                std::process::exit(1);
            }
        });
        return;
    }

    // Headless reminder check: `perpetua check-reminders [data-dir]` runs the
    // background maintainer's due-detection once and prints what it would notify
    // (and marks them notified). Lets the maintainer be verified without a GUI.
    if args.get(1).map(String::as_str) == Some("check-reminders") {
        let base_dir = args
            .get(2)
            .cloned()
            .or_else(|| std::env::var("PERPETUA_DATA_DIR").ok());
        let conn = match &base_dir {
            Some(dir) => database::init_db_at(std::path::Path::new(dir)),
            None => init_db(),
        }
        .expect("Failed to initialize database");
        match services::collect_due_notifications(&conn) {
            Ok(notices) => {
                println!("{} due notification(s):", notices.len());
                for n in notices {
                    println!("  [{}] {} — {}", n.kind, n.title, n.body);
                }
            }
            Err(error) => {
                eprintln!("check-reminders failed: {error}");
                std::process::exit(1);
            }
        }
        return;
    }

    // Diagnostic: `perpetua config` prints whether Polar activation is wired in.
    if args.get(1).map(String::as_str) == Some("config") {
        let org = polar::POLAR_ORGANIZATION_ID;
        if polar::is_configured() {
            println!("Polar activation: ENABLED (organization_id={org})");
        } else {
            println!("Polar activation: DISABLED (offline self-issued keys; set POLAR_ORGANIZATION_ID at build time)");
        }
        return;
    }

    // `--minimized` is what the launch-at-login entry passes: start the
    // background maintainer and tray without popping the window.
    let start_minimized = args.iter().any(|arg| arg == "--minimized");

    let result = tauri::Builder::default()
        // Must be the first plugin so a second launch is short-circuited
        // before anything else (database, API port) is touched. The second
        // process hands its args to us and exits; we just surface the window.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .setup(move |app| {
            if let Err(error) = setup_app(app, start_minimized) {
                diag::log(&format!("startup failed: {error:#}"));
                report_fatal_and_exit(app.handle(), &error);
            }
            Ok(())
        })
        // Closing the window hides to tray instead of quitting, so the
        // background maintainer keeps running.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .on_menu_event(|app, event| handle_menu_event(app, event.id().as_ref()))
        .invoke_handler(tauri::generate_handler![
            get_launch_at_login,
            set_launch_at_login,
            get_diagnostics_log_path
        ])
        .run(tauri::generate_context!());

    if let Err(error) = result {
        diag::log(&format!("tauri runtime error: {error}"));
        eprintln!("error while running tauri application: {error}");
        std::process::exit(1);
    }
}

/// Everything that can fail during startup lives here so a single place can
/// turn the error into something a user actually sees (dialog + log line)
/// instead of a release-build process that silently disappears.
fn setup_app(app: &mut tauri::App, start_minimized: bool) -> anyhow::Result<()> {
    use anyhow::Context;

    let db = init_db().context("initialising the local vault database")?;
    let jwt_secret = load_or_create_jwt_secret().context("initialising the session secret")?;
    let state = AppState {
        db: Arc::new(Mutex::new(db)),
        jwt_secret: Arc::new(jwt_secret),
    };
    app.manage(state);

    let app_state = app.state::<AppState>().inner().clone();
    let server_handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = api::start_server(app_state.db.clone(), app_state.jwt_secret.clone()).await {
            diag::log(&format!("local API server stopped: {error:#}"));
            report_fatal_and_exit(&server_handle, &error);
        }
    });

    // System tray so the app can keep running in the background after the
    // window is closed.
    build_tray(app.handle()).context("creating the tray icon")?;

    // Native File/View/Help menu bar.
    build_app_menu(app.handle()).context("creating the menu bar")?;

    // Background maintainer: periodically check for due redemption
    // deadlines and deliver native OS notifications.
    spawn_reminder_scheduler(app.handle().clone());

    // The window is created hidden (tauri.conf.json) so a login-time launch
    // can stay in the tray; a normal launch shows it now.
    if !start_minimized {
        show_main_window(app.handle());
    }
    diag::log(&format!(
        "started v{} (minimized={start_minimized})",
        env!("CARGO_PKG_VERSION")
    ));
    Ok(())
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Blocking native dialog, then exit. Used for errors there is no recovering
/// from in-process (vault won't open, API port taken). The dialog text names
/// the log file so a support request can include it.
fn report_fatal_and_exit(app: &tauri::AppHandle, error: &anyhow::Error) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

    let log_path = diag::log_path().display().to_string();
    app.dialog()
        .message(format!(
            "Perpetua could not start.\n\n{error:#}\n\nIf another copy of Perpetua is already running, open it from the tray instead. Otherwise, see the troubleshooting guide and attach this log when contacting support:\n{log_path}"
        ))
        .title("Perpetua — startup error")
        .kind(MessageDialogKind::Error)
        .blocking_show();
    app.exit(1);
}

/// Whether Perpetua is registered to launch at login. Opt-in: nothing turns
/// this on except the user flipping the toggle on the Reminders page.
#[tauri::command]
fn get_launch_at_login(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().map_err(|error| error.to_string())
}

#[tauri::command]
fn set_launch_at_login(app: tauri::AppHandle, enabled: bool) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    let manager = app.autolaunch();
    let outcome = if enabled { manager.enable() } else { manager.disable() };
    outcome.map_err(|error| error.to_string())?;
    diag::log(&format!("launch at login set to {enabled}"));
    manager.is_enabled().map_err(|error| error.to_string())
}

#[tauri::command]
fn get_diagnostics_log_path() -> String {
    diag::log_path().display().to_string()
}

fn build_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::TrayIconBuilder;

    let open = MenuItem::with_id(app, "open", "Open Perpetua", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;

    let mut builder = TrayIconBuilder::new()
        .tooltip("Perpetua — license vault")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app)?;
    Ok(())
}

/// The standard File/View/Help menu bar most desktop apps have at the top
/// left. Items that need app/session context (navigation, sign-out, add
/// license) can't act directly from Rust, so they emit a `perpetua://menu`
/// event the frontend listens for (see `src/routes/+layout.svelte`).
/// Help/Exit items are handled here directly since they need no frontend
/// context at all.
fn build_app_menu(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};

    let add_license = MenuItem::with_id(app, "menu-add-license", "Add License…", true, Some("CmdOrCtrl+N"))?;
    let export_vault = MenuItem::with_id(app, "menu-export-vault", "Export Vault…", true, None::<&str>)?;
    let create_backup = MenuItem::with_id(app, "menu-create-backup", "Create Backup", true, None::<&str>)?;
    let sign_out = MenuItem::with_id(app, "menu-sign-out", "Sign Out", true, None::<&str>)?;
    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &add_license,
            &export_vault,
            &create_backup,
            &PredefinedMenuItem::separator(app)?,
            &sign_out,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, Some("Exit"))?,
        ],
    )?;

    let nav_dashboard = MenuItem::with_id(app, "menu-nav-dashboard", "Dashboard", true, Some("CmdOrCtrl+1"))?;
    let nav_licenses = MenuItem::with_id(app, "menu-nav-licenses", "Licenses", true, Some("CmdOrCtrl+2"))?;
    let nav_sites = MenuItem::with_id(app, "menu-nav-sites", "Sites", true, Some("CmdOrCtrl+3"))?;
    let nav_reminders = MenuItem::with_id(app, "menu-nav-reminders", "Reminders", true, Some("CmdOrCtrl+4"))?;
    let nav_vault = MenuItem::with_id(app, "menu-nav-vault", "Vault Tools", true, Some("CmdOrCtrl+5"))?;
    let view_menu = Submenu::with_items(
        app,
        "View",
        true,
        &[&nav_dashboard, &nav_licenses, &nav_sites, &nav_reminders, &nav_vault],
    )?;

    let check_updates = MenuItem::with_id(app, "menu-check-updates", "Check for Updates…", true, None::<&str>)?;
    let user_guide = MenuItem::with_id(app, "menu-help-guide", "User Guide", true, None::<&str>)?;
    let troubleshooting = MenuItem::with_id(app, "menu-help-troubleshooting", "Troubleshooting", true, None::<&str>)?;
    let about = MenuItem::with_id(app, "menu-help-about", "About Perpetua", true, None::<&str>)?;
    let help_menu = Submenu::with_items(
        app,
        "Help",
        true,
        &[&check_updates, &user_guide, &troubleshooting, &about],
    )?;

    let menu = Menu::with_items(app, &[&file_menu, &view_menu, &help_menu])?;
    app.set_menu(menu)?;
    Ok(())
}

const USER_GUIDE_URL: &str =
    "https://github.com/Hammurabi-Ramji/perpetua/blob/main/desktop/docs/USER_GUIDE.md";
const TROUBLESHOOTING_URL: &str =
    "https://github.com/Hammurabi-Ramji/perpetua/blob/main/desktop/docs/TROUBLESHOOTING.md";

fn handle_menu_event(app: &tauri::AppHandle, id: &str) {
    use tauri_plugin_dialog::DialogExt;
    use tauri_plugin_shell::ShellExt;

    match id {
        "menu-check-updates" => {
            let message = updater::check_for_updates_message(updater::configured_pubkey_from_manifest());
            app.dialog()
                .message(message)
                .title("Perpetua — updates")
                .show(|_| {});
        }
        "menu-help-guide" => {
            let _ = app.shell().open(USER_GUIDE_URL, None);
        }
        "menu-help-troubleshooting" => {
            let _ = app.shell().open(TROUBLESHOOTING_URL, None);
        }
        "menu-help-about" => {
            app.dialog()
                .message(
                    "Local-first desktop vault for lifetime software licenses.\n\
                     Track renewals, get keep-alive reminders before a vendor revokes \
                     a deal for inactivity, and export or back up your vault anytime.",
                )
                .title(format!("Perpetua — v{}", env!("CARGO_PKG_VERSION")))
                .show(|_| {});
        }
        // Everything else needs session/route context Rust doesn't have —
        // the frontend's own listener decides what to do with it.
        _ => {
            let _ = app.emit("perpetua://menu", id);
        }
    }
}

fn spawn_reminder_scheduler(handle: tauri::AppHandle) {
    use std::time::Duration;
    use tauri_plugin_notification::NotificationExt;

    // First check shortly after launch, then every 6 hours.
    const INITIAL_DELAY: Duration = Duration::from_secs(15);
    const INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);

    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(INITIAL_DELAY).await;
        loop {
            let state = handle.state::<AppState>();
            let notices = {
                let conn = state.db.lock().await;
                match services::pending_notifications(&conn) {
                    Ok(notices) => notices,
                    Err(error) => {
                        diag::log(&format!("reminder check failed: {error:#}"));
                        Vec::new()
                    }
                }
            };

            // A notice is only recorded as delivered once the OS accepted it;
            // if the notification call fails (permission revoked, DBus down)
            // it is retried on the next pass instead of being lost for good.
            for notice in notices {
                let shown = handle
                    .notification()
                    .builder()
                    .title(&notice.title)
                    .body(&notice.body)
                    .show();
                match shown {
                    Ok(()) => {
                        let conn = state.db.lock().await;
                        if let Err(error) = services::mark_notice_delivered(&conn, &notice) {
                            diag::log(&format!("could not record reminder delivery: {error:#}"));
                        }
                    }
                    Err(error) => diag::log(&format!("notification not shown ({}): {error}", notice.kind)),
                }
            }

            // Email reminders use the same SMTP relay as password reset. If the
            // relay is not configured, pending_email_reminders logs that and
            // returns nothing — it does not mark mail as sent.
            let outbound = {
                let conn = state.db.lock().await;
                match services::pending_email_reminders(&conn) {
                    Ok(items) => items,
                    Err(error) => {
                        diag::log(&format!("email reminder check failed: {error:#}"));
                        Vec::new()
                    }
                }
            };
            for item in outbound {
                match mail::send_email(&item.settings, &item.to, &item.notice.title, &item.notice.body).await {
                    Ok(()) => {
                        let conn = state.db.lock().await;
                        if let Err(error) = services::mark_email_reminder_sent(&conn, item.notice.license_id, &item.notice.kind)
                        {
                            diag::log(&format!("could not record email reminder delivery: {error:#}"));
                        }
                    }
                    Err(error) => {
                        diag::log(&format!("email reminder not sent ({}): {error:#}", item.notice.kind));
                    }
                }
            }

            // Scheduled cloud backup is an opt-in upload of the same single
            // WebDAV object. It is not live multi-device sync. A failed upload
            // is logged and leaves last_synced_at (and the previous remote
            // object) alone.
            {
                let conn = state.db.lock().await;
                if let Err(error) = auto_maintain::run_auto_maintain_pass(&conn) {
                    diag::log(&format!("auto-maintain pass failed: {error:#}"));
                }
            }

            let due_users = {
                let conn = state.db.lock().await;
                match services::users_due_for_scheduled_sync(&conn, chrono::Utc::now()) {
                    Ok(users) => users,
                    Err(error) => {
                        diag::log(&format!("scheduled cloud backup check failed: {error:#}"));
                        Vec::new()
                    }
                }
            };
            for user_id in due_users {
                let prepared = {
                    let conn = state.db.lock().await;
                    services::prepare_cloud_sync(&conn, user_id)
                };
                let upload_result = match prepared {
                    Ok(context) => match std::fs::read(&context.backup_path) {
                        Ok(bytes) => {
                            let target = cloud_backup::WebDavTarget {
                                base_url: &context.webdav_url,
                                username: &context.webdav_username,
                                password: &context.webdav_password,
                                remote_path: &context.remote_path,
                            };
                            cloud_backup::upload(&target, &context.recovery_key, &bytes).await
                        }
                        Err(error) => Err(anyhow::anyhow!("failed to read local backup: {error}")),
                    },
                    Err(error) => Err(error),
                };
                let conn = state.db.lock().await;
                let message = upload_result.as_ref().err().map(|error| error.to_string());
                if let Err(error) = services::record_cloud_sync_result(&conn, user_id, message.as_deref()) {
                    diag::log(&format!("could not record scheduled cloud backup: {error:#}"));
                }
            }

            tokio::time::sleep(INTERVAL).await;
        }
    });
}
