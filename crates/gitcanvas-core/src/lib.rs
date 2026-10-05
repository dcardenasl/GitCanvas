#![cfg_attr(
    test,
    allow(
        clippy::unwrap_used,
        clippy::expect_used,
        clippy::panic,
        clippy::indexing_slicing
    )
)]

//! Git domain logic for GitCanvas.
//!
//! This crate reads repositories and answers questions about them: what
//! commits exist, which refs point where, what a commit changed. It knows
//! nothing about Tauri, about IPC, or about the user interface, and it must
//! stay that way — `src-tauri` depends on this crate, never the reverse.
//!
//! Everything here is synchronous and blocking, because libgit2 is. Callers
//! are responsible for moving that work off the UI thread; in the Tauri layer
//! that means `tauri::async_runtime::spawn_blocking`.

pub mod actions;
pub mod blob;
pub mod commit_tree;
pub mod diff;
pub mod error;
pub mod github;
pub mod history;
mod pagination;
pub mod refs;
pub mod repository;
pub mod retry;
pub mod watch;
pub mod worktree;
