//! Deterministic topological history with bounded pages and frozen walk roots.

use std::collections::BTreeSet;

use git2::{ErrorCode, Oid, Repository, Sort};
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{error::AppError, repository::ActiveRepo};

/// Maximum number of commits returned by one request.
pub const MAX_PAGE_SIZE: u16 = 500;

/// One commit in the graph. Times are Unix seconds, represented exactly by JSON.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CommitInfo {
    pub id: String,
    pub parents: Vec<String>,
    pub summary: String,
    pub message: String,
    pub author_name: String,
    pub author_email: String,
    pub author_time: f64,
    pub commit_time: f64,
}

/// Request for a page. Continuations carry the prior page's immutable walk roots.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct HistoryRequest {
    pub limit: u16,
    pub cursor: Option<String>,
    pub roots: Option<Vec<String>>,
}

/// A bounded page and the information needed to resume its exact traversal.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct HistoryPage {
    pub commits: Vec<CommitInfo>,
    pub next_cursor: Option<String>,
    pub roots: Vec<String>,
}

/// Reads commits reachable from HEAD, local/remote branches and commit tags.
///
/// A SHA alone cannot encode the outstanding branches of a topological walk.
/// Frozen roots preserve that frontier across calls, including new commits or
/// moved refs between requests. The cursor is always the last emitted SHA;
/// restarting the walk from that SHA would silently drop divergent branches.
///
/// # Errors
/// Rejects invalid limits, incomplete continuations and unreachable cursors.
/// Missing snapshot objects (for example after garbage collection) require refresh.
pub fn get_commits(active: &ActiveRepo, request: &HistoryRequest) -> Result<HistoryPage, AppError> {
    if request.limit == 0 || request.limit > MAX_PAGE_SIZE {
        return Err(AppError::InvalidInput(format!(
            "Page size must be between 1 and {MAX_PAGE_SIZE}"
        )));
    }
    if request.cursor.is_some() && request.roots.is_none() {
        return Err(AppError::InvalidInput(
            "A cursor requires its original walk roots".into(),
        ));
    }
    let repo = active.open()?;
    let roots = match &request.roots {
        Some(roots) => {
            if roots.len() > 100_000 {
                return Err(AppError::InvalidInput("Too many history roots".into()));
            }
            roots
                .iter()
                .map(|id| parse_oid(id))
                .collect::<Result<Vec<_>, _>>()?
        }
        None => history_roots(&repo)?,
    };
    let cursor = request.cursor.as_deref().map(parse_oid).transpose()?;
    let mut walk = repo.revwalk()?;
    walk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)?;
    for root in &roots {
        walk.push(*root).map_err(|_| {
            AppError::StaleCursor(
                "A history root is no longer available; refresh the repository".into(),
            )
        })?;
    }
    let mut found_cursor = cursor.is_none();
    let mut commits = Vec::with_capacity(usize::from(request.limit));
    let mut more = false;
    for id in walk {
        let id = id?;
        if !found_cursor {
            found_cursor = Some(id) == cursor;
            continue;
        }
        if commits.len() == usize::from(request.limit) {
            more = true;
            break;
        }
        commits.push(commit_info(&repo.find_commit(id)?));
    }
    if !found_cursor {
        return Err(AppError::StaleCursor(
            "Cursor is not reachable from the supplied history roots".into(),
        ));
    }
    let next_cursor = if more {
        commits.last().map(|commit| commit.id.clone())
    } else {
        None
    };
    Ok(HistoryPage {
        commits,
        next_cursor,
        roots: roots.iter().map(ToString::to_string).collect(),
    })
}

pub(crate) fn parse_oid(value: &str) -> Result<Oid, AppError> {
    if value.len() != 40 {
        return Err(AppError::InvalidInput(
            "Expected a complete 40-character commit SHA".into(),
        ));
    }
    Oid::from_str(value).map_err(|_| AppError::InvalidInput("Invalid commit SHA".into()))
}

fn history_roots(repo: &Repository) -> Result<Vec<Oid>, AppError> {
    let mut roots = BTreeSet::new();
    match repo.head() {
        Ok(head) => {
            roots.insert(head.peel_to_commit()?.id());
        }
        Err(error) if matches!(error.code(), ErrorCode::UnbornBranch | ErrorCode::NotFound) => {}
        Err(error) => return Err(error.into()),
    }
    for reference in repo.references()? {
        let reference = reference?;
        if reference.is_branch() || reference.is_remote() || reference.is_tag() {
            match reference.peel_to_commit() {
                Ok(commit) => {
                    roots.insert(commit.id());
                }
                // Tags may legally point at trees or blobs. They have no history.
                Err(error) if reference.is_tag() && error.code() == ErrorCode::InvalidSpec => {}
                Err(error) => return Err(error.into()),
            }
        }
    }
    Ok(roots.into_iter().collect())
}

#[allow(clippy::cast_precision_loss)] // Unix seconds fit exactly within JSON's 53-bit integer range.
pub(crate) fn commit_info(commit: &git2::Commit<'_>) -> CommitInfo {
    let author = commit.author();
    CommitInfo {
        id: commit.id().to_string(),
        parents: commit.parent_ids().map(|id| id.to_string()).collect(),
        summary: String::from_utf8_lossy(commit.summary_bytes().unwrap_or_default()).into_owned(),
        message: String::from_utf8_lossy(commit.message_bytes()).into_owned(),
        author_name: String::from_utf8_lossy(author.name_bytes()).into_owned(),
        author_email: String::from_utf8_lossy(author.email_bytes()).into_owned(),
        author_time: author.when().seconds() as f64,
        commit_time: commit.time().seconds() as f64,
    }
}
