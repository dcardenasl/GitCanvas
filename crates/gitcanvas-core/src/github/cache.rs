//! Retention for the clone cache.
//!
//! Without a policy the cache grows until the disk is full, and a full disk is
//! not a problem the user connects to a Git client they used months ago. The
//! limits are deliberately conservative: ten repositories or five gigabytes,
//! whichever comes first, evicting the least recently used.

use std::{
    path::{Path, PathBuf},
    time::SystemTime,
};

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::error::AppError;

/// Maximum cached repositories.
pub const MAX_REPOSITORIES: usize = 10;
/// Maximum total size of the cache, in bytes.
pub const MAX_TOTAL_BYTES: u64 = 5 * 1024 * 1024 * 1024;

/// One cached clone.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CacheEntry {
    pub path: String,
    pub name: String,
    pub bytes: u64,
    /// Unix seconds of the most recent access, as a string for range safety.
    pub last_used: String,
}

/// What the cache currently holds.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CacheStatus {
    pub entries: Vec<CacheEntry>,
    pub total_bytes: u64,
    pub max_repositories: u32,
    pub max_total_bytes: u64,
}

fn directory_size(path: &Path) -> u64 {
    let mut total = 0;
    let Ok(entries) = std::fs::read_dir(path) else {
        return 0;
    };
    for entry in entries.flatten() {
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if metadata.is_dir() {
            total += directory_size(&entry.path());
        } else {
            total += metadata.len();
        }
    }
    total
}

fn last_used(path: &Path) -> SystemTime {
    // Access time is not reliably updated on every filesystem, so modification
    // time is used instead: touching a clone by fetching updates it, and a
    // never-fetched clone keeps the time it was created.
    std::fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .unwrap_or(SystemTime::UNIX_EPOCH)
}

fn unix_seconds(time: SystemTime) -> i64 {
    time.duration_since(SystemTime::UNIX_EPOCH)
        .map_or(0, |elapsed| {
            i64::try_from(elapsed.as_secs()).unwrap_or(i64::MAX)
        })
}

/// Reads what the cache holds, newest first.
///
/// # Errors
///
/// Returns [`AppError`] when the cache root cannot be read.
pub fn status(cache_root: &Path) -> Result<CacheStatus, AppError> {
    let mut entries = Vec::new();

    if cache_root.exists() {
        for entry in std::fs::read_dir(cache_root)? {
            let entry = entry?;
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            entries.push(CacheEntry {
                name: entry.file_name().to_string_lossy().into_owned(),
                bytes: directory_size(&path),
                last_used: unix_seconds(last_used(&path)).to_string(),
                path: path.to_string_lossy().into_owned(),
            });
        }
    }

    entries.sort_by(|a, b| b.last_used.cmp(&a.last_used));
    let total_bytes = entries.iter().map(|entry| entry.bytes).sum();

    Ok(CacheStatus {
        entries,
        total_bytes,
        max_repositories: u32::try_from(MAX_REPOSITORIES).unwrap_or(u32::MAX),
        max_total_bytes: MAX_TOTAL_BYTES,
    })
}

/// Evicts least-recently-used clones until both limits are satisfied.
///
/// `keep` is never evicted, so the repository the user just opened cannot be
/// deleted out from under them by its own arrival.
///
/// # Errors
///
/// Returns [`AppError`] when the cache cannot be read or an eviction fails.
pub fn enforce_retention(cache_root: &Path, keep: Option<&str>) -> Result<Vec<String>, AppError> {
    let status = status(cache_root)?;

    // Oldest first: those are the eviction candidates.
    let mut candidates: Vec<&CacheEntry> = status
        .entries
        .iter()
        .filter(|entry| Some(entry.name.as_str()) != keep)
        .collect();
    candidates.sort_by(|a, b| a.last_used.cmp(&b.last_used));

    let mut count = status.entries.len();
    let mut bytes = status.total_bytes;
    let mut evicted = Vec::new();

    for entry in candidates {
        if count <= MAX_REPOSITORIES && bytes <= MAX_TOTAL_BYTES {
            break;
        }
        std::fs::remove_dir_all(PathBuf::from(&entry.path))?;
        count -= 1;
        bytes = bytes.saturating_sub(entry.bytes);
        evicted.push(entry.name.clone());
    }

    Ok(evicted)
}
