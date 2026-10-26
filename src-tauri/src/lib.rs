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
mod data_dir;
mod lifecycle;
mod logging;
// The menu bar is installed on macOS only, but what it contains is built and
// checked on every platform, so elsewhere that code is exercised by tests alone.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
mod menu;
mod resources;
mod warmup;

#[cfg(test)]
mod repository_tests;

#[cfg(test)]
mod command_invariant_tests;

use tauri_specta::{collect_commands, collect_events};

#[cfg(any(debug_assertions, test))]
fn normalize_generated_bindings(path: &std::path::Path) -> std::io::Result<()> {
    let source = std::fs::read_to_string(path)?;
    let normalized = source
        .lines()
        .map(str::trim_end)
        .collect::<Vec<_>>()
        .join("\n")
        .trim_end()
        .to_owned();
    std::fs::write(path, format!("{normalized}\n"))
}

/// Builds the typed command registry shared by the application and by the
/// bindings generator.
///
/// Both paths go through this one function on purpose: if the exported
/// `bindings.ts` were built from a different list than the one the app
/// actually serves, the types would be a lie that still compiles.
fn specta_builder<R: tauri::Runtime>() -> tauri_specta::Builder<R> {
    tauri_specta::Builder::<R>::new()
        .commands(collect_commands![
            commands::repository::open_repository,
            commands::open_repos::sync_open_repositories,
            commands::repository::get_startup_repository,
            commands::lifecycle::restart_application,
            commands::lifecycle::acknowledge_shutdown,
            commands::repository::get_commits,
            commands::repository::get_commit,
            commands::repository::get_repository_refs,
            commands::repository::get_repository_worktrees,
            commands::diff::get_commit_diff,
            commands::diff::get_file_content,
            commands::diff::get_commit_tree_page,
            commands::diff::get_worktree_snapshot,
            commands::diff::get_worktree_file_diff,
            commands::diff::get_worktree_file_content,
            commands::diff::get_worktree_fingerprint,
            commands::github::store_github_token,
            commands::github::has_github_token,
            commands::github::forget_github_token,
            commands::github::list_github_repositories,
            commands::github::clone_github_repository,
            commands::actions::checkout_branch,
            commands::actions::pull_fast_forward,
            commands::actions::push_current_branch,
            commands::watch::watch_repository,
            commands::menu::set_menu_labels,
            commands::watch::unwatch_repository,
            commands::workspace::get_workspace_limits,
            commands::workspace::load_workspace,
            commands::workspace::save_workspace,
        ])
        .events(collect_events![
            commands::github::CloneProgressEvent,
            commands::menu::MenuActionEvent,
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
    let context = tauri::generate_context!();
    #[cfg(feature = "e2e")]
    let context = {
        let mut context: tauri::Context<R> = context;
        // The Rust data override does not isolate the system webview's own
        // localStorage. E2E windows must never read or change user preferences.
        for window in &mut context.config_mut().app.windows {
            window.incognito = true;
        }
        context
    };
    context
}

/// Replaces the menu bar with one in the given language, on the main thread
/// where the system requires menus to be built.
#[cfg(target_os = "macos")]
fn install_menu(
    handle: &tauri::AppHandle,
    labels: &commands::menu::MenuLabels,
) -> Result<(), gitcanvas_core::error::AppError> {
    use gitcanvas_core::error::AppError;
    let internal = |error: &dyn std::fmt::Display| AppError::Internal(error.to_string());

    let (sender, receiver) = std::sync::mpsc::channel();
    let (main_handle, labels) = (handle.clone(), labels.clone());
    handle
        .run_on_main_thread(move || {
            let name = main_handle.package_info().name.clone();
            let installed = menu::to_native(&main_handle, &menu::full_spec(&name, &labels))
                .and_then(|menu| main_handle.set_menu(menu).map(|_previous| ()));
            // The caller may have given up waiting; nothing is left to tell.
            let _ = sender.send(installed);
        })
        .map_err(|error| internal(&error))?;
    receiver
        .recv_timeout(std::time::Duration::from_secs(5))
        .map_err(|error| internal(&error))?
        .map_err(|error| internal(&error))
}

/// Writes a startup diagnostic before the file logger has been initialized.
// Early boot failures must remain visible when no tracing subscriber exists yet.
#[allow(clippy::print_stderr)]
fn report_early_startup_error(message: &str) {
    eprintln!("{message}");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// Starts the desktop application and exits if its native runtime cannot start.
pub fn run() {
    if let Err(error) = resources::raise_file_descriptor_limit() {
        report_early_startup_error(&format!(
            "warning: could not raise the file descriptor limit: {error}"
        ));
    }
    let builder = specta_builder::<tauri::Wry>();

    // Debug builds regenerate the bindings on every run, so the contract can
    // never silently drift while developing. Release builds do no file I/O.
    #[cfg(debug_assertions)]
    if let Err(error) = builder.export(
        specta_typescript::Typescript::default(),
        "../src/bindings.ts",
    ) {
        report_early_startup_error(&format!(
            "warning: could not export TypeScript bindings: {error}"
        ));
    } else if let Err(error) =
        normalize_generated_bindings(std::path::Path::new("../src/bindings.ts"))
    {
        report_early_startup_error(&format!(
            "warning: could not normalize TypeScript bindings: {error}"
        ));
    }

    // Starting the runtime is the one place where there is no caller left to
    // return an error to, so the failure is reported and the process exits
    // rather than unwinding through a panic.
    #[cfg_attr(not(feature = "e2e"), allow(unused_mut))]
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
        .manage(commands::repo_access::AllowedRepos::default())
        .manage(commands::open_repos::OpenRepos::default())
        .manage(std::sync::Arc::new(lifecycle::ShutdownGate::default()))
        .on_window_event(lifecycle::on_window_event)
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            use tauri::Manager;
            let data_dir = data_dir::resolve(
                std::env::var_os(data_dir::DATA_DIR_ENV),
                app.path().app_data_dir()?,
            )?;
            let guard = logging::initialize(&data_dir.join("logs"))?;
            app.manage(guard);

            // Resolved once, here, where the concrete handle exists. The
            // commands themselves stay free of `AppHandle`, which is what lets
            // the typed builder collect them without a runtime parameter.
            app.manage(commands::github::CacheRoot(data_dir.join("clones")));
            app.manage(std::sync::Arc::new(
                gitcanvas_core::workspace::store::WorkspaceStore::new(data_dir),
            ));

            let restart_handle = app.handle().clone();
            app.manage(commands::lifecycle::RestartApplication(
                std::sync::Arc::new(move || restart_handle.restart()),
            ));
            let handle = app.handle().clone();
            app.manage(commands::watch::ActiveWatch::default());

            let watch_handle = app.handle().clone();
            app.manage(commands::watch::ChangeNotifier(std::sync::Arc::new(
                move |event: commands::watch::RepositoryChangedEvent| {
                    use tauri_specta::Event as _;
                    let _ = event.emit(&watch_handle);
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

            // The menu bar exists only on macOS. Elsewhere the applier accepts
            // the labels and does nothing, so the interface asks the same way
            // on every platform.
            #[cfg(target_os = "macos")]
            {
                use tauri_specta::Event as _;
                let name = app.package_info().name.clone();
                app.set_menu(menu::to_native(app, &menu::initial_spec(&name))?)?;
                let applier_handle = app.handle().clone();
                app.manage(commands::menu::MenuApplier(std::sync::Arc::new(
                    move |labels| install_menu(&applier_handle, &labels),
                )));
                app.on_menu_event(|app, event| {
                    if let Some(action) = menu::action_for(event.id().as_ref()) {
                        let _ = commands::menu::MenuActionEvent { action }.emit(app);
                    }
                });
            }
            #[cfg(not(target_os = "macos"))]
            app.manage(commands::menu::MenuApplier(std::sync::Arc::new(|_| Ok(()))));

            tracing::info!(version = env!("CARGO_PKG_VERSION"), "GitCanvas started");

            // Paid here, on the main thread, while nobody is waiting for it.
            warmup::open_panel();
            builder.mount_events(app);
            Ok(())
        })
        .build(app_context())
        .map(|app| {
            app.run(lifecycle::on_run_event);
        })
    {
        report_early_startup_error(&format!("fatal: could not start GitCanvas: {error}"));
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::specta_builder;

    #[cfg(feature = "e2e")]
    #[test]
    fn e2e_windows_never_share_user_webview_storage() {
        let context = super::app_context::<tauri::test::MockRuntime>();
        assert!(!context.config().app.windows.is_empty());
        assert!(context
            .config()
            .app
            .windows
            .iter()
            .all(|window| window.incognito));
    }

    /// Keep the shipped window on the smallest permission set the app uses.
    ///
    /// Tauri permissions are additive, so restoring `core:default` here would
    /// silently broaden the webview's authority even if every command still
    /// behaved correctly. Parsing the capability makes this an explicit,
    /// reviewable allowlist rather than a substring check.
    #[test]
    fn default_capability_contains_only_required_permissions() {
        let capability: serde_json::Value =
            serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
        let permissions = capability["permissions"]
            .as_array()
            .expect("the default capability must declare permissions")
            .iter()
            .map(|permission| {
                permission
                    .as_str()
                    .expect("capability permissions must be strings")
            })
            .collect::<std::collections::BTreeSet<_>>();
        let expected = [
            "core:event:default",
            "dialog:allow-open",
            "core:window:allow-destroy",
        ]
        .into_iter()
        .collect::<std::collections::BTreeSet<_>>();

        assert_eq!(permissions, expected);
    }

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
        super::normalize_generated_bindings(std::path::Path::new("../src/bindings.ts")).unwrap();
    }

    /// The shipped window has a content security policy, and a strict one.
    ///
    /// It was `null` once, which leaves a window that holds a GitHub token and
    /// renders repository text with nothing limiting what it may load or run.
    /// The development policy may be looser for the dev server, so only the
    /// production one is held to this.
    #[test]
    fn the_production_csp_is_restrictive() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let csp = config["app"]["security"]["csp"]
            .as_str()
            .expect("the production CSP must be set");
        let directive = |name: &str| {
            csp.split(';')
                .map(str::trim)
                .find_map(|part| part.strip_prefix(name).map(str::trim))
                .unwrap_or_default()
                .to_owned()
        };
        assert!(csp.contains("default-src 'self'"));
        for name in ["script-src ", "style-src ", "default-src "] {
            let value = directive(name);
            assert!(!value.contains("'unsafe-inline'"), "{name}{value}");
            assert!(!value.contains("'unsafe-eval'"), "{name}{value}");
            assert!(!value.split(' ').any(|token| token == "*"), "{name}{value}");
        }
        assert_eq!(directive("object-src "), "'none'");
        assert!(
            !csp.contains("http://") || csp.matches("http://").count() == 1,
            "only the IPC bridge may be reached over http: {csp}"
        );
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
}
