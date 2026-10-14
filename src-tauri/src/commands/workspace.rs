//! Workspace persistence commands.
//!
//! The file, its schema and its rules live in `gitcanvas_core::workspace`; this
//! layer only schedules the blocking work. Loading can move a damaged file
//! aside, so both commands run as writes: exactly once, never retried.

use std::sync::Arc;

use gitcanvas_core::{
    error::AppError,
    workspace::{
        store::{LoadedWorkspace, WorkspaceStore},
        Workspace,
    },
};
use serde::Deserialize;
use specta::Type;

use super::runtime::write;

/// A workspace to persist, numbered so a late arrival cannot undo a newer save.
#[derive(Debug, Clone, Deserialize, Type)]
pub struct SaveWorkspaceRequest {
    /// Increases with every save the interface sends. A save no newer than the
    /// last one applied is skipped.
    pub revision: u32,
    /// The complete workspace to store.
    pub workspace: Workspace,
}

/// Reads the saved workspace, or an empty one when none is usable.
///
/// A stored workspace that cannot be understood is set aside rather than
/// deleted, and the result says so.
#[tauri::command]
#[specta::specta]
pub async fn load_workspace(
    store: tauri::State<'_, Arc<WorkspaceStore>>,
) -> Result<LoadedWorkspace, AppError> {
    let store = Arc::clone(store.inner());
    write("load_workspace", move || store.load()).await
}

/// Saves the complete workspace, replacing the stored one atomically.
#[tauri::command]
#[specta::specta]
pub async fn save_workspace(
    request: SaveWorkspaceRequest,
    store: tauri::State<'_, Arc<WorkspaceStore>>,
) -> Result<(), AppError> {
    let store = Arc::clone(store.inner());
    write("save_workspace", move || {
        store.save(request.revision, &request.workspace).map(|_| ())
    })
    .await
}
