//! Bounded file-backed snapshots; never call libgit2's potentially writing reflog reader.

use std::{
    fs::{self, File, Metadata, OpenOptions},
    io::{ErrorKind, Read},
    path::{Path, PathBuf},
};

use git2::{ErrorCode, Oid, Repository};
use sha2::{Digest, Sha256};

use super::MAX_STASH_REFLOG_BYTES;
use crate::{error::AppError, file_identity::same_file_identity, repository::ActiveRepo};

pub(super) struct Snapshot {
    pub(super) bytes: Vec<u8>,
    common: PathBuf,
    tip: Option<Oid>,
    log_present: bool,
}

impl Snapshot {
    pub(super) fn validate_tip(&self, newest: Option<Oid>) -> Result<(), AppError> {
        if self.tip == newest && self.tip.is_some() == self.log_present {
            Ok(())
        } else {
            Err(AppError::Git(
                "Stash reference and reflog are inconsistent; refresh after external Git operations finish"
                    .into(),
            ))
        }
    }

    pub(super) fn revision(&self) -> String {
        let mut digest = Sha256::new();
        digest.update(b"gitcanvas-stash-list-v1\0");
        digest.update(self.common.as_os_str().as_encoded_bytes());
        digest.update([0, u8::from(self.log_present)]);
        if let Some(tip) = self.tip {
            digest.update(tip.as_bytes());
        }
        digest.update(&self.bytes);
        format!("{:x}", digest.finalize())
    }
}

pub(super) fn read(active: &ActiveRepo) -> Result<Snapshot, AppError> {
    let repo = active.open()?;
    verify_backend(&repo)?;
    let common = repo.commondir().canonicalize()?;
    let path = common.join("logs").join("refs").join("stash");
    read_stable(|| attempt(&repo, &common, &path, open_log))
}

fn read_stable(
    mut attempt: impl FnMut() -> Result<Option<Snapshot>, AppError>,
) -> Result<Snapshot, AppError> {
    for _ in 0..2 {
        if let Some(snapshot) = attempt()? {
            return Ok(snapshot);
        }
    }
    Err(AppError::Conflict(
        "Stash list changed while reading; refresh and retry".into(),
    ))
}

fn verify_backend(repo: &Repository) -> Result<(), AppError> {
    match repo.config()?.get_string("extensions.refStorage") {
        Ok(storage) if !storage.eq_ignore_ascii_case("files") => Err(AppError::Git(format!(
            "Stash listing requires file-backed references; {storage} is not supported"
        ))),
        Ok(_) => Ok(()),
        Err(error) if error.code() == ErrorCode::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

fn tip(repo: &Repository) -> Result<Option<Oid>, AppError> {
    match repo.find_reference("refs/stash") {
        Ok(reference) => reference
            .target()
            .filter(|id| !id.is_zero())
            .map(Some)
            .ok_or_else(|| {
                AppError::Git("Stash reference must have a direct nonzero target".into())
            }),
        Err(error) if error.code() == ErrorCode::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

fn attempt(
    repo: &Repository,
    common: &Path,
    path: &Path,
    open: impl FnOnce(&Path) -> Result<Option<Log>, AppError>,
) -> Result<Option<Snapshot>, AppError> {
    let before = tip(repo)?;
    verify_directories(common)?;
    let log = match open(path) {
        Err(AppError::Conflict(_)) => return Ok(None),
        other => other?,
    };
    let after = tip(repo)?;
    if before != after || !is_current(path, log.as_ref())? {
        return Ok(None);
    }
    verify_directories(common)?;
    Ok(Some(Snapshot {
        common: common.to_path_buf(),
        tip: after,
        log_present: log.is_some(),
        bytes: log.map_or_else(Vec::new, |log| log.bytes),
    }))
}

fn verify_directories(common: &Path) -> Result<(), AppError> {
    let mut path = common.to_path_buf();
    for component in ["logs", "refs"] {
        path.push(component);
        match fs::symlink_metadata(&path) {
            Ok(metadata) if metadata.file_type().is_dir() && path.canonicalize()? == path => {}
            Ok(_) => {
                return Err(AppError::Git(
                    "Stash reflog parent is not a regular Git metadata directory".into(),
                ))
            }
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(()),
            Err(error) => return Err(error.into()),
        }
    }
    Ok(())
}

struct Log {
    file: File,
    before: Metadata,
    bytes: Vec<u8>,
}

fn open_log(path: &Path) -> Result<Option<Log>, AppError> {
    let Some(metadata) = log_metadata(path)? else {
        return Ok(None);
    };
    if metadata.len() > u64::from(MAX_STASH_REFLOG_BYTES) {
        return Err(too_large());
    }
    let mut options = OpenOptions::new();
    options.read(true);
    no_follow_nonblocking(&mut options);
    let mut file = match options.open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    let before = file.metadata()?;
    if !before.is_file() || !same_file_identity(&file, path, &before, &metadata) {
        return Err(AppError::Conflict(
            "Stash reflog was replaced while opening".into(),
        ));
    }
    let bytes = read_bounded(&mut file)?;
    Ok(Some(Log {
        file,
        before,
        bytes,
    }))
}

#[cfg(unix)]
fn no_follow_nonblocking(options: &mut OpenOptions) {
    use std::os::unix::fs::OpenOptionsExt;

    options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
}

#[cfg(windows)]
fn no_follow_nonblocking(options: &mut OpenOptions) {
    use std::os::windows::fs::OpenOptionsExt;

    // Open the reparse point itself, so a symlink cannot redirect this read.
    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
    options.custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
}

#[cfg(not(any(unix, windows)))]
fn no_follow_nonblocking(_options: &mut OpenOptions) {}

fn log_metadata(path: &Path) -> Result<Option<Metadata>, AppError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_file() => Ok(Some(metadata)),
        Ok(_) => Err(AppError::Git("Stash reflog is not a regular file".into())),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

fn read_bounded(reader: impl Read) -> Result<Vec<u8>, AppError> {
    let mut bytes = Vec::new();
    reader
        .take(u64::from(MAX_STASH_REFLOG_BYTES).saturating_add(1))
        .read_to_end(&mut bytes)?;
    if bytes.len() > MAX_STASH_REFLOG_BYTES as usize {
        return Err(too_large());
    }
    Ok(bytes)
}

fn is_current(path: &Path, log: Option<&Log>) -> Result<bool, AppError> {
    let current = log_metadata(path)?;
    match (log, current) {
        (None, None) => Ok(true),
        (Some(log), Some(current)) => {
            let after = log.file.metadata()?;
            Ok(same_file_identity(&log.file, path, &after, &current)
                && stable_metadata(&log.before, &after)?
                && stable_metadata(&after, &current)?
                && after.len() == log.bytes.len() as u64)
        }
        _ => Ok(false),
    }
}

fn stable_metadata(before: &Metadata, after: &Metadata) -> Result<bool, AppError> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if before.ctime() != after.ctime() || before.ctime_nsec() != after.ctime_nsec() {
            return Ok(false);
        }
    }
    Ok(before.len() == after.len() && before.modified()? == after.modified()?)
}

fn too_large() -> AppError {
    AppError::ResourceLimitExceeded(format!(
        "Stash reflog exceeds {MAX_STASH_REFLOG_BYTES} bytes"
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn paths() -> (tempfile::TempDir, Repository, PathBuf, PathBuf) {
        let directory = tempfile::tempdir().unwrap();
        let repo = Repository::init(directory.path()).unwrap();
        let common = repo.commondir().canonicalize().unwrap();
        let path = common.join("logs/refs/stash");
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, b"original").unwrap();
        (directory, repo, common, path)
    }

    #[test]
    fn replacement_during_read_is_detected_even_with_identical_size_and_mtime() {
        let (_directory, repo, common, path) = paths();
        let result = attempt(&repo, &common, &path, |path| {
            let log = open_log(path)?;
            let stamp = filetime::FileTime::from_last_modification_time(&fs::metadata(path)?);
            let replacement = path.with_file_name("stash-replacement");
            fs::write(&replacement, b"replaced")?;
            filetime::set_file_mtime(&replacement, stamp)?;
            fs::rename(replacement, path)?;
            Ok(log)
        })
        .unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn in_place_write_or_removal_during_read_cannot_return_a_snapshot() {
        for remove in [false, true] {
            let (_directory, repo, common, path) = paths();
            let result = attempt(&repo, &common, &path, |path| {
                let log = open_log(path)?;
                if remove {
                    fs::remove_file(path)?;
                } else {
                    fs::write(path, b"changed-length")?;
                }
                Ok(log)
            })
            .unwrap();
            assert!(result.is_none());
        }
    }

    #[test]
    fn ref_changes_during_read_are_detected_separately_from_the_log() {
        let (_directory, repo, common, path) = paths();
        let tree_id = repo.treebuilder(None).unwrap().write().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let signature = git2::Signature::new("Name", "email", &git2::Time::new(1, 0)).unwrap();
        let id = repo
            .commit(None, &signature, &signature, "base", &tree, &[])
            .unwrap();
        let result = attempt(&repo, &common, &path, |path| {
            let log = open_log(path)?;
            repo.reference("refs/stash", id, true, "external write")?;
            Ok(log)
        })
        .unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn metadata_is_checked_again_on_the_open_handle() {
        let (_directory, _repo, _common, path) = paths();
        let log = open_log(&path).unwrap().unwrap();
        let modified = filetime::FileTime::from_last_modification_time(&log.before);
        fs::write(&path, b"different length").unwrap();
        filetime::set_file_mtime(&path, modified).unwrap();
        assert!(!is_current(&path, Some(&log)).unwrap());
    }

    #[test]
    fn instability_has_one_retry_and_stops_without_hiding_real_errors() {
        let mut attempts = 0;
        let result = read_stable(|| {
            attempts += 1;
            Ok(None)
        });
        assert!(matches!(result, Err(AppError::Conflict(_))));
        assert_eq!(attempts, 2);
        let mut attempts = 0;
        let result = read_stable(|| {
            attempts += 1;
            Err(AppError::Io("permission denied".into()))
        });
        assert!(matches!(result, Err(AppError::Io(_))));
        assert_eq!(attempts, 1);
        let mut attempts = 0;
        let result = read_stable(|| {
            attempts += 1;
            if attempts == 1 {
                Ok(None)
            } else {
                Ok(Some(Snapshot {
                    bytes: Vec::new(),
                    common: PathBuf::new(),
                    tip: None,
                    log_present: false,
                }))
            }
        });
        assert!(result.is_ok());
        assert_eq!(attempts, 2);
    }

    #[test]
    fn an_open_race_also_uses_the_single_controlled_retry() {
        let (_directory, repo, common, path) = paths();
        let result = attempt(&repo, &common, &path, |_| {
            Err(AppError::Conflict("replaced before open".into()))
        })
        .unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn overflow_probe_consumes_only_the_published_bound_plus_one() {
        let mut reader = std::io::repeat(b'x');
        assert!(matches!(
            read_bounded(&mut reader),
            Err(AppError::ResourceLimitExceeded(_))
        ));
        let mut exact = std::io::Cursor::new(vec![0; MAX_STASH_REFLOG_BYTES as usize]);
        assert_eq!(
            read_bounded(&mut exact).unwrap().len(),
            MAX_STASH_REFLOG_BYTES as usize
        );
        assert_eq!(exact.position(), u64::from(MAX_STASH_REFLOG_BYTES));
        let mut overflowing = std::io::Cursor::new(vec![0; MAX_STASH_REFLOG_BYTES as usize + 100]);
        assert!(read_bounded(&mut overflowing).is_err());
        assert_eq!(
            overflowing.position(),
            u64::from(MAX_STASH_REFLOG_BYTES) + 1
        );
    }

    #[test]
    fn unsupported_backends_are_refused_before_using_file_storage_paths() {
        let (_directory, repo, _common, _path) = paths();
        repo.config()
            .unwrap()
            .set_str("extensions.refStorage", "reftable")
            .unwrap();
        assert!(matches!(verify_backend(&repo), Err(AppError::Git(_))));
    }
}
