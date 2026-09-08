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
            commands::repository::get_commits,
            commands::repository::get_branches,
            commands::repository::get_tags,
        ])
        .events(collect_events![])
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
    if let Err(error) = tauri::Builder::default()
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
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
                // Must match the scheme the capability resolves against.
                // macOS webviews serve from `tauri://localhost`; the
                // `http://tauri.localhost` form used on Windows and Linux is
                // rejected here by the ACL as an unknown origin.
                url: "tauri://localhost".parse().unwrap(),
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
