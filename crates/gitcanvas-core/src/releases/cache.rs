//! Bounded JSON cache for GitHub release metadata.

use std::{
    fs::{self, File, OpenOptions},
    io::Read,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use fs2::FileExt;
use serde::{Deserialize, Serialize};

use crate::{
    error::AppError,
    github::clone::RepositoryName,
    releases::{ReleaseInfo, ReleaseSource},
};

/// Maximum cached GitHub repositories.
pub const MAX_REPOSITORIES: usize = 50;
/// Maximum total disk use for cached release metadata.
pub const MAX_TOTAL_BYTES: u64 = 20 * 1024 * 1024;

const CACHE_SUBDIRECTORY: &str = "releases";
const CACHE_VERSION: u32 = 1;
const LOCK_FILE: &str = ".cache.lock";
const TEMP_PREFIX: &str = ".release.tmp-";

/// Cached provider data; local tag information is deliberately not persisted.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct CachedReleaseData {
    pub source: ReleaseSource,
    pub releases: Vec<ReleaseInfo>,
    pub truncated: bool,
    pub captured_at: String,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct StoredReleaseData {
    version: u32,
    source: ReleaseSource,
    releases: Vec<ReleaseInfo>,
    truncated: bool,
    captured_at: String,
}

struct CacheFile {
    path: PathBuf,
    name: String,
    bytes: u64,
    modified: SystemTime,
}

fn cache_root(data_dir: &Path) -> PathBuf {
    data_dir.join(CACHE_SUBDIRECTORY)
}

fn repository_entry(source: &ReleaseSource) -> Result<String, AppError> {
    let ReleaseSource::Github { owner, name } = source;
    RepositoryName::parse(&format!("{owner}/{name}"))
        .map(|repository| format!("{}.json", repository.cache_entry()))
}

fn lock_cache(root: &Path, create: bool) -> Result<Option<File>, AppError> {
    if create {
        fs::create_dir_all(root)?;
    } else if !root.exists() {
        return Ok(None);
    }
    let lock = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(root.join(LOCK_FILE))?;
    lock.lock_exclusive()?;
    Ok(Some(lock))
}

/// Reads one cache entry without allowing the file to exceed the total cache budget.
pub(crate) fn load(
    data_dir: &Path,
    source: &ReleaseSource,
) -> Result<Option<CachedReleaseData>, AppError> {
    let root = cache_root(data_dir);
    let Some(_lock) = lock_cache(&root, false)? else {
        return Ok(None);
    };
    let path = root.join(repository_entry(source)?);
    let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.file_type().is_file() => metadata,
        Ok(_) => return Ok(None),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    if metadata.len() > MAX_TOTAL_BYTES {
        return Ok(None);
    }

    let file = File::open(path)?;
    let mut bytes = Vec::new();
    file.take(MAX_TOTAL_BYTES.saturating_add(1))
        .read_to_end(&mut bytes)?;
    if u64::try_from(bytes.len()).map_or(true, |length| length > MAX_TOTAL_BYTES) {
        return Ok(None);
    }
    let Ok(stored) = serde_json::from_slice::<StoredReleaseData>(&bytes) else {
        return Ok(None);
    };
    if stored.version != CACHE_VERSION || stored.source != *source {
        return Ok(None);
    }
    Ok(Some(CachedReleaseData {
        source: stored.source,
        releases: stored.releases,
        truncated: stored.truncated,
        captured_at: stored.captured_at,
    }))
}

/// Writes one entry and evicts the oldest entries until both bounds hold.
///
/// Returns `false` when this single entry cannot fit within the cache budget;
/// a fresh API response remains usable even when it is not cacheable.
pub(crate) fn store(
    data_dir: &Path,
    source: &ReleaseSource,
    releases: &[ReleaseInfo],
    truncated: bool,
) -> Result<bool, AppError> {
    let root = cache_root(data_dir);
    let _lock = lock_cache(&root, true)?;
    let name = repository_entry(source)?;
    let captured_at = unix_seconds().to_string();
    let stored = StoredReleaseData {
        version: CACHE_VERSION,
        source: source.clone(),
        releases: releases.to_vec(),
        truncated,
        captured_at,
    };
    let bytes = serde_json::to_vec(&stored).map_err(|error| {
        AppError::Internal(format!("could not serialize release cache: {error}"))
    })?;
    let size = u64::try_from(bytes.len()).map_err(|_| {
        AppError::ResourceLimitExceeded("release cache entry is too large".to_owned())
    })?;
    if size > MAX_TOTAL_BYTES {
        return Ok(false);
    }

    let mut temporary = tempfile::Builder::new()
        .prefix(TEMP_PREFIX)
        .tempfile_in(&root)?;
    std::io::Write::write_all(&mut temporary, &bytes)?;
    temporary.as_file().sync_all()?;

    let target = root.join(&name);
    let mut entries = cache_files(&root)?;
    let existing_size = entries
        .iter()
        .filter(|entry| entry.name != name)
        .fold(0_u64, |total, entry| total.saturating_add(entry.bytes));
    let existing_count = entries.iter().filter(|entry| entry.name != name).count();
    entries.retain(|entry| entry.name != name);
    entries.sort_by(|left, right| {
        left.modified
            .cmp(&right.modified)
            .then_with(|| left.name.cmp(&right.name))
    });

    let mut total = existing_size;
    let mut count = existing_count;
    while count.saturating_add(1) > MAX_REPOSITORIES || total.saturating_add(size) > MAX_TOTAL_BYTES
    {
        let Some(oldest) = entries.first() else {
            return Ok(false);
        };
        fs::remove_file(&oldest.path)?;
        total = total.saturating_sub(oldest.bytes);
        count = count.saturating_sub(1);
        entries.remove(0);
    }

    temporary
        .persist(&target)
        .map_err(|failure| AppError::from(failure.error))?;
    Ok(true)
}

fn cache_files(root: &Path) -> Result<Vec<CacheFile>, AppError> {
    let mut files = Vec::new();
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = entry.file_name();
        let Some(name) = file_name.to_str() else {
            continue;
        };
        let is_json_extension = Path::new(name)
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("json"));
        if name.starts_with('.') || !is_json_extension || !name.as_bytes().ends_with(b".json") {
            continue;
        }
        let Some(repository) = name.strip_suffix(".json") else {
            continue;
        };
        let Some((owner, repo)) = repository.split_once("__") else {
            continue;
        };
        if RepositoryName::parse(&format!("{owner}/{repo}")).is_err() {
            continue;
        }
        let metadata = fs::symlink_metadata(&path)?;
        if !metadata.file_type().is_file() {
            continue;
        }
        files.push(CacheFile {
            path,
            name: name.to_owned(),
            bytes: metadata.len(),
            modified: metadata.modified().unwrap_or(UNIX_EPOCH),
        });
    }
    Ok(files)
}

fn unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_secs())
}

#[cfg(test)]
mod tests {
    use std::{fs, path::Path};

    use filetime::{set_file_mtime, FileTime};

    use super::{load, store, MAX_REPOSITORIES, MAX_TOTAL_BYTES};
    use crate::{releases::ReleaseInfo, releases::ReleaseSource};

    fn source(index: usize) -> ReleaseSource {
        ReleaseSource::Github {
            owner: format!("owner{index}"),
            name: "repo".to_owned(),
        }
    }

    fn release(notes: String) -> ReleaseInfo {
        ReleaseInfo {
            id: 1,
            tag_name: "v1".to_owned(),
            name: Some("Release".to_owned()),
            notes,
            html_url: Some("https://github.com/owner/repo/releases/tag/v1".to_owned()),
            prerelease: false,
            published_at: Some("2026-11-22T00:00:00Z".to_owned()),
        }
    }

    fn cache_file(data_dir: &Path, source: &ReleaseSource) -> std::path::PathBuf {
        let ReleaseSource::Github { owner, name } = source;
        data_dir
            .join("releases")
            .join(format!("{owner}__{name}.json"))
    }

    #[test]
    fn stores_and_loads_provider_data_with_capture_time_and_no_local_tag_snapshot() {
        let directory = tempfile::tempdir().unwrap();
        let source = source(0);
        let releases = [release("notes".to_owned())];

        assert!(store(directory.path(), &source, &releases, true).unwrap());
        let cached = load(directory.path(), &source).unwrap().unwrap();

        assert_eq!(cached.source, source);
        assert_eq!(cached.releases, releases);
        assert!(cached.truncated);
        assert!(!cached.captured_at.is_empty());
        assert!(cache_file(directory.path(), &source).is_file());
    }

    #[test]
    fn unknown_or_corrupt_entries_are_cache_misses() {
        let directory = tempfile::tempdir().unwrap();
        let source = source(0);
        let path = cache_file(directory.path(), &source);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, b"not json").unwrap();

        assert!(load(directory.path(), &source).unwrap().is_none());

        fs::write(
            &path,
            br#"{"version":99,"source":{"github":{"owner":"owner0","name":"repo"}},"releases":[],"truncated":false,"captured_at":"1"}"#,
        )
        .unwrap();
        assert!(load(directory.path(), &source).unwrap().is_none());
    }

    #[test]
    fn replacing_an_entry_does_not_consume_a_repository_slot() {
        let directory = tempfile::tempdir().unwrap();
        let source = source(0);

        assert!(store(
            directory.path(),
            &source,
            &[release("one".to_owned())],
            false
        )
        .unwrap());
        assert!(store(
            directory.path(),
            &source,
            &[release("two".to_owned())],
            false
        )
        .unwrap());

        let entries = fs::read_dir(directory.path().join("releases"))
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .path()
                    .extension()
                    .is_some_and(|extension| extension == "json")
            })
            .count();
        assert_eq!(entries, 1);
        assert_eq!(
            load(directory.path(), &source).unwrap().unwrap().releases[0].notes,
            "two"
        );
    }

    #[test]
    fn evicts_the_oldest_entry_to_keep_the_repository_cap() {
        let directory = tempfile::tempdir().unwrap();
        for index in 0..MAX_REPOSITORIES {
            assert!(store(
                directory.path(),
                &source(index),
                &[release(index.to_string())],
                false
            )
            .unwrap());
        }
        let oldest = cache_file(directory.path(), &source(0));
        set_file_mtime(&oldest, FileTime::from_unix_time(1, 0)).unwrap();

        assert!(store(
            directory.path(),
            &source(MAX_REPOSITORIES),
            &[release("newest".to_owned())],
            false
        )
        .unwrap());

        assert!(load(directory.path(), &source(0)).unwrap().is_none());
        assert!(load(directory.path(), &source(MAX_REPOSITORIES))
            .unwrap()
            .is_some());
    }

    #[test]
    fn evicts_the_oldest_entry_to_keep_the_total_byte_cap() {
        let directory = tempfile::tempdir().unwrap();
        let notes = "x".repeat(12 * 1024 * 1024);
        let oldest = source(0);
        let newest = source(1);
        assert!(store(directory.path(), &oldest, &[release(notes.clone())], false).unwrap());
        set_file_mtime(
            cache_file(directory.path(), &oldest),
            FileTime::from_unix_time(1, 0),
        )
        .unwrap();

        assert!(store(directory.path(), &newest, &[release(notes)], false).unwrap());

        assert!(load(directory.path(), &oldest).unwrap().is_none());
        assert!(load(directory.path(), &newest).unwrap().is_some());
    }

    #[test]
    fn entries_over_the_cache_budget_are_not_written() {
        let directory = tempfile::tempdir().unwrap();
        let oversized = "x".repeat(usize::try_from(MAX_TOTAL_BYTES).unwrap());

        assert!(!store(directory.path(), &source(0), &[release(oversized)], false).unwrap());
        assert!(load(directory.path(), &source(0)).unwrap().is_none());
    }
}
