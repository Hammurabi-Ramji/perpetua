#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

use crate::database::{init_db, load_or_create_jwt_secret};

#[derive(Clone)]
struct AppState {
    db: Arc<Mutex<rusqlite::Connection>>,
    jwt_secret: Arc<String>,
}

mod api;
mod database;
mod mail;
mod models;
mod polar;
mod services;
mod vendor_policy;
#[cfg(test)]
mod tests;

fn main() {
    // Fulfillment helper: `perpetua mint-key <order-or-email>` prints a Pro license
    // key for a buyer, then exits. Run this after a sale to hand over their unlock.
    let args: Vec<String> = std::env::args().collect();
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
            api::start_server(Arc::new(Mutex::new(db)), Arc::new(jwt_secret)).await;
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

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .setup(|app| {
            let db = init_db().expect("Failed to initialize database");
            let jwt_secret = load_or_create_jwt_secret().expect("Failed to initialize Perpetua secret");
            let state = AppState {
                db: Arc::new(Mutex::new(db)),
                jwt_secret: Arc::new(jwt_secret),
            };
            app.manage(state);

            let app_state = app.state::<AppState>().inner().clone();
            tauri::async_runtime::spawn(async move {
                api::start_server(app_state.db.clone(), app_state.jwt_secret.clone()).await;
            });

            // Launch at login so the background maintainer keeps watch even when
            // the user isn't actively using the app. Best-effort; ignore errors.
            {
                use tauri_plugin_autostart::ManagerExt;
                let _ = app.autolaunch().enable();
            }

            // System tray so the app can keep running in the background after the
            // window is closed.
            build_tray(app.handle())?;

            // Background maintainer: periodically check for due redemption
            // deadlines and deliver native OS notifications.
            spawn_reminder_scheduler(app.handle().clone());

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
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
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

fn spawn_reminder_scheduler(handle: tauri::AppHandle) {
    use std::time::Duration;
    use tauri_plugin_notification::NotificationExt;

    // First check shortly after launch, then every 6 hours.
    const INITIAL_DELAY: Duration = Duration::from_secs(15);
    const INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);

    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(INITIAL_DELAY).await;
        loop {
            let notices = {
                let state = handle.state::<AppState>();
                let conn = state.db.lock().await;
                services::collect_due_notifications(&conn).unwrap_or_default()
            };

            for notice in notices {
                let _ = handle
                    .notification()
                    .builder()
                    .title(&notice.title)
                    .body(&notice.body)
                    .show();
            }

            tokio::time::sleep(INTERVAL).await;
        }
    });
}
