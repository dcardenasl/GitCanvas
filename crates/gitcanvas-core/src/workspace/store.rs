//! Reading and writing the workspace file.
//!
//! One file, one writer. Every operation takes the same lock, so two saves never
//! interleave and a load never sees a half-written file. A save writes a new
//! file next to the old one, flushes it, and renames it over the old one: a
//! crash leaves either the complete old file or the complete new one, never a
//! mix, and the only residue is a temporary file the next load removes.
//!
//! Damaged data is never silently discarded. A file that cannot be understood is
//! moved aside to a `workspace.json.corrupt-<unix seconds>` sibling — the newest
//! few are kept — and the application starts with an empty workspace and is told
//! what happened, so the person can recover by hand.

use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use specta::Type;

use super::Workspace;
use crate::error::AppError;

/// Name of the workspace file inside the data directory.
pub const FILE_NAME: &str = "workspace.json";
/// Schema version this build reads and writes.
pub const SCHEMA_VERSION: u32 = 4;
/// Largest workspace file read or written, in bytes.
pub const MAX_FILE_BYTES: u64 = 4 * 1024 * 1024;
/// Quarantined files kept; older ones are removed when a newer one is made.
const MAX_QUARANTINED: usize = 3;
const QUARANTINE_PREFIX: &str = "workspace.json.corrupt-";
const TEMPORARY_PREFIX: &str = "workspace.json.tmp-";

/// The file's envelope: the version is read before anything else is trusted.
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Stored {
    version: u32,
    workspace: Workspace,
}

/// Why a stored workspace was set aside.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub enum RecoveryKind {
    /// Not valid JSON, not the expected shape, or breaking a workspace rule.
    Corrupt,
    /// Written by a version of the application this one does not understand.
    UnsupportedVersion,
    /// Larger than the largest file this build reads.
    TooLarge,
}

/// A stored workspace that was set aside rather than loaded.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct WorkspaceRecovery {
    /// What was wrong with it.
    pub kind: RecoveryKind,
    /// The precise cause, in English, for a bug report.
    pub detail: String,
    /// Where the original now lives.
    pub backup: String,
}

/// What loading produced.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct LoadedWorkspace {
    /// The workspace to start from: empty when there was nothing usable.
    pub workspace: Workspace,
    /// Set when a stored workspace had to be set aside.
    pub recovery: Option<WorkspaceRecovery>,
}

/// The single writer of the workspace file.
pub struct WorkspaceStore {
    directory: PathBuf,
    /// The revision of the last save applied, behind the lock every operation
    /// takes.
    last_revision: Mutex<Option<u32>>,
}

enum Contents {
    Missing,
    Bytes(Vec<u8>),
    TooLarge,
}

fn unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_secs())
}

fn loaded(workspace: Workspace, recovery: Option<WorkspaceRecovery>) -> LoadedWorkspace {
    LoadedWorkspace {
        workspace,
        recovery,
    }
}

/// Reads the file, refusing to buffer more than the bound.
fn read_contents(path: &Path) -> Result<Contents, AppError> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(Contents::Missing);
        }
        Err(error) => return Err(error.into()),
    };
    let mut bytes = Vec::new();
    // One byte past the bound is enough to know it was exceeded.
    file.take(MAX_FILE_BYTES.saturating_add(1))
        .read_to_end(&mut bytes)?;
    if u64::try_from(bytes.len()).map_or(true, |length| length > MAX_FILE_BYTES) {
        return Ok(Contents::TooLarge);
    }
    Ok(Contents::Bytes(bytes))
}

/// Understands a stored workspace, or says why it cannot be used.
fn parse(bytes: &[u8]) -> Result<Workspace, (RecoveryKind, String)> {
    let corrupt = |error: &dyn std::fmt::Display| (RecoveryKind::Corrupt, error.to_string());
    let mut value: serde_json::Value = serde_json::from_slice(bytes).map_err(|e| corrupt(&e))?;
    if !value.is_object() {
        return Err(corrupt(&"the file does not hold a JSON object"));
    }
    let version = value.get("version").and_then(serde_json::Value::as_u64);
    if version == Some(1) {
        let workspace = value
            .get_mut("workspace")
            .and_then(serde_json::Value::as_object_mut)
            .ok_or_else(|| corrupt(&"missing version 1 workspace"))?;
        if workspace.contains_key("graph_preferences") {
            return Err(corrupt(&"unexpected version 1 graph preferences"));
        }
        workspace.insert("graph_preferences".into(), serde_json::json!([]));
        workspace.insert("reference_filters".into(), serde_json::json!([]));
        workspace.insert("reference_tree_preferences".into(), serde_json::json!([]));
        if let Some(object) = value.as_object_mut() {
            object.insert("version".into(), serde_json::json!(SCHEMA_VERSION));
        }
    } else if version == Some(2) {
        let workspace = value
            .get_mut("workspace")
            .and_then(serde_json::Value::as_object_mut)
            .ok_or_else(|| corrupt(&"missing version 2 workspace"))?;
        let preferences = workspace
            .get_mut("graph_preferences")
            .and_then(serde_json::Value::as_array_mut)
            .ok_or_else(|| corrupt(&"missing version 2 graph preferences"))?;
        for preference in preferences {
            let record = preference
                .as_object_mut()
                .ok_or_else(|| corrupt(&"invalid version 2 graph preference"))?;
            record.insert("scope".into(), serde_json::json!("worktree"));
        }
        workspace.insert("reference_filters".into(), serde_json::json!([]));
        workspace.insert("reference_tree_preferences".into(), serde_json::json!([]));
        if let Some(object) = value.as_object_mut() {
            object.insert("version".into(), serde_json::json!(SCHEMA_VERSION));
        }
    } else if version == Some(3) {
        let workspace = value
            .get_mut("workspace")
            .and_then(serde_json::Value::as_object_mut)
            .ok_or_else(|| corrupt(&"missing version 3 workspace"))?;
        workspace.insert("reference_tree_preferences".into(), serde_json::json!([]));
        if let Some(object) = value.as_object_mut() {
            object.insert("version".into(), serde_json::json!(SCHEMA_VERSION));
        }
    } else if version != Some(u64::from(SCHEMA_VERSION)) {
        return Err((
            RecoveryKind::UnsupportedVersion,
            format!("expected schema version {SCHEMA_VERSION}, found {version:?}"),
        ));
    }
    let stored: Stored = serde_json::from_value(value).map_err(|e| corrupt(&e))?;
    stored.workspace.validate().map_err(|e| corrupt(&e))?;
    Ok(stored.workspace)
}

/// Flushes a directory entry so a rename survives a power cut. Best effort, and
/// a no-op where directories cannot be opened for it.
fn sync_directory(directory: &Path) {
    #[cfg(unix)]
    if let Ok(handle) = File::open(directory) {
        let _flushed = handle.sync_all();
    }
    #[cfg(not(unix))]
    let _ = directory;
}

impl WorkspaceStore {
    /// A store whose file lives in `directory`, which need not exist yet.
    #[must_use]
    pub fn new(directory: impl Into<PathBuf>) -> Self {
        Self {
            directory: directory.into(),
            last_revision: Mutex::new(None),
        }
    }

    fn file(&self) -> PathBuf {
        self.directory.join(FILE_NAME)
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Option<u32>>, AppError> {
        self.last_revision
            .lock()
            .map_err(|_| AppError::Internal("the workspace store was poisoned".to_owned()))
    }

    /// Reads the workspace, setting aside anything that cannot be used.
    ///
    /// # Errors
    /// Returns [`AppError::Io`] when the file exists but cannot be read, or
    /// cannot be moved aside after it was found unusable. Unusable *contents* are
    /// not an error: they produce an empty workspace and a
    /// [`WorkspaceRecovery`].
    pub fn load(&self) -> Result<LoadedWorkspace, AppError> {
        let _writer = self.lock()?;
        self.remove_temporary_files();
        let (kind, detail) = match read_contents(&self.file())? {
            Contents::Missing => return Ok(loaded(Workspace::default(), None)),
            Contents::TooLarge => (
                RecoveryKind::TooLarge,
                format!("the file is larger than {MAX_FILE_BYTES} bytes"),
            ),
            Contents::Bytes(bytes) => match parse(&bytes) {
                Ok(workspace) => return Ok(loaded(workspace, None)),
                Err(reason) => reason,
            },
        };
        let backup = self.quarantine()?;
        Ok(loaded(
            Workspace::default(),
            Some(WorkspaceRecovery {
                kind,
                detail,
                backup: backup.to_string_lossy().into_owned(),
            }),
        ))
    }

    /// Writes the workspace unless a newer save was already applied.
    ///
    /// `revision` increases with every save the interface sends. Saves reach the
    /// backend on separate threads and could be applied out of order; one older
    /// than the last applied is skipped, so a late arrival can never put back an
    /// earlier state. Returns whether this save was written.
    ///
    /// # Errors
    /// Returns [`AppError::InvalidInput`] when the workspace breaks a rule or
    /// would not fit in [`MAX_FILE_BYTES`], and [`AppError::Io`] when the file
    /// cannot be written. A failed save leaves the previous file untouched.
    pub fn save(&self, revision: u32, workspace: &Workspace) -> Result<bool, AppError> {
        workspace.validate()?;
        let mut bytes = serde_json::to_vec_pretty(&Stored {
            version: SCHEMA_VERSION,
            workspace: workspace.clone(),
        })
        .map_err(|error| AppError::Internal(format!("could not serialize workspace: {error}")))?;
        bytes.push(b'\n');
        if u64::try_from(bytes.len()).map_or(true, |length| length > MAX_FILE_BYTES) {
            return Err(AppError::InvalidInput(format!(
                "invalid workspace: it would exceed {MAX_FILE_BYTES} bytes"
            )));
        }

        let mut last_revision = self.lock()?;
        if last_revision.is_some_and(|applied| revision <= applied) {
            return Ok(false);
        }
        fs::create_dir_all(&self.directory)?;
        let mut temporary = tempfile::Builder::new()
            .prefix(TEMPORARY_PREFIX)
            .tempfile_in(&self.directory)?;
        temporary.write_all(&bytes)?;
        temporary.as_file().sync_all()?;
        temporary
            .persist(self.file())
            .map_err(|failure| AppError::from(failure.error))?;
        sync_directory(&self.directory);
        *last_revision = Some(revision);
        Ok(true)
    }

    /// Moves the unusable file aside and prunes the oldest backups.
    fn quarantine(&self) -> Result<PathBuf, AppError> {
        let stamp = unix_seconds();
        let mut attempt: u32 = 0;
        let target = loop {
            let name = if attempt == 0 {
                format!("{QUARANTINE_PREFIX}{stamp}")
            } else {
                format!("{QUARANTINE_PREFIX}{stamp}-{attempt}")
            };
            let candidate = self.directory.join(name);
            if !candidate.exists() {
                break candidate;
            }
            attempt = attempt
                .checked_add(1)
                .ok_or_else(|| AppError::Io("no free name for the workspace backup".to_owned()))?;
        };
        fs::rename(self.file(), &target)?;
        self.prune_quarantine();
        Ok(target)
    }

    /// Keeps the newest [`MAX_QUARANTINED`] backups. Best effort: a backup that
    /// cannot be removed is harmless and must not fail a load.
    fn prune_quarantine(&self) {
        let Ok(entries) = fs::read_dir(&self.directory) else {
            return;
        };
        let mut backups: Vec<(SystemTime, PathBuf)> = entries
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with(QUARANTINE_PREFIX)
            })
            .filter_map(|entry| {
                let modified = entry.metadata().and_then(|meta| meta.modified()).ok()?;
                Some((modified, entry.path()))
            })
            .collect();
        backups.sort_by_key(|(modified, _)| std::cmp::Reverse(*modified));
        for (_, path) in backups.into_iter().skip(MAX_QUARANTINED) {
            let _removed = fs::remove_file(path);
        }
    }

    /// Removes what an interrupted save left behind. Best effort, and safe to
    /// run only under the writer lock, which `load` holds.
    fn remove_temporary_files(&self) {
        let Ok(entries) = fs::read_dir(&self.directory) else {
            return;
        };
        for entry in entries.filter_map(Result::ok) {
            if entry
                .file_name()
                .to_string_lossy()
                .starts_with(TEMPORARY_PREFIX)
            {
                let _removed = fs::remove_file(entry.path());
            }
        }
    }
}
