//! Local branches, remote tracking branches and lightweight/annotated tags.

use git2::{BranchType, ErrorCode};
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{error::AppError, repository::ActiveRepo};

/// A branch uses its full ref name as identity; short names are display only.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct BranchInfo {
    pub name: String,
    pub full_name: String,
    pub target: String,
    pub is_remote: bool,
    pub is_head: bool,
    pub is_symbolic: bool,
}

/// A tag may refer to any Git object, so a commit target is explicitly optional.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct TagInfo {
    pub name: String,
    pub target: String,
    pub commit_id: Option<String>,
    pub is_annotated: bool,
}

/// Lists branches in a stable order, identifying HEAD by ref identity, not SHA.
///
/// # Errors
/// Returns repository, malformed ref or non-Unicode name errors.
pub fn get_branches(active: &ActiveRepo) -> Result<Vec<BranchInfo>, AppError> {
    let repo = active.open()?;
    let mut branches = Vec::new();
    for branch in repo.branches(None)? {
        let (branch, kind) = branch?;
        let reference = branch.get();
        branches.push(BranchInfo {
            name: branch.name()?.ok_or_else(invalid_ref_name)?.into(),
            full_name: reference.name()?.into(),
            target: reference.peel_to_commit()?.id().to_string(),
            is_remote: kind == BranchType::Remote,
            is_head: branch.is_head(),
            is_symbolic: reference.symbolic_target_bytes().is_some(),
        });
    }
    branches.sort_by(|a, b| a.full_name.cmp(&b.full_name));
    Ok(branches)
}

/// Lists both annotated and lightweight tags, preserving non-commit targets.
///
/// # Errors
/// Returns repository, malformed ref or non-Unicode name errors.
pub fn get_tags(active: &ActiveRepo) -> Result<Vec<TagInfo>, AppError> {
    let repo = active.open()?;
    let mut tags = Vec::new();
    for reference in repo.references_glob("refs/tags/*")? {
        let reference = reference?;
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
