//! Resolves stash topology and exact saved delta identity for one short-lived read.

use std::collections::BTreeMap;

use git2::{Commit, Diff, DiffDelta, DiffFile, DiffOptions, FileMode, ObjectType, Oid, Repository};

use super::{
    count, hash_value,
    inspection::{
        StashComparisonMode, StashContentSide, StashFileKind, StashFileOrigin, StashFileSummary,
        StashFileVersion, StashInspection, StashInspectionNotice, StashPreviewUnavailable,
        MAX_STASH_COMPARISON_BLOB_BYTES, MAX_STASH_FILES,
    },
    Cursor,
};
use crate::{blob, diff, error::AppError, repository::validate_relative_path};

pub(super) type FileKey = Cursor;

struct Source<'repo> {
    diff: Diff<'repo>,
    previous: Option<Oid>,
    saved: Oid,
    origin: StashFileOrigin,
}

struct Entry {
    source: usize,
    delta: usize,
    anchor: String,
}

pub(super) struct Comparison<'repo> {
    pub(super) inspection: StashInspection,
    sources: Vec<Source<'repo>>,
    entries: Vec<Entry>,
    sizes: BTreeMap<Oid, usize>,
}

impl<'repo> Comparison<'repo> {
    pub(super) fn load(
        repo: &'repo Repository,
        id: Oid,
        mode: StashComparisonMode,
    ) -> Result<Self, AppError> {
        let stash = repo.find_commit(id)?;
        if !matches!(stash.parent_count(), 2 | 3) {
            return Err(invalid_structure());
        }
        let base = stash.parent(0)?;
        let index = stash.parent(1)?;
        if index.parent_count() != 1 || index.parent_id(0)? != base.id() {
            return Err(invalid_structure());
        }
        let untracked = if stash.parent_count() == 3 {
            let commit = stash.parent(2)?;
            if commit.parent_count() != 0 {
                return Err(invalid_structure());
            }
            Some(commit)
        } else {
            None
        };
        let mut sources = Vec::new();
        match mode {
            StashComparisonMode::All => {
                sources.push(source(repo, Some(&base), &stash, StashFileOrigin::Tracked)?);
            }
            StashComparisonMode::Staged => {
                sources.push(source(repo, Some(&base), &index, StashFileOrigin::Tracked)?);
            }
            StashComparisonMode::Unstaged => sources.push(source(
                repo,
                Some(&index),
                &stash,
                StashFileOrigin::Tracked,
            )?),
            StashComparisonMode::Untracked => {}
        }
        if matches!(
            mode,
            StashComparisonMode::All | StashComparisonMode::Untracked
        ) {
            if let Some(untracked) = &untracked {
                sources.push(source(repo, None, untracked, StashFileOrigin::Untracked)?);
            }
        }
        let raw_count = sources
            .iter()
            .map(|source| source.diff.deltas().len())
            .fold(0usize, usize::saturating_add);
        if raw_count > MAX_STASH_FILES {
            return Err(AppError::ResourceLimitExceeded(format!(
                "Stash comparison changes more than {MAX_STASH_FILES} files"
            )));
        }
        // Inspect headers before any rename search or patch/statistics work.
        let sizes = blob_budget(repo, &sources)?;
        let mut notices = Vec::new();
        for source in &mut sources {
            if source.origin == StashFileOrigin::Tracked {
                let exact_only = source.diff.deltas().any(|delta| oversized(&delta, &sizes));
                if exact_only && !notices.contains(&StashInspectionNotice::RenameSimilaritySkipped)
                {
                    notices.push(StashInspectionNotice::RenameSimilaritySkipped);
                }
                diff::find_renames_with_policy(&mut source.diff, exact_only)?;
            }
        }
        let mut entries = Vec::with_capacity(raw_count);
        for (source_index, source) in sources.iter().enumerate() {
            for (delta_index, delta) in source.diff.deltas().enumerate() {
                validate_delta(&delta)?;
                entries.push(Entry {
                    source: source_index,
                    delta: delta_index,
                    anchor: delta_anchor(source.origin, &delta)?,
                });
            }
        }
        let common = repo.commondir().canonicalize()?;
        let revision = hash_value(&(
            "stash-files-v1",
            common.as_os_str().as_encoded_bytes(),
            id.to_string(),
            mode,
            entries
                .iter()
                .map(|entry| &entry.anchor)
                .collect::<Vec<_>>(),
        ))?;
        Ok(Self {
            inspection: StashInspection {
                stash_id: id.to_string(),
                base_commit_id: base.id().to_string(),
                index_commit_id: index.id().to_string(),
                untracked_commit_id: untracked.as_ref().map(Commit::id).map(|id| id.to_string()),
                mode,
                revision,
                notices,
            },
            sources,
            entries,
            sizes,
        })
    }

    pub(super) fn len(&self) -> usize {
        self.entries.len()
    }

    pub(super) fn anchor(&self, index: usize) -> Result<String, AppError> {
        let entry = self.entries.get(index).ok_or_else(stale_key)?;
        // Include position so even identical entries cannot mask a changed offset.
        hash_value(&(index, &entry.anchor))
    }

    fn key(&self, index: usize) -> Result<String, AppError> {
        serde_json::to_string(&Cursor {
            version: 1,
            scope: self.inspection.revision.clone(),
            position: count(index.saturating_add(1))?,
            anchor: self.anchor(index)?,
        })
        .map_err(|error| AppError::Internal(error.to_string()))
    }

    pub(super) fn resolve_key(&self, key: &FileKey) -> Result<usize, AppError> {
        let index = key.position.saturating_sub(1) as usize;
        if key.scope != self.inspection.revision || self.anchor(index)? != key.anchor {
            return Err(stale_key());
        }
        Ok(index)
    }

    fn entry(&self, index: usize) -> Result<(&Source<'repo>, &Entry, DiffDelta<'_>), AppError> {
        let entry = self.entries.get(index).ok_or_else(stale_key)?;
        let source = self.sources.get(entry.source).ok_or_else(stale_key)?;
        let delta = source.diff.get_delta(entry.delta).ok_or_else(stale_key)?;
        Ok((source, entry, delta))
    }

    pub(super) fn version(
        &self,
        index: usize,
        side: StashContentSide,
    ) -> Result<Option<StashFileVersion>, AppError> {
        let (source, _, delta) = self.entry(index)?;
        let (file, commit) = match side {
            StashContentSide::Previous => (delta.old_file(), source.previous),
            StashContentSide::Saved => (delta.new_file(), Some(source.saved)),
        };
        let Some(commit) =
            commit.filter(|_| !file.id().is_zero() && file.mode() != FileMode::Unreadable)
        else {
            return Ok(None);
        };
        let path = file
            .path_bytes()
            .unwrap_or_else(|| diff::delta_path(&delta));
        let text = String::from_utf8_lossy(path);
        let lossy = matches!(text, std::borrow::Cow::Owned(_));
        Ok(Some(StashFileVersion {
            commit_id: commit.to_string(),
            object_id: file.id().to_string(),
            path: text.into_owned(),
            path_lossy: lossy,
            kind: kind(file.mode()),
        }))
    }

    pub(super) fn read_file(
        &self,
        index: usize,
        expand: bool,
        include_patch: bool,
    ) -> Result<(StashFileSummary, Option<String>), AppError> {
        let (source, entry, delta) = self.entry(index)?;
        let previous = self.version(index, StashContentSide::Previous)?;
        let saved = self.version(index, StashContentSide::Saved)?;
        let preview_unavailable = preview_unavailable(previous.as_ref(), saved.as_ref());
        let too_large = oversized(&delta, &self.sizes);
        let (file, patch, stats_available) = if preview_unavailable.is_some() || too_large {
            let mut file = diff::delta_summary(&delta);
            if too_large {
                file.omitted = Some(diff::DiffOmission::TooLarge);
            }
            (file, None, false)
        } else {
            let result = diff::collect_file_at(&source.diff, entry.delta, expand, include_patch)?;
            let stats_available = result.omitted != Some(diff::DiffOmission::Binary);
            (result.summary, result.patch, stats_available)
        };
        Ok((
            StashFileSummary {
                key: self.key(index)?,
                origin: source.origin,
                file,
                stats_available,
                previous,
                saved,
                preview_unavailable,
            },
            patch,
        ))
    }
}

fn source<'repo>(
    repo: &'repo Repository,
    previous: Option<&Commit<'_>>,
    saved: &Commit<'_>,
    origin: StashFileOrigin,
) -> Result<Source<'repo>, AppError> {
    let before_tree = previous.map(Commit::tree).transpose()?;
    let after_tree = saved.tree()?;
    let mut options = DiffOptions::new();
    options
        .include_typechange(true)
        .ignore_submodules(false)
        .skip_binary_check(true)
        .context_lines(3)
        .max_size(
            i64::try_from(blob::MAX_EXPANDED_CONTENT_BYTES)
                .map_err(|_| AppError::Internal("Blob limit cannot be represented".into()))?,
        );
    let diff =
        repo.diff_tree_to_tree(before_tree.as_ref(), Some(&after_tree), Some(&mut options))?;
    Ok(Source {
        diff,
        previous: previous.map(Commit::id),
        saved: saved.id(),
        origin,
    })
}

fn blob_budget(
    repo: &Repository,
    sources: &[Source<'_>],
) -> Result<BTreeMap<Oid, usize>, AppError> {
    let odb = repo.odb()?;
    let mut sizes = BTreeMap::new();
    let mut total = 0usize;
    for delta in sources.iter().flat_map(|source| source.diff.deltas()) {
        validate_delta(&delta)?;
        for file in [delta.old_file(), delta.new_file()] {
            if !is_blob(&file) || sizes.contains_key(&file.id()) {
                continue;
            }
            let (size, object_kind) = odb.read_header(file.id())?;
            if object_kind != ObjectType::Blob {
                return Err(AppError::Git(
                    "Saved file mode does not match its object kind".into(),
                ));
            }
            if size <= blob::MAX_EXPANDED_CONTENT_BYTES {
                total = total.saturating_add(size);
                if total > MAX_STASH_COMPARISON_BLOB_BYTES as usize {
                    return Err(AppError::ResourceLimitExceeded(format!("Stash comparison exceeds {MAX_STASH_COMPARISON_BLOB_BYTES} unique readable blob bytes")));
                }
            }
            sizes.insert(file.id(), size);
        }
    }
    Ok(sizes)
}

fn is_blob(file: &DiffFile<'_>) -> bool {
    !file.id().is_zero()
        && matches!(
            kind(file.mode()),
            StashFileKind::Blob | StashFileKind::Symlink
        )
}

fn oversized(delta: &DiffDelta<'_>, sizes: &BTreeMap<Oid, usize>) -> bool {
    [delta.old_file(), delta.new_file()].iter().any(|file| {
        sizes
            .get(&file.id())
            .is_some_and(|size| *size > blob::MAX_EXPANDED_CONTENT_BYTES)
    })
}

fn kind(mode: FileMode) -> StashFileKind {
    match mode {
        FileMode::Blob | FileMode::BlobExecutable | FileMode::BlobGroupWritable => {
            StashFileKind::Blob
        }
        FileMode::Link => StashFileKind::Symlink,
        FileMode::Commit => StashFileKind::Submodule,
        _ => StashFileKind::Other,
    }
}

fn preview_unavailable(
    previous: Option<&StashFileVersion>,
    saved: Option<&StashFileVersion>,
) -> Option<StashPreviewUnavailable> {
    let versions = [previous, saved];
    if versions
        .iter()
        .flatten()
        .any(|version| version.kind == StashFileKind::Submodule)
    {
        Some(StashPreviewUnavailable::Submodule)
    } else if versions
        .iter()
        .flatten()
        .any(|version| version.kind == StashFileKind::Other)
    {
        Some(StashPreviewUnavailable::UnsupportedEntry)
    } else {
        None
    }
}

fn validate_delta(delta: &DiffDelta<'_>) -> Result<(), AppError> {
    for path in [delta.old_file().path_bytes(), delta.new_file().path_bytes()]
        .into_iter()
        .flatten()
    {
        if path.is_empty()
            || path.len() > crate::workspace::MAX_PATH_BYTES
            || path.starts_with(b"/")
            || path.contains(&0)
            || path.split(|byte| *byte == b'/').any(|component| {
                component.is_empty() || matches!(component, b"." | b".." | b".git")
            })
        {
            return Err(AppError::InvalidInput(
                "Saved file path is not a canonical bounded repository-relative path".into(),
            ));
        }
        if let Ok(text) = std::str::from_utf8(path) {
            validate_relative_path(text)?;
        }
    }
    Ok(())
}

fn delta_anchor(origin: StashFileOrigin, delta: &DiffDelta<'_>) -> Result<String, AppError> {
    hash_value(&(
        origin,
        delta.old_file().path_bytes(),
        delta.new_file().path_bytes(),
        delta.old_file().id().to_string(),
        delta.new_file().id().to_string(),
        u32::from(delta.old_file().mode()),
        u32::from(delta.new_file().mode()),
    ))
}

fn invalid_structure() -> AppError {
    AppError::InvalidInput("Expected a stash with base/index parents, an index child of the base and an optional root untracked commit".into())
}

fn stale_key() -> AppError {
    AppError::StaleCursor("Saved file key does not belong to this comparison".into())
}
