//! The native menu bar on macOS.
//!
//! macOS binds `⌘W` to "Close Window" in its default menu, and the menu sees a
//! chord before the page does, so a page that wants `⌘W` to close a *tab* cannot
//! have it unless the menu itself says so. The application therefore owns its
//! menu there. Windows and Linux have no default menu, so nothing changes for
//! them: the same actions are reached from the page's own shortcuts.
//!
//! The menu's text belongs to the interface language like any other text, so
//! the interface sends it here rather than this crate keeping a second copy of
//! every string and a second way to choose a language.

use std::sync::Arc;

use gitcanvas_core::error::AppError;
use serde::{Deserialize, Serialize};
use specta::Type;

use super::runtime::write;

/// Every piece of text the menu bar shows, already in the interface language.
#[derive(Debug, Clone, Deserialize, Type)]
pub struct MenuLabels {
    pub about: String,
    pub hide: String,
    pub hide_others: String,
    pub show_all: String,
    pub quit: String,
    pub file: String,
    pub open_folder: String,
    pub close_tab: String,
    pub reopen_tab: String,
    pub edit: String,
    pub undo: String,
    pub redo: String,
    pub cut: String,
    pub copy: String,
    pub paste: String,
    pub select_all: String,
    pub window: String,
    pub minimize: String,
    pub zoom: String,
}

/// What a menu item asks of the interface.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub enum MenuAction {
    /// Choose a folder to open as a project.
    OpenFolder,
    /// Close the active tab.
    CloseTab,
    /// Reopen the most recently closed tab.
    ReopenTab,
}

/// Announces a chosen menu item to the interface.
#[derive(Debug, Clone, Serialize, Deserialize, Type, tauri_specta::Event)]
pub struct MenuActionEvent {
    pub action: MenuAction,
}

/// Replaces the menu bar with one in the given language.
///
/// A boxed callback rather than an `AppHandle`, so this layer does not need to
/// know which runtime delivers it — and so every command here stays generic-free
/// and can be collected by the typed builder.
#[derive(Clone)]
pub struct MenuApplier(pub Arc<dyn Fn(MenuLabels) -> Result<(), AppError> + Send + Sync>);

/// Sets the menu bar's text. Only macOS has a menu bar to set; elsewhere it is
/// accepted and ignored, so the interface asks the same way everywhere.
#[tauri::command]
#[specta::specta]
pub async fn set_menu_labels(
    labels: MenuLabels,
    applier: tauri::State<'_, MenuApplier>,
) -> Result<(), AppError> {
    let apply = Arc::clone(&applier.0);
    write("set_menu_labels", move || apply(labels)).await
}
