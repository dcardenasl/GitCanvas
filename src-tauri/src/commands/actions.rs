//! Checkout, pull and push.
//!
//! The guards live in the domain crate; this layer only carries the request
//! across. `force` is a parameter rather than a separate command so that the
//! confirmed and unconfirmed paths cannot drift apart.

use gitcanvas_core::{
    actions::{self, CheckoutOutcome, PullOutcome, PushOutcome},
    error::AppError,
};

use super::{
    repo_access::{with_repo, AllowedRepos},
    runtime::write,
};

/// Checks out a local branch, refusing by default when work would be lost.
#[tauri::command]
#[specta::specta]
pub async fn checkout_branch(
    path: String,
    branch: String,
    force: bool,
    allowed: tauri::State<'_, AllowedRepos>,
) -> Result<CheckoutOutcome, AppError> {
    let allowed = allowed.inner().clone();
    write("checkout_branch", move || {
        with_repo(&allowed, &path, |active| {
            actions::checkout_branch(active, &branch, force)
        })
    })
    .await
}

/// Fetches and fast-forwards the current branch, reporting anything else.
#[tauri::command]
#[specta::specta]
pub async fn pull_fast_forward(
    path: String,
    allowed: tauri::State<'_, AllowedRepos>,
) -> Result<PullOutcome, AppError> {
    let allowed = allowed.inner().clone();
    write("pull_fast_forward", move || {
        with_repo(&allowed, &path, actions::pull_fast_forward)
    })
    .await
}

/// Pushes the current branch to its remote.
#[tauri::command]
#[specta::specta]
pub async fn push_current_branch(
    path: String,
    allowed: tauri::State<'_, AllowedRepos>,
) -> Result<PushOutcome, AppError> {
    let allowed = allowed.inner().clone();
    write("push_current_branch", move || {
        with_repo(&allowed, &path, actions::push_current_branch)
    })
    .await
}
