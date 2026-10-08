//! Reading a file's full contents at a commit.
//!
//! The same guards as `diff`: binary content is never returned as text, and a
//! file past a line budget is withheld until it is explicitly asked for. A
//! viewer that happily loads a hundred-megabyte generated bundle is a viewer
//! that freezes.

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{
    diff::DiffOmission,
    error::AppError,
    repository::{parse_commit_id, ActiveRepo},
};

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

/// Checks a Git blob's recorded size before asking libgit2 for its content.
pub(crate) fn read_blob_content(
    blob: &git2::Blob<'_>,
    path: &str,
    expand: bool,
) -> Result<ContentRead, AppError> {
    let byte_count = blob.size();
    if byte_count > MAX_EXPANDED_CONTENT_BYTES
        || (!expand && byte_count > MAX_INITIAL_CONTENT_BYTES)
    {
        return too_large_content(u64::try_from(byte_count).unwrap_or(u64::MAX), path, expand);
    }
    read_content(blob.content(), path, expand)
}

/// Shared repository-relative file content and read-limit metadata.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FileContentFields {
    /// Repository-relative path of the file.
    pub path: String,
    /// Total lines, available even when the text itself is withheld.
    pub lines: u32,
    /// Size in bytes, as a decimal string; a blob can exceed a JavaScript
    /// integer, and specta refuses to export 64-bit numbers.
    pub bytes: String,
    /// Why `text` was withheld, if it was not returned.
    pub omitted: Option<DiffOmission>,
    /// The text, or `None` whenever `omitted` is set.
    pub text: Option<String>,
}

/// A file as it stands at one commit.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FileContent {
    /// Shared file content and bounded-read metadata.
    #[serde(flatten)]
    pub fields: FileContentFields,
    /// Commit that supplies the file contents.
    pub commit_id: String,
}

impl std::ops::Deref for FileContent {
    type Target = FileContentFields;

    fn deref(&self) -> &Self::Target {
        &self.fields
    }
}

/// What the caller wants read.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FileContentRequest {
    /// Commit from which to read the file.
    pub commit_id: String,
    /// Repository-relative path to read.
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
    let oid = parse_commit_id(&request.commit_id)?;
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
    let content = read_blob_content(&blob, &request.path, request.expand)?;

    Ok(FileContent {
        fields: FileContentFields {
            path: request.path.clone(),
            lines: content.lines,
            bytes: content.bytes,
            omitted: content.omitted,
            text: content.text,
        },
        commit_id: commit.id().to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::{DiffOmission, FileContent, FileContentFields};

    #[test]
    fn file_content_flattens_shared_fields_on_the_wire() {
        let content = FileContent {
            fields: FileContentFields {
                path: "README.md".to_owned(),
                lines: 3,
                bytes: "12".to_owned(),
                omitted: Some(DiffOmission::TooLarge),
                text: None,
            },
            commit_id: "abc123".to_owned(),
        };

        assert_eq!(
            serde_json::to_value(content).unwrap(),
            serde_json::json!({
                "path": "README.md",
                "commit_id": "abc123",
                "lines": 3,
                "bytes": "12",
                "omitted": "TooLarge",
                "text": null
            })
        );
    }
}
