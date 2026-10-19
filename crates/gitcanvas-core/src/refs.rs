//! Local branches, remote tracking branches and lightweight/annotated tags.

use std::collections::BTreeSet;

use git2::{BranchType, ErrorCode, Repository};
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{error::AppError, repository::ActiveRepo};

/// A branch uses its full ref name as identity; short names are display only.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct BranchInfo {
    /// Short branch name for display.
    pub name: String,
    /// Full ref name used as branch identity.
    pub full_name: String,
    /// Commit id at the branch tip.
    pub target: Option<String>,
    /// Configured upstream, using its full reference name.
    pub upstream: Option<String>,
    /// Destination of a symbolic reference, including a missing destination.
    pub symbolic_target: Option<String>,
    /// Whether this branch belongs to a remote.
    pub is_remote: bool,
    /// Whether this is the currently checked-out branch.
    pub is_head: bool,
    /// Whether this ref is symbolic instead of direct.
    pub is_symbolic: bool,
}

/// A tag may refer to any Git object, so a commit target is explicitly optional.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct TagInfo {
    /// Tag name for display.
    pub name: String,
    /// Object id directly referenced by the tag.
    pub target: String,
    /// Resolved commit id, if the target peels to a commit.
    pub commit_id: Option<String>,
    /// Whether the tag points to an annotated tag object.
    pub is_annotated: bool,
}

fn read_branches(repo: &Repository) -> Result<Vec<BranchInfo>, AppError> {
    let mut branches = Vec::new();
    for branch in repo.branches(None)? {
        let (branch, kind) = branch?;
        let reference = branch.get();
        if branches.len() >= 10_000 {
            return Err(AppError::ResourceLimitExceeded(
                "too many branch references".into(),
            ));
        }
        let target = match reference.peel_to_commit() {
            Ok(commit) => Some(commit.id().to_string()),
            Err(error)
                if reference.symbolic_target_bytes().is_some()
                    && error.code() == ErrorCode::NotFound =>
            {
                None
            }
            Err(error) => return Err(error.into()),
        };
        let upstream = if kind == BranchType::Local {
            match repo.branch_upstream_name(reference.name()?) {
                Ok(name) => Some(name.as_str()?.to_owned()),
                Err(error) if error.code() == ErrorCode::NotFound => None,
                Err(error) => return Err(error.into()),
            }
        } else {
            None
        };
        branches.push(BranchInfo {
            name: branch.name()?.ok_or_else(invalid_ref_name)?.into(),
            full_name: reference.name()?.into(),
            target,
            upstream,
            symbolic_target: reference.symbolic_target()?.map(str::to_owned),
            is_remote: kind == BranchType::Remote,
            is_head: branch.is_head(),
            is_symbolic: reference.symbolic_target_bytes().is_some(),
        });
    }
    branches.sort_by(|a, b| a.full_name.cmp(&b.full_name));
    Ok(branches)
}

fn read_tags(repo: &Repository) -> Result<Vec<TagInfo>, AppError> {
    let mut tags = Vec::new();
    for reference in repo.references_glob("refs/tags/*")? {
        let reference = reference?;
        if tags.len() >= 10_000 {
            return Err(AppError::ResourceLimitExceeded(
                "too many tag references".into(),
            ));
        }
        let name = reference
            .name()?
            .strip_prefix("refs/tags/")
            .ok_or_else(invalid_ref_name)?;
        let target = reference
            .resolve()?
            .target()
            .ok_or_else(|| AppError::Git("Tag has no target".into()))?;
        let commit_id = match reference.peel_to_commit() {
            Ok(commit) => Some(commit.id().to_string()),
            Err(error) if error.code() == ErrorCode::InvalidSpec => None,
            Err(error) => return Err(error.into()),
        };
        tags.push(TagInfo {
            name: name.into(),
            target: target.to_string(),
            commit_id,
            is_annotated: repo.find_object(target, None)?.kind() == Some(git2::ObjectType::Tag),
        });
    }
    tags.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(tags)
}

fn invalid_ref_name() -> AppError {
    AppError::Git("Reference name must be valid Unicode".into())
}

/// One locally observed reference generation. Stored paths still authorize nothing.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct RepositoryRefsSnapshot {
    /// Local and remote branches, including symbolic aliases.
    pub branches: Vec<BranchInfo>,
    /// Annotated and lightweight tags, including non-commit tags.
    pub tags: Vec<TagInfo>,
    /// Resolved HEAD commit, absent before the first commit.
    pub head: Option<String>,
    /// HEAD's symbolic branch, absent when detached.
    pub head_reference: Option<String>,
    /// Frozen, sorted, unique commit roots for history pagination.
    pub roots: Vec<String>,
}

fn read_snapshot(repo: &Repository) -> Result<RepositoryRefsSnapshot, AppError> {
    let branches = read_branches(repo)?;
    let tags = read_tags(repo)?;
    let (head, head_reference) = match repo.head() {
        Ok(reference) => (
            Some(reference.peel_to_commit()?.id().to_string()),
            if reference.is_branch() {
                Some(reference.name()?.to_owned())
            } else {
                None
            },
        ),
        Err(error) if matches!(error.code(), ErrorCode::NotFound | ErrorCode::UnbornBranch) => {
            (None, None)
        }
        Err(error) => return Err(error.into()),
    };
    let roots: BTreeSet<String> = branches
        .iter()
        .filter_map(|branch| branch.target.clone())
        .chain(tags.iter().filter_map(|tag| tag.commit_id.clone()))
        .chain(head.clone())
        .collect();
    if roots.len() > 10_000 {
        return Err(AppError::ResourceLimitExceeded(
            "too many history roots".into(),
        ));
    }
    Ok(RepositoryRefsSnapshot {
        branches,
        tags,
        head,
        head_reference,
        roots: roots.into_iter().collect(),
    })
}

/// Reads references and configured upstreams twice, rejecting unstable generations.
///
/// # Errors
/// Returns a recoverable conflict after three unstable attempts, or a Git/read error.
pub fn get_repository_refs(active: &ActiveRepo) -> Result<RepositoryRefsSnapshot, AppError> {
    let repo = active.open()?;
    for _ in 0..3 {
        let before = read_snapshot(&repo)?;
        if before == read_snapshot(&repo)? {
            return Ok(before);
        }
    }
    Err(AppError::Conflict(
        "repository references changed while reading; refresh and retry".into(),
    ))
}
