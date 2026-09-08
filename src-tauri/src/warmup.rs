//! Pre-initialising the system folder panel.
//!
//! On macOS the dialog plugin builds `NSOpenPanel` on the main thread, and the
//! main thread is the one the WebView paints on. The first construction is by
//! far the most expensive — AppKit loads frameworks and initialises the class
//! and its services — and while it happens the interface cannot repaint. That
//! is why the first "open repository" feels like nothing is happening.
//!
//! Doing that work once at startup, when the user is not waiting on it, moves
//! the cost somewhere it does not show.

/// Builds and drops a folder panel so the first real one is cheap.
///
/// Must be called on the main thread; `MainThreadMarker::new` returns `None`
/// anywhere else, and this quietly does nothing rather than risking a panic on
/// a path that is only an optimisation.
#[cfg(target_os = "macos")]
pub fn open_panel() {
    let Some(marker) = objc2_foundation::MainThreadMarker::new() else {
        return;
    };

    // Constructed and immediately dropped. The panel is never shown: the point
    // is the class initialisation, not the window.
    let panel = objc2_app_kit::NSOpenPanel::openPanel(marker);
    drop(panel);

    tracing::debug!("pre-initialised the system folder panel");
}

/// No-op away from macOS, where the panel has no such warm-up cost.
#[cfg(not(target_os = "macos"))]
pub fn open_panel() {}
