//! Native shutdown routing. Renderer recovery restarts explicitly; ordinary
//! system exit must first let the window flush its durable workspace.

use tauri::Manager;

/// Sends normal system quit (including Cmd+Q) through the window's close request.
/// A destroyed final window has nothing left to flush; explicit process exits
/// and restarts also continue through Tauri's own lifecycle.
pub fn on_run_event(handle: &tauri::AppHandle, event: tauri::RunEvent) {
    if let tauri::RunEvent::ExitRequested {
        code: None, api, ..
    } = event
    {
        if let Some(window) = handle.get_webview_window("main") {
            api.prevent_exit();
            if let Err(error) = window.close() {
                tracing::error!(%error, "could not request window close before exit");
            }
        }
    }
}
