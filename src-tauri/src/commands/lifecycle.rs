//! Explicit recovery of the native application after a renderer failure.

use super::runtime::write;
use gitcanvas_core::error::AppError;
use std::sync::Arc;

/// Native restart adapter; tests inject a harmless implementation through the same IPC path.
pub struct RestartApplication(pub Arc<dyn Fn() -> Result<(), AppError> + Send + Sync>);

/// Restarts the native process, resetting backend and renderer request generations together.
#[tauri::command]
#[specta::specta]
pub async fn restart_application(
    restart: tauri::State<'_, RestartApplication>,
) -> Result<(), AppError> {
    let restart = Arc::clone(&restart.0);
    write("restart_application", move || restart()).await
}
