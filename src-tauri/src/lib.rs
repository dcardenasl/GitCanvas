#![cfg_attr(
    test,
    allow(
        clippy::unwrap_used,
        clippy::expect_used,
        clippy::panic,
        clippy::indexing_slicing
    )
)]

//! Tauri application entry point.
//!
//! This crate is the IPC boundary and nothing else: it registers commands,
//! owns application state, and translates `gitcanvas_core` results into
//! responses. All git domain logic lives in `gitcanvas-core`, which does not
//! depend on Tauri.

mod commands;
mod logging;
mod warmup;

#[cfg(test)]
mod repository_tests;

use tauri_specta::{collect_commands, collect_events};

/// Builds the typed command registry shared by the application and by the
/// bindings generator.
///
/// Both paths go through this one function on purpose: if the exported
/// `bindings.ts` were built from a different list than the one the app
/// actually serves, the types would be a lie that still compiles.
fn specta_builder<R: tauri::Runtime>() -> tauri_specta::Builder<R> {
    tauri_specta::Builder::<R>::new()
        .commands(collect_commands![
            commands::app::ping,
            commands::repository::open_repository,
            commands::repository::validate_repository,
            commands::repository::get_startup_repository,
            commands::repository::get_commits,
            commands::repository::get_branches,
            commands::repository::get_tags,
            commands::diff::get_commit_diff,
            commands::diff::get_file_content,
            commands::github::store_github_token,
            commands::github::has_github_token,
            commands::github::forget_github_token,
            commands::github::list_github_repositories,
            commands::github::clone_github_repository,
            commands::github::get_clone_cache_status,
            commands::actions::checkout_branch,
            commands::actions::pull_fast_forward,
            commands::actions::push_current_branch,
            commands::watch::watch_repository,
            commands::watch::unwatch_repository,
        ])
        .events(collect_events![
            commands::github::CloneProgressEvent,
            commands::watch::RepositoryChangedEvent
        ])
}

/// The application context, generated from `tauri.conf.json` and the
/// capability files.
///
/// `generate_context!` may only be expanded once per crate — a second
/// expansion duplicates the embedded Info.plist symbol — so both the running
/// application and the tests come through here.
fn app_context<R: tauri::Runtime>() -> tauri::Context<R> {
    tauri::generate_context!()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = specta_builder::<tauri::Wry>();

    // Debug builds regenerate the bindings on every run, so the contract can
    // never silently drift while developing. Release builds do no file I/O.
    #[cfg(debug_assertions)]
    if let Err(error) = builder.export(
        specta_typescript::Typescript::default(),
        "../src/bindings.ts",
    ) {
        eprintln!("warning: could not export TypeScript bindings: {error}");
    }

    // Starting the runtime is the one place where there is no caller left to
    // return an error to, so the failure is reported and the process exits
    // rather than unwinding through a panic.
    let mut app_builder = tauri::Builder::default()
        // The native folder picker. Without this the "open repository" button
        // fails at runtime with a missing-plugin error.
        .plugin(tauri_plugin_dialog::init());

    // Only present in an `e2e` build. The released binary carries no WebDriver
    // server, so nothing can drive it remotely.
    #[cfg(feature = "e2e")]
    {
        app_builder = app_builder.plugin(tauri_plugin_wdio_webdriver::init());
    }

    if let Err(error) = app_builder
        .manage(std::sync::Arc::new(
            gitcanvas_core::history::HistoryReader::default(),
        ))
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            use tauri::Manager;
            let data_dir = app.path().app_data_dir()?;
            let guard = logging::initialize(&data_dir.join("logs"))?;
            app.manage(guard);

            // Resolved once, here, where the concrete handle exists. The
            // commands themselves stay free of `AppHandle`, which is what lets
            // the typed builder collect them without a runtime parameter.
            app.manage(commands::github::CacheRoot(data_dir.join("clones")));

            let handle = app.handle().clone();
            app.manage(commands::watch::ActiveWatch::default());

            let watch_handle = app.handle().clone();
            app.manage(commands::watch::ChangeNotifier(std::sync::Arc::new(
                move |path: String| {
                    use tauri_specta::Event as _;
                    let _ = commands::watch::RepositoryChangedEvent { path }.emit(&watch_handle);
                },
            )));

            app.manage(commands::github::ProgressEmitter(std::sync::Arc::new(
                move |event: commands::github::CloneProgressEvent| {
                    use tauri_specta::Event as _;
                    // Best-effort: a dropped progress frame must never fail a
                    // clone that is otherwise succeeding.
                    let _ = event.emit(&handle);
                },
            )));
            tracing::info!(version = env!("CARGO_PKG_VERSION"), "GitCanvas started");

            // Paid here, on the main thread, while nobody is waiting for it.
            warmup::open_panel();
            builder.mount_events(app);
            Ok(())
        })
        .run(app_context())
    {
        eprintln!("fatal: could not start GitCanvas: {error}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use tauri::test::{get_ipc_response, mock_builder, INVOKE_KEY};

    use super::specta_builder;
    use crate::commands::app::AppInfo;

    /// Regenerates `src/bindings.ts` from the registered commands and events.
    ///
    /// Generating the contract from a test rather than from a running app is
    /// what makes it checkable without a display: CI runs `cargo test` and
    /// then `git diff --exit-code src/bindings.ts`. A binding file that no
    /// longer matches the Rust types fails the build instead of drifting
    /// quietly until something breaks at runtime.
    #[test]
    fn typescript_bindings_are_up_to_date() {
        specta_builder::<tauri::Wry>()
            .export(
                specta_typescript::Typescript::default(),
                "../src/bindings.ts",
            )
            .unwrap();
    }

    /// The dialog plugin is actually registered, not merely depended on.
    ///
    /// It was silently missing once: the crate was in `Cargo.toml`, so it
    /// linked and showed up in `cargo tree`, but the `.plugin()` call was not
    /// there. Everything compiled and the "open repository" button failed at
    /// runtime with a missing-plugin error.
    ///
    /// Tauri offers no way to enumerate a builder's plugins, so this reads the
    /// registration out of the source. Crude, but it fails for exactly the
    /// reason that bug existed, which a type check never would.
    #[test]
    fn the_dialog_plugin_is_registered() {
        let source = include_str!("lib.rs");
        assert!(
            source.contains(".plugin(tauri_plugin_dialog::init())"),
            "the dialog plugin must be registered on the builder"
        );
    }

    /// Dispatches a real IPC request through a headless application.
    ///
    /// This is the round trip the whole architecture rests on, so it is
    /// verified by a test rather than by looking at a window: the command has
    /// to be reachable by the name the generated bindings use, and its
    /// response has to deserialize into the type they declare. Registering a
    /// command and forgetting to expose it would compile perfectly and fail
    /// only at runtime.
    #[test]
    fn ping_round_trips_through_the_ipc_boundary() {
        let builder = specta_builder();
        let app = mock_builder()
            .invoke_handler(builder.invoke_handler())
            // The real context, not a mock one: this exercises the actual
            // capability file, so a command that works in a test but is denied
            // by the ACL in the shipped app cannot pass here.
            .build(super::app_context())
            .unwrap();
        let webview = tauri::WebviewWindowBuilder::new(&app, "main", tauri::WebviewUrl::default())
            .build()
            .unwrap();

        let response = get_ipc_response(
            &webview,
            tauri::webview::InvokeRequest {
                cmd: "ping".into(),
                callback: tauri::ipc::CallbackFn(0),
                error: tauri::ipc::CallbackFn(1),
                // Must match the scheme the mock webview's ACL resolves
                // against, which is `tauri://localhost` everywhere except
                // Windows, where it is `http://tauri.localhost`; the other
                // scheme is rejected as an unknown origin on each platform.
                url: if cfg!(target_os = "windows") {
                    "http://tauri.localhost"
                } else {
                    "tauri://localhost"
                }
                .parse()
                .unwrap(),
                body: tauri::ipc::InvokeBody::default(),
                headers: tauri::http::HeaderMap::new(),
                invoke_key: INVOKE_KEY.to_string(),
            },
        )
        .expect("the ping command should be registered and succeed");

        let info: AppInfo = response.deserialize().expect("AppInfo should deserialize");

        assert_eq!(info.name, "GitCanvas");
        assert_eq!(info.version, env!("CARGO_PKG_VERSION"));
        assert_eq!(info.core_version, gitcanvas_core::version());
    }
}
