//! Inventory of worktrees linked to the authorized repository.
//!
//! Linked roots are read from shared Git administration metadata. Their index,
//! files, and history are never opened while building this inventory.

use std::path::Path;

use git2::{ErrorCode, Repository, WorktreeLockStatus};
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{error::AppError, repository::ActiveRepo};

const MAX_WORKTREES: usize = 1_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
/// Filesystem state of a registered worktree location.
pub enum WorktreeAvailability {
    /// The working directory currently exists and is a directory.
    Available,
    /// The registered working directory is absent but is not marked prunable.
    Missing,
    /// Git reports that the absent registration could be pruned.
    Prunable,
    /// The location exists but cannot be inspected as a working directory.
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", content = "reference", rename_all = "snake_case")]
/// HEAD identity read from a worktree's administration metadata.
pub enum WorktreeHead {
    /// HEAD points symbolically to this full local branch reference.
    Branch(String),
    /// HEAD points directly to this commit id.
    Detached(String),
    /// HEAD points to a local branch that has no commit yet.
    Unborn(String),
    /// HEAD could not be decoded safely.
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
/// One worktree registered in a shared Git repository.
pub struct RepositoryWorktree {
    /// Git's worktree registration name (the main worktree uses its directory name).
    pub name: String,
    /// Display/navigation data only. Opening this path still requires normal IPC authorization.
    pub root: String,
    /// Whether this is the repository's main working tree.
    pub is_main: bool,
    /// Whether this entry corresponds to the already-authorized active root.
    pub is_active: bool,
    /// Availability of the working-tree location.
    pub availability: WorktreeAvailability,
    /// Current HEAD without opening another worktree.
    pub head: WorktreeHead,
    /// Whether Git marks the worktree as locked.
    pub locked: bool,
    /// Optional human-provided lock reason.
    pub lock_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
/// Stable inventory and identity for a shared Git directory.
pub struct RepositoryWorktreesSnapshot {
    /// Canonical common Git directory; identity only, never an authorized repository path.
    pub repository_id: String,
    /// Root of the worktree through which this inventory was requested.
    pub current_root: String,
    /// Main worktree followed by linked worktrees sorted by canonical root.
    pub worktrees: Vec<RepositoryWorktree>,
}

fn path_text(path: &Path) -> Result<String, AppError> {
    path.to_str()
        .map(str::to_owned)
        .ok_or_else(|| AppError::InvalidRepository("Worktree path must be valid Unicode".into()))
}

fn read_head(admin: &Path) -> WorktreeHead {
    let Ok(contents) = std::fs::read_to_string(admin.join("HEAD")) else {
        return WorktreeHead::Unknown;
    };
    let value = contents.trim();
    if let Some(reference) = value.strip_prefix("ref: ") {
        return if reference.starts_with("refs/heads/") {
            WorktreeHead::Branch(reference.to_owned())
        } else {
            WorktreeHead::Unknown
        };
    }
    if value.len() == 40 && value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        WorktreeHead::Detached(value.to_ascii_lowercase())
    } else {
        WorktreeHead::Unknown
    }
}

fn head_from_repo(repo: &Repository) -> WorktreeHead {
    match repo.find_reference("HEAD") {
        Ok(reference) => {
            if let Ok(Some(target)) = reference.symbolic_target() {
                if target.starts_with("refs/heads/") {
                    return match repo.head() {
                        Ok(_) => WorktreeHead::Branch(target.to_owned()),
                        Err(error) if error.code() == ErrorCode::UnbornBranch => {
                            WorktreeHead::Unborn(target.to_owned())
                        }
                        Err(_) => WorktreeHead::Unknown,
                    };
                }
            }
            reference.target().map_or(WorktreeHead::Unknown, |oid| {
                WorktreeHead::Detached(oid.to_string())
            })
        }
        Err(_) => WorktreeHead::Unknown,
    }
}

fn inventory(active: &ActiveRepo) -> Result<RepositoryWorktreesSnapshot, AppError> {
    let current = active.open()?;
    let common = current.commondir().canonicalize()?;
    let common_text = path_text(&common)?;
    let current_root = path_text(active.path())?;
    let main_repo = Repository::open(&common)?;
    let main_root = main_repo
        .workdir()
        .ok_or_else(|| {
            AppError::InvalidRepository("Git common directory has no main working tree".into())
        })?
        .canonicalize()?;
    let main_admin = main_repo.path().to_path_buf();
    let mut worktrees = Vec::new();
    worktrees.push(RepositoryWorktree {
        name: main_root
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("main")
            .to_owned(),
        root: path_text(&main_root)?,
        is_main: true,
        is_active: main_root == active.path(),
        availability: WorktreeAvailability::Available,
        head: head_from_repo(&main_repo),
        locked: false,
        lock_reason: None,
    });

    let registry = main_admin.join("worktrees");
    let names = main_repo.worktrees()?;
    if names.len() > MAX_WORKTREES {
        return Err(AppError::ResourceLimitExceeded(
            "too many linked worktrees".into(),
        ));
    }
    let mut linked = Vec::with_capacity(names.len());
    for entry in &names {
        let name =
            entry?.ok_or_else(|| AppError::Git("worktree registry has an invalid name".into()))?;
        let worktree = main_repo.find_worktree(name)?;
        let path = worktree.path().to_path_buf();
        let lock = worktree.is_locked()?;
        let (locked, lock_reason) = match lock {
            WorktreeLockStatus::Unlocked => (false, None),
            WorktreeLockStatus::Locked(reason) => (true, reason),
        };
        let availability = match std::fs::metadata(&path) {
            Ok(metadata) if metadata.is_dir() => WorktreeAvailability::Available,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                if worktree.is_prunable(None)? {
                    WorktreeAvailability::Prunable
                } else {
                    WorktreeAvailability::Missing
                }
            }
            Ok(_) | Err(_) => WorktreeAvailability::Unavailable,
        };
        let head = read_head(&registry.join(name));
        let root = path.canonicalize().unwrap_or(path.clone());
        linked.push(RepositoryWorktree {
            name: name.to_owned(),
            root: path_text(&root)?,
            is_main: false,
            is_active: root == active.path(),
            availability,
            head,
            locked,
            lock_reason,
        });
    }
    linked.sort_by(|left, right| left.root.cmp(&right.root));
    worktrees.extend(linked);
    Ok(RepositoryWorktreesSnapshot {
        repository_id: common_text,
        current_root,
        worktrees,
    })
}

/// Reads a stable inventory through an already-authorized active repository.
///
/// # Errors
/// Returns a repository, metadata, resource-limit, or unstable-snapshot error.
pub fn get_repository_worktrees(
    active: &ActiveRepo,
) -> Result<RepositoryWorktreesSnapshot, AppError> {
    for _ in 0..3 {
        let before = inventory(active)?;
        if before == inventory(active)? {
            return Ok(before);
        }
    }
    Err(AppError::Conflict(
        "worktree registry changed while reading; refresh and retry".into(),
    ))
}
