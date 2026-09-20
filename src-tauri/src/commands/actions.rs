//! Checkout, pull and push.
//!
//! The guards live in the domain crate; this layer only carries the request
//! across. `force` is a parameter rather than a separate command so that the
//! confirmed and unconfirmed paths cannot drift apart.

use gitcanvas_core::{
    actions::{self, CheckoutOutcome, PullOutcome, PushOutcome},
    error::AppError,
    repository::ActiveRepo,
};

use super::repository::blocking;

/// Checks out a local branch, refusing by default when work would be lost.
#[tauri::command]
#[specta::specta]
pub async fn checkout_branch(
    path: String,
    branch: String,
    force: bool,
) -> Result<CheckoutOutcome, AppError> {
    blocking("checkout_branch", move || {
        actions::checkout_branch(&ActiveRepo::validate(&path)?, &branch, force)
    })
    .await
}

/// Fetches and fast-forwards the current branch, reporting anything else.
#[tauri::command]
#[specta::specta]
pub async fn pull_fast_forward(path: String) -> Result<PullOutcome, AppError> {
    blocking("pull_fast_forward", move || {
        actions::pull_fast_forward(&ActiveRepo::validate(&path)?)
    })
    .await
}

/// Pushes the current branch to its remote.
#[tauri::command]
#[specta::specta]
pub async fn push_current_branch(path: String) -> Result<PushOutcome, AppError> {
    blocking("push_current_branch", move || {
        actions::push_current_branch(&ActiveRepo::validate(&path)?)
    })
    .await
}
