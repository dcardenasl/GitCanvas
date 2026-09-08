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

use tauri_specta::{collect_commands, collect_events};

/// Builds the typed command registry shared by the application and by the
/// bindings generator.
///
/// Both paths go through this one function on purpose: if the exported
/// `bindings.ts` were built from a different list than the one the app
/// actually serves, the types would be a lie that still compiles.
fn specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        .commands(collect_commands![commands::app::ping])
        .events(collect_events![])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = specta_builder();

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
        .run(tauri::generate_context!())
    {
        eprintln!("fatal: could not start GitCanvas: {error}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::specta_builder;

    /// Regenerates `src/bindings.ts` from the registered commands and events.
    ///
    /// Generating the contract from a test rather than from a running app is
    /// what makes it checkable without a display: CI runs `cargo test` and
    /// then `git diff --exit-code src/bindings.ts`. A binding file that no
    /// longer matches the Rust types fails the build instead of drifting
    /// quietly until something breaks at runtime.
    #[test]
    fn typescript_bindings_are_up_to_date() {
        specta_builder()
            .export(
                specta_typescript::Typescript::default(),
                "../src/bindings.ts",
            )
            .unwrap();
    }
}
