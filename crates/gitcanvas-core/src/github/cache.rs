//! Retention for the clone cache.
//!
//! Without a policy the cache grows until the disk is full, and a full disk is
//! not a problem the user connects to a Git client they used months ago. The
//! limits are deliberately conservative: ten repositories or five gigabytes,
//! whichever comes first, evicting the least recently used.

use std::{
    fs::{File, OpenOptions},
    path::Component,
    path::{Path, PathBuf},
    time::SystemTime,
};

use fs2::FileExt;
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
    /// Size in bytes, as a decimal string.
    ///
    /// A directory can exceed what a JavaScript number represents exactly, and
    /// specta refuses to export 64-bit integers for that reason. The same
    /// convention as commit timestamps: cross the boundary as text, parse on
    /// the far side.
    pub bytes: String,
    /// Unix seconds of the most recent access, as a string for range safety.
    pub last_used: String,
}

/// What the cache currently holds.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CacheStatus {
    pub entries: Vec<CacheEntry>,
    /// Total size in bytes, as a decimal string. See [`CacheEntry::bytes`].
    pub total_bytes: String,
    pub max_repositories: u32,
    /// Limit in bytes, as a decimal string. See [`CacheEntry::bytes`].
    pub max_total_bytes: String,
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

/// Marker written inside a clone's `.git` directory each time it is used.
///
/// Neither the access time (not reliably updated) nor the top-level directory's
/// modification time (unchanged by a fetch, which only touches `.git`) says when
/// a clone was last opened, and the retention policy needs exactly that. The
/// marker lives inside `.git` so it never shows up as an untracked file.
const LAST_USED_MARKER: &str = "gitcanvas-last-used";

/// Cross-process lock for one cache entry. The lock file is stored separately
/// from the repository and is intentionally retained so different app
/// processes always coordinate on the same inode.
pub(crate) struct CacheEntryLock {
    _file: File,
}

/// Locks one cache entry for clone, touch, or retention work.
pub(crate) fn lock_entry(cache_root: &Path, entry_name: &str) -> Result<CacheEntryLock, AppError> {
    let mut components = Path::new(entry_name).components();
    if !matches!(components.next(), Some(Component::Normal(_))) || components.next().is_some() {
        return Err(AppError::InvalidInput(
            "cache entry must be a single path component".to_owned(),
        ));
    }
    let lock_dir = cache_root.join(".locks");
    std::fs::create_dir_all(&lock_dir)?;
    let lock_path = lock_dir.join(format!("{:016x}.lock", stable_hash(entry_name.as_bytes())));
    let file = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(lock_path)?;
    file.lock_exclusive()?;
    Ok(CacheEntryLock { _file: file })
}

fn stable_hash(value: &[u8]) -> u64 {
    value.iter().fold(0xcbf2_9ce4_8422_2325, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x0000_0100_0000_01b3)
    })
}

fn modified(path: &Path) -> Option<SystemTime> {
    std::fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
}

fn last_used(path: &Path) -> SystemTime {
    let created = modified(path);
    let used = modified(&path.join(".git").join(LAST_USED_MARKER));
    created.max(used).unwrap_or(SystemTime::UNIX_EPOCH)
}

/// Records that the clone at `entry` was just used, so retention evicts the
/// clones nobody opens rather than the one just opened.
///
/// Best effort: failing to record a use must never fail the operation that
/// prompted it, so the outcome is reported to the caller only as a `bool`.
#[must_use]
pub fn touch(entry: &Path) -> bool {
    let Some(cache_root) = entry.parent() else {
        return false;
    };
    let Some(entry_name) = entry.file_name().and_then(|name| name.to_str()) else {
        return false;
    };
    let Ok(_lock) = lock_entry(cache_root, entry_name) else {
        return false;
    };
    touch_locked(entry)
}

/// Updates last-used while the caller already holds this entry's lock.
pub(crate) fn touch_locked(entry: &Path) -> bool {
    let marker = entry.join(".git").join(LAST_USED_MARKER);
    let now = unix_seconds(SystemTime::now()).to_string();
    std::fs::write(marker, now).is_ok()
}

/// Records a use for whichever cache entry contains `repository`, if any.
///
/// Anything outside `cache_root` is left alone: repositories the user opened
/// from their own folders are not the cache's to mark.
#[must_use]
pub fn touch_if_cached(cache_root: &Path, repository: &Path) -> bool {
    let root = cache_root
        .canonicalize()
        .unwrap_or_else(|_| cache_root.to_path_buf());
    let Ok(relative) = repository.strip_prefix(&root) else {
        return false;
    };
    match relative.components().next() {
        Some(entry) => touch(&root.join(entry)),
        None => false,
    }
}

/// Returns the direct cache entry containing `repository`, if it is cached.
#[must_use]
pub fn cached_entry_name(cache_root: &Path, repository: &Path) -> Option<String> {
    let root = cache_root.canonicalize().ok()?;
    let repository = repository.canonicalize().ok()?;
    let relative = repository.strip_prefix(root).ok()?;
    let mut components = relative.components();
    let Component::Normal(name) = components.next()? else {
        return None;
    };
    components
        .next()
        .is_none()
        .then(|| name.to_string_lossy().into_owned())
}

/// Parses a decimal string back to bytes, treating malformed input as zero.
fn parse_bytes(value: &str) -> u64 {
    value.parse().unwrap_or(0)
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
            // Dot-prefixed directories are in-flight clones, not cache entries.
            if !path.is_dir() || entry.file_name().to_string_lossy().starts_with('.') {
                continue;
            }
            entries.push(CacheEntry {
                name: entry.file_name().to_string_lossy().into_owned(),
                bytes: directory_size(&path).to_string(),
                last_used: unix_seconds(last_used(&path)).to_string(),
                path: path.to_string_lossy().into_owned(),
            });
        }
    }

    // Numeric order, not lexicographic: "9" must not sort after "10".
    entries.sort_by_key(|entry| std::cmp::Reverse(parse_bytes(&entry.last_used)));
    let total_bytes: u64 = entries.iter().map(|entry| parse_bytes(&entry.bytes)).sum();

    Ok(CacheStatus {
        entries,
        total_bytes: total_bytes.to_string(),
        max_repositories: u32::try_from(MAX_REPOSITORIES).unwrap_or(u32::MAX),
        max_total_bytes: MAX_TOTAL_BYTES.to_string(),
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
pub fn enforce_retention(cache_root: &Path, keep: &[String]) -> Result<Vec<String>, AppError> {
    let initial_status = status(cache_root)?;

    // Oldest first: those are the eviction candidates.
    let mut candidates: Vec<&CacheEntry> = initial_status
        .entries
        .iter()
        .filter(|entry| !keep.iter().any(|name| name == &entry.name))
        .collect();
    candidates.sort_by_key(|entry| parse_bytes(&entry.last_used));

    let mut evicted = Vec::new();
    let mut failures = Vec::new();

    for entry in candidates {
        let lock = lock_entry(cache_root, &entry.name)?;
        let _held = lock;
        let current = status(cache_root)?;
        if current.entries.len() <= MAX_REPOSITORIES
            && parse_bytes(&current.total_bytes) <= MAX_TOTAL_BYTES
        {
            break;
        }
        let Some(current_entry) = current
            .entries
            .iter()
            .find(|current_entry| current_entry.name == entry.name)
        else {
            continue;
        };
        if current_entry.last_used != entry.last_used {
            continue;
        }
        match std::fs::remove_dir_all(PathBuf::from(&current_entry.path)) {
            Ok(()) => evicted.push(entry.name.clone()),
            Err(error) => failures.push(format!("{}: {error}", entry.name)),
        }
    }

    if !failures.is_empty() {
        return Err(AppError::Io(format!(
            "cache retention could not remove entries: {}",
            failures.join("; ")
        )));
    }
    Ok(evicted)
}
