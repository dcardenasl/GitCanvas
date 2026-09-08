//! Cloning GitHub repositories into an application-owned cache.
//!
//! Clones are always complete. A `--depth` clone truncates history, and the
//! shape of history is the entire point of this application: a truncated graph
//! would be visually convincing and wrong, which is worse than refusing.

use std::path::{Path, PathBuf};

use git2::{build::RepoBuilder, Cred, FetchOptions, RemoteCallbacks, Repository};
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{error::AppError, github::credentials};

/// How far along a clone is.
///
/// `received_objects` and `total_objects` come straight from libgit2's transfer
/// progress; `total_objects` is zero until the server has finished counting.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type)]
pub struct CloneProgress {
    pub received_objects: u32,
    pub total_objects: u32,
    pub indexed_objects: u32,
    pub received_bytes: u64,
}

impl CloneProgress {
    /// Completion as a fraction, or `None` while the server is still counting.
    #[must_use]
    pub fn fraction(&self) -> Option<f32> {
        if self.total_objects == 0 {
            return None;
        }
        #[allow(clippy::cast_precision_loss)]
        Some((self.received_objects as f32 / self.total_objects as f32).clamp(0.0, 1.0))
    }
}

/// Where a clone landed.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ClonedRepository {
    pub path: String,
    pub full_name: String,
}

/// Derives the cache directory entry for a repository.
///
/// `owner/name` becomes `owner__name` so the cache stays one flat level deep
/// and a repository name can never escape the cache root.
#[must_use]
pub fn cache_entry_name(full_name: &str) -> String {
    full_name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '.' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

/// Clones a repository into `cache_root`, reporting progress as it goes.
///
/// A private repository authenticates with the stored token; a public one needs
/// no credentials, so a missing token is not an error until the server asks.
///
/// # Errors
///
/// Returns [`AppError`] when the destination cannot be prepared, credentials are
/// rejected, or libgit2 fails the transfer.
pub fn clone_repository(
    clone_url: &str,
    full_name: &str,
    cache_root: &Path,
    mut on_progress: impl FnMut(CloneProgress),
) -> Result<ClonedRepository, AppError> {
    let destination = cache_root.join(cache_entry_name(full_name));

    if destination.exists() {
        // An existing clone is reused rather than re-fetched; the caller decides
        // when to refresh it.
        if Repository::open(&destination).is_ok() {
            return Ok(ClonedRepository {
                path: destination.to_string_lossy().into_owned(),
                full_name: full_name.to_owned(),
            });
        }
        // A directory that is not a usable repository is a leftover from an
        // interrupted clone; removing it is the only way forward.
        std::fs::remove_dir_all(&destination)?;
    }

    std::fs::create_dir_all(cache_root)?;

    let mut callbacks = RemoteCallbacks::new();
    callbacks.credentials(|_url, username, allowed| {
        if allowed.contains(git2::CredentialType::USER_PASS_PLAINTEXT) {
            // The token is read here and handed straight to libgit2. It is never
            // returned to a caller and never crosses the IPC boundary.
            if let Ok(token) = credentials::read_token() {
                return Cred::userpass_plaintext(&token, "");
            }
        }
        Cred::default().or_else(|_| Cred::username(username.unwrap_or("git")))
    });
    callbacks.transfer_progress(move |stats| {
        on_progress(CloneProgress {
            received_objects: u32::try_from(stats.received_objects()).unwrap_or(u32::MAX),
            total_objects: u32::try_from(stats.total_objects()).unwrap_or(u32::MAX),
            indexed_objects: u32::try_from(stats.indexed_objects()).unwrap_or(u32::MAX),
            received_bytes: stats.received_bytes() as u64,
        });
        true
    });

    let mut fetch = FetchOptions::new();
    fetch.remote_callbacks(callbacks);
    // Deliberately no `.depth()`: see the module comment.

    let mut builder = RepoBuilder::new();
    builder.fetch_options(fetch);

    match builder.clone(clone_url, &destination) {
        Ok(_) => Ok(ClonedRepository {
            path: destination.to_string_lossy().into_owned(),
            full_name: full_name.to_owned(),
        }),
        Err(error) => {
            // Never leave a half-written clone behind to be mistaken for a good one.
            let _ = std::fs::remove_dir_all(&destination);
            Err(
                if error.class() == git2::ErrorClass::Http || error.code() == git2::ErrorCode::Auth
                {
                    AppError::InvalidInput(
                        "GitHub refused the credentials for this repository".to_owned(),
                    )
                } else {
                    AppError::from(error)
                },
            )
        }
    }
}

/// Absolute path of a cached clone, whether or not it exists yet.
#[must_use]
pub fn cache_path(cache_root: &Path, full_name: &str) -> PathBuf {
    cache_root.join(cache_entry_name(full_name))
}
