//! Author identity: the pair (name, email) after `.mailmap` resolution.
//!
//! No other merging happens: not by letter case, not by name, not by similarity
//! (ADR 0011). The `.mailmap` comes from the working tree, or from `HEAD` when
//! the working tree has none. The `mailmap.file` and `mailmap.blob` config keys
//! are never consulted, so no arbitrary path is read.

use std::{
    fmt::Write as _,
    fs::{self, File},
    io::Read,
};

use git2::{Mailmap, Repository, Signature};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use specta::Type;

/// Largest `.mailmap` that is read, in bytes. Checked before reading.
pub const MAX_MAILMAP_BYTES: usize = 1024 * 1024;

const MAILMAP_NAME: &str = ".mailmap";

/// The identity of one author after `.mailmap` resolution.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize, Type)]
pub struct AuthorKey {
    /// Canonical display name.
    pub name: String,
    /// Canonical email, exactly as written (case is preserved).
    pub email: String,
}

/// Why the `.mailmap` was not applied even though one exists.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum MailmapWarning {
    /// The file is too large, not a regular file, not UTF-8 or could not be read.
    Unreadable,
}

/// The effective `.mailmap` of a repository, ready to resolve identities.
pub struct LoadedMailmap {
    map: Option<Mailmap>,
    hash: String,
    warning: Option<MailmapWarning>,
}

impl std::fmt::Debug for LoadedMailmap {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LoadedMailmap")
            .field("mapped", &self.map.is_some())
            .field("hash", &self.hash)
            .field("warning", &self.warning)
            .finish()
    }
}

impl LoadedMailmap {
    fn without_map(content: &[u8], warning: Option<MailmapWarning>) -> Self {
        Self {
            map: None,
            hash: hash_hex(content),
            warning,
        }
    }

    /// Resolves a commit signature to its identity. Falls back to the raw pair
    /// when no mapping applies or libgit2 cannot represent the signature.
    #[must_use]
    pub fn resolve(&self, name: &str, email: &str) -> AuthorKey {
        let raw = || AuthorKey {
            name: name.to_owned(),
            email: email.to_owned(),
        };
        let Some(map) = &self.map else {
            return raw();
        };
        let Ok(signature) = Signature::now(name, email) else {
            return raw();
        };
        match map.resolve_signature(&signature) {
            Ok(resolved) => match (resolved.name(), resolved.email()) {
                (Ok(name), Ok(email)) => AuthorKey {
                    name: name.to_owned(),
                    email: email.to_owned(),
                },
                _ => raw(),
            },
            Err(_) => raw(),
        }
    }

    pub(crate) fn resolve_bytes(&self, name: &[u8], email: &[u8]) -> AuthorKey {
        match (std::str::from_utf8(name), std::str::from_utf8(email)) {
            (Ok(name), Ok(email)) => self.resolve(name, email),
            _ => AuthorKey {
                name: encode_signature_field(name),
                email: encode_signature_field(email),
            },
        }
    }

    /// SHA-256 (hex) of the effective content; empty content when there is none.
    /// Part of the cursor scope: when it changes, cursors are stale.
    #[must_use]
    pub fn content_hash(&self) -> &str {
        &self.hash
    }

    /// Set when a `.mailmap` exists but could not be applied.
    #[must_use]
    pub fn warning(&self) -> Option<MailmapWarning> {
        self.warning
    }
}

fn encode_signature_field(bytes: &[u8]) -> String {
    if let Ok(text) = std::str::from_utf8(bytes) {
        return text.to_owned();
    }
    // A Git signature cannot contain NUL. Prefixing hex with NUL preserves
    // malformed identities without colliding with a valid signature.
    let mut encoded = String::from("\0");
    for byte in bytes {
        let _ = write!(encoded, "{byte:02x}");
    }
    encoded
}

/// Loads the effective `.mailmap`. Never fails: problems become a warning and
/// identities stay unmapped.
#[must_use]
pub fn load_mailmap(repo: &Repository) -> LoadedMailmap {
    match read_content(repo) {
        Ok(None) => LoadedMailmap::without_map(b"", None),
        Ok(Some(content)) => match std::str::from_utf8(&content)
            .ok()
            .and_then(|text| Mailmap::from_buffer(text).ok())
        {
            Some(map) => LoadedMailmap {
                map: Some(map),
                hash: hash_hex(&content),
                warning: None,
            },
            None => LoadedMailmap::without_map(&content, Some(MailmapWarning::Unreadable)),
        },
        Err(()) => LoadedMailmap::without_map(b"", Some(MailmapWarning::Unreadable)),
    }
}

/// `Ok(None)`: no `.mailmap` anywhere. `Err`: one exists but cannot be used.
fn read_content(repo: &Repository) -> Result<Option<Vec<u8>>, ()> {
    if let Some(workdir) = repo.workdir() {
        let path = workdir.join(MAILMAP_NAME);
        match fs::symlink_metadata(&path) {
            Ok(meta) => {
                // A symlink could point outside the repository.
                if !meta.file_type().is_file()
                    || usize::try_from(meta.len()).map_or(true, |len| len > MAX_MAILMAP_BYTES)
                {
                    return Err(());
                }
                // The cap is enforced again while reading in case the file grew.
                let mut content = Vec::new();
                File::open(&path)
                    .map_err(|_| ())?
                    .take(
                        u64::try_from(MAX_MAILMAP_BYTES)
                            .unwrap_or(u64::MAX)
                            .saturating_add(1),
                    )
                    .read_to_end(&mut content)
                    .map_err(|_| ())?;
                return if content.len() > MAX_MAILMAP_BYTES {
                    Err(())
                } else {
                    Ok(Some(content))
                };
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err(()),
        }
    }
    read_head_blob(repo)
}

fn read_head_blob(repo: &Repository) -> Result<Option<Vec<u8>>, ()> {
    // An unborn or unreadable HEAD simply has no `.mailmap`.
    let Ok(tree) = repo.head().and_then(|head| head.peel_to_tree()) else {
        return Ok(None);
    };
    let Ok(entry) = tree.get_path(std::path::Path::new(MAILMAP_NAME)) else {
        return Ok(None);
    };
    // The size is read from the object header, before loading the content.
    let (size, kind) = repo
        .odb()
        .and_then(|odb| odb.read_header(entry.id()))
        .map_err(|_| ())?;
    if kind != git2::ObjectType::Blob || size > MAX_MAILMAP_BYTES {
        return Err(());
    }
    let blob = repo.find_blob(entry.id()).map_err(|_| ())?;
    Ok(Some(blob.content().to_vec()))
}

fn hash_hex(content: &[u8]) -> String {
    use std::fmt::Write as _;
    Sha256::digest(content)
        .iter()
        .fold(String::with_capacity(64), |mut out, byte| {
            let _ = write!(out, "{byte:02x}");
            out
        })
}
