//! Application-level commands.

use serde::{Deserialize, Serialize};
use specta::Type;

/// What the application reports about itself.
///
/// Deliberately a struct rather than a bare string: it exercises struct
/// generation through specta, which is the shape every real payload will take.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AppInfo {
    /// Display name of the application.
    pub name: String,
    /// Version of the Tauri application shell.
    pub version: String,
    /// Version of the git engine crate backing it.
    pub core_version: String,
}

/// Round-trips the IPC boundary and reports what is running.
///
/// This exists to prove the whole pipeline — command registration, type
/// generation, and the TypeScript client — works end to end before anything
/// depends on it.
#[tauri::command]
#[specta::specta]
#[must_use]
pub fn ping() -> AppInfo {
    AppInfo {
        name: "GitCanvas".to_owned(),
        version: env!("CARGO_PKG_VERSION").to_owned(),
        core_version: gitcanvas_core::version().to_owned(),
    }
}
