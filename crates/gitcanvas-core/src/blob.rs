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

/// Maximum content returned without an explicit expansion request.
pub const MAX_INITIAL_CONTENT_BYTES: usize = 2 * 1024 * 1024;

/// Hard maximum for content explicitly requested by the user.
pub const MAX_EXPANDED_CONTENT_BYTES: usize = 32 * 1024 * 1024;

/// The normalized result of reading text from either a commit blob or disk.
///
/// Keeping this behind one helper is the seam that makes binary detection,
/// byte limits, line counts and UTF-8 handling identical for both sources.
#[derive(Debug)]
pub(crate) struct ContentRead {
    pub bytes: String,
    pub lines: u32,
    pub omitted: Option<DiffOmission>,
    pub text: Option<String>,
}

/// Creates a bounded response from a known file size without reading bytes.
pub(crate) fn too_large_content(
    byte_count: u64,
    path: &str,
    expand: bool,
) -> Result<ContentRead, AppError> {
    if expand && byte_count > MAX_EXPANDED_CONTENT_BYTES as u64 {
        return Err(AppError::ResourceLimitExceeded(format!(
            "{path} is {byte_count} bytes; the maximum is {MAX_EXPANDED_CONTENT_BYTES}"
        )));
    }
    Ok(ContentRead {
        bytes: byte_count.to_string(),
        lines: 0,
        omitted: Some(DiffOmission::TooLarge),
        text: None,
    })
}

/// Applies the shared content policy without allocating a copy of an
/// over-sized file.
///
/// # Errors
///
/// Returns a typed resource error when an explicit expansion exceeds the hard
/// maximum.
pub(crate) fn read_content(raw: &[u8], path: &str, expand: bool) -> Result<ContentRead, AppError> {
    let byte_count = raw.len();
    let byte_string = byte_count.to_string();

    if byte_count > MAX_EXPANDED_CONTENT_BYTES {
        return too_large_content(byte_count as u64, path, expand);
    }

    if byte_count > MAX_INITIAL_CONTENT_BYTES && !expand {
        return Ok(ContentRead {
            bytes: byte_string,
            lines: 0,
            omitted: Some(DiffOmission::TooLarge),
            text: None,
        });
    }

    let binary = raw.iter().take(8_000).any(|byte| *byte == 0);
    if binary {
        return Ok(ContentRead {
            bytes: byte_string,
            lines: 0,
            omitted: Some(DiffOmission::Binary),
            text: None,
        });
    }

    let text = String::from_utf8_lossy(raw).into_owned();
    let lines = u32::try_from(text.lines().count()).unwrap_or(u32::MAX);

    if lines > LARGE_FILE_LINE_LIMIT && !expand {
        return Ok(ContentRead {
            bytes: byte_string,
            lines,
            omitted: Some(DiffOmission::TooLarge),
            text: None,
        });
    }

    Ok(ContentRead {
        bytes: byte_string,
        lines,
        omitted: None,
        text: Some(text),
    })
}

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

    // Lossy UTF-8 is intentional: a file with a stray invalid byte remains
    // useful, with a replacement character where the byte was.
    let content = read_content(blob.content(), &request.path, request.expand)?;

    Ok(FileContent {
        path: request.path.clone(),
        commit_id: commit.id().to_string(),
        lines: content.lines,
        bytes: content.bytes,
        omitted: content.omitted,
        text: content.text,
    })
}
