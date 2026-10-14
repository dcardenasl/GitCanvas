//! Explicit recovery of the native application after a renderer failure.

use super::runtime::write;
use gitcanvas_core::error::AppError;
use std::sync::Arc;

use crate::lifecycle::ShutdownGate;

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

/// Tells the backend that the interface received a close request.
///
/// Deliberately outside the read and write gates: a long clone or push holds
/// every write slot, and a close request that could not be acknowledged while
/// one runs would be taken for an unresponsive interface and the window
/// destroyed before the session was saved. It only sets a flag.
#[tauri::command]
#[specta::specta]
pub async fn acknowledge_shutdown(
    gate: tauri::State<'_, Arc<ShutdownGate>>,
) -> Result<(), AppError> {
    gate.acknowledge();
    Ok(())
}
