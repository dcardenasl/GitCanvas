//! Bounded browsing of a commit's immutable file tree.

use git2::ObjectType;
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{
    error::AppError,
    repository::{parse_commit_id, ActiveRepo},
};

/// Maximum number of direct children returned for one directory request.
pub const COMMIT_TREE_PAGE_SIZE: usize = 200;

/// A direct child in a commit tree. Directories are loaded on demand by the UI.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CommitTreeEntry {
    pub name: String,
    /// Repository-relative path, always separated with `/`.
    pub path: String,
    pub kind: CommitTreeEntryKind,
}

/// Git object types that can occur in a tree and have distinct UI behavior.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub enum CommitTreeEntryKind {
    Directory,
    File,
    Submodule,
}

/// A bounded page of direct children from a commit directory.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CommitTreePage {
    pub commit_id: String,
    pub directory_path: Option<String>,
    pub entries: Vec<CommitTreeEntry>,
    /// Offset for the next page, absent when this directory is exhausted.
    pub next_offset: Option<u32>,
}

/// Identifies one immutable commit directory and the next direct-child offset.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CommitTreeRequest {
    pub commit_id: String,
    /// `None` selects the root. Non-root paths must be canonical Git paths.
    pub directory_path: Option<String>,
    pub offset: u32,
}

/// Lists one bounded page of direct children from a commit directory.
///
/// The caller expands directories explicitly, so a large repository never
/// requires a full recursive walk or a repository-sized IPC response.
///
/// # Errors
/// Returns [`AppError`] for an invalid commit, non-directory path, invalid
/// pagination offset, unreadable tree object, or non-Unicode path entry.
pub fn get_commit_tree_page(
    active: &ActiveRepo,
    request: &CommitTreeRequest,
) -> Result<CommitTreePage, AppError> {
    let repo = active.open()?;
    let commit_oid = parse_commit_id(&request.commit_id)?;
    let commit = repo.find_commit(commit_oid)?;
    let commit_tree = commit.tree()?;

    let tree = match request.directory_path.as_deref() {
        None => commit_tree,
        Some(path) => {
            validate_directory_path(path)?;
            let entry = commit_tree
                .get_path(std::path::Path::new(path))
                .map_err(|_| {
                    AppError::InvalidInput(format!("{path} is not a directory in this commit"))
                })?;
            if entry.kind() != Some(ObjectType::Tree) {
                return Err(AppError::InvalidInput(format!(
                    "{path} is not a directory in this commit"
                )));
            }
            repo.find_tree(entry.id())?
        }
    };

    let offset = usize::try_from(request.offset)
        .map_err(|_| AppError::InvalidInput("directory offset is invalid".to_owned()))?;
    let total = tree.len();
    if offset > total {
        return Err(AppError::InvalidInput(
            "directory offset is beyond the end of this directory".to_owned(),
        ));
    }

    let end = offset.saturating_add(COMMIT_TREE_PAGE_SIZE).min(total);
    let mut entries = Vec::with_capacity(end.saturating_sub(offset));
    for index in offset..end {
        let Some(entry) = tree.get(index) else {
            return Err(AppError::Git(
                "commit tree changed while reading an immutable object".to_owned(),
            ));
        };
        let name = entry.name().map_err(|_| {
            AppError::InvalidInput(
                "this commit contains a path that cannot be represented as Unicode".to_owned(),
            )
        })?;
        let path = match request.directory_path.as_deref() {
            Some(parent) => format!("{parent}/{name}"),
            None => name.to_owned(),
        };
        let kind = match entry.kind() {
            Some(ObjectType::Tree) => CommitTreeEntryKind::Directory,
            Some(ObjectType::Blob) => CommitTreeEntryKind::File,
            Some(ObjectType::Commit) => CommitTreeEntryKind::Submodule,
            _ => continue,
        };
        entries.push(CommitTreeEntry {
            name: name.to_owned(),
            path,
            kind,
        });
    }

    let next_offset = if end < total {
        Some(u32::try_from(end).map_err(|_| {
            AppError::ResourceLimitExceeded("directory has too many entries to page".to_owned())
        })?)
    } else {
        None
    };

    Ok(CommitTreePage {
        commit_id: commit.id().to_string(),
        directory_path: request.directory_path.clone(),
        entries,
        next_offset,
    })
}

fn validate_directory_path(path: &str) -> Result<(), AppError> {
    if path.is_empty()
        || path.starts_with('/')
        || path.ends_with('/')
        || path
            .split('/')
            .any(|component| component.is_empty() || component == "." || component == "..")
    {
        return Err(AppError::InvalidInput(
            "directory path must be a canonical repository-relative path".to_owned(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_directory_path;

    #[test]
    fn rejects_non_canonical_directory_paths() {
        for path in ["", "/src", "src/", "src//nested", "./src", "src/../other"] {
            assert!(validate_directory_path(path).is_err(), "accepted {path:?}");
        }
    }

    #[test]
    fn accepts_nested_repository_relative_paths() {
        assert!(validate_directory_path("src/components").is_ok());
    }
}
