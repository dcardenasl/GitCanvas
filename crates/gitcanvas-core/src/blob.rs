//! Reading a file's full contents at a commit.
//!
//! The same guards as `diff`: binary content is never returned as text, and a
//! file past a line budget is withheld until it is explicitly asked for. A
//! viewer that happily loads a hundred-megabyte generated bundle is a viewer
//! that freezes.

use git2::Oid;
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{diff::DiffOmission, error::AppError, repository::ActiveRepo};

/// Lines above which a file's contents are withheld until requested.
pub const LARGE_FILE_LINE_LIMIT: u32 = 5_000;

/// A file as it stands at one commit.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FileContent {
    pub path: String,
    pub commit_id: String,
    /// Total lines, available even when the text itself is withheld.
    pub lines: u32,
    /// Size in bytes, as a decimal string; a blob can exceed a JavaScript
    /// integer, and specta refuses to export 64-bit numbers.
    pub bytes: String,
    pub omitted: Option<DiffOmission>,
    /// The text, or `None` whenever `omitted` is set.
    pub text: Option<String>,
}

/// What the caller wants read.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FileContentRequest {
    pub commit_id: String,
    pub path: String,
    /// Return the text even if it exceeds the line budget.
    pub expand: bool,
}

/// Reads one file exactly as it stands in a commit's tree.
///
/// # Errors
///
/// Returns [`AppError`] when the repository cannot be opened, the commit id is
/// malformed or unknown, or the path is not in that commit's tree.
pub fn get_file_content(
    active: &ActiveRepo,
    request: &FileContentRequest,
) -> Result<FileContent, AppError> {
    let repo = active.open()?;
    let oid = Oid::from_str(&request.commit_id)
        .map_err(|_| AppError::InvalidInput("commit id is not a valid object id".to_owned()))?;
    let commit = repo.find_commit(oid)?;
    let tree = commit.tree()?;

    let entry = tree
        .get_path(std::path::Path::new(&request.path))
        .map_err(|_| {
            AppError::InvalidInput(format!("{} is not in this commit's tree", request.path))
        })?;

    let blob = repo.find_blob(entry.id()).map_err(|_| {
        AppError::InvalidInput(format!("{} is not a file at this commit", request.path))
    })?;

    let bytes = blob.content();
    let byte_count = u64::try_from(bytes.len()).unwrap_or(u64::MAX);

    if blob.is_binary() {
        return Ok(FileContent {
            path: request.path.clone(),
            commit_id: commit.id().to_string(),
            lines: 0,
            bytes: byte_count.to_string(),
            omitted: Some(DiffOmission::Binary),
            text: None,
        });
    }

    // Lossy on purpose: a file with a stray invalid byte is still worth reading,
    // and refusing to show it would be less useful than showing a replacement
    // character where the byte was.
    let text = String::from_utf8_lossy(bytes).into_owned();
    let lines = u32::try_from(text.lines().count()).unwrap_or(u32::MAX);

    let withheld = lines > LARGE_FILE_LINE_LIMIT && !request.expand;

    Ok(FileContent {
        path: request.path.clone(),
        commit_id: commit.id().to_string(),
        lines,
        bytes: byte_count.to_string(),
        omitted: withheld.then_some(DiffOmission::TooLarge),
        text: (!withheld).then_some(text),
    })
}
