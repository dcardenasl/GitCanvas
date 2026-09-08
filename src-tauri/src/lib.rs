//! Tauri application entry point.
//!
//! This crate is the IPC boundary and nothing else: it registers commands,
//! owns application state, and translates `gitcanvas_core` results into
//! responses. All git domain logic lives in `gitcanvas-core`, which does not
//! depend on Tauri.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Starting the runtime is the one place where there is no caller left to
    // return an error to, so the failure is reported and the process exits
    // rather than unwinding through a panic.
    if let Err(error) = tauri::Builder::default().run(tauri::generate_context!()) {
        eprintln!("fatal: could not start GitCanvas: {error}");
        std::process::exit(1);
    }
}
