//! The persisted workspace: which projects are open, how each one was left, and
//! which are favorites or recent.
//!
//! This module is the *shape* of that data and the rules it must satisfy. The
//! file it lives in is [`store`]. Nothing here grants access to anything: a path
//! in a workspace is a name the interface may later ask to open, and opening it
//! goes through the same authorization as any other path.
//!
//! One set of rules ([`Workspace::validate`]) guards both directions. Data read
//! from disk is untrusted — a person or another program can edit the file — and
//! data received from the interface is untrusted too, so neither is written
//! to nor kept in memory without passing the same checks.

pub mod store;

use std::{collections::BTreeSet, path::Path};

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{error::AppError, worktree::WorktreeSide};

/// Most projects that may be open as tabs at once.
pub const MAX_TABS: usize = 30;
/// Most favorite projects kept.
pub const MAX_FAVORITES: usize = 200;
/// Most recent projects kept.
pub const MAX_RECENTS: usize = 20;
/// Most collapsed folders remembered for one tab.
pub const MAX_COLLAPSED_FOLDERS: usize = 500;
/// Longest path accepted, in bytes. Matches the largest `PATH_MAX` of the
/// supported platforms.
pub const MAX_PATH_BYTES: usize = 4096;
/// Length of a full commit id, in hexadecimal digits.
const COMMIT_ID_LENGTH: usize = 40;

/// What a tab was showing when it was saved.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum SavedSelection {
    /// The commit history itself.
    History,
    /// A commit and, optionally, one of its files.
    Commit {
        /// Full id of the selected commit.
        commit_id: String,
        /// Repository-relative path of the selected file, if any.
        file_path: Option<String>,
        /// Whether the file is shown whole rather than as a diff.
        snapshot: bool,
    },
    /// One side of the working tree and, optionally, one of its files.
    Worktree {
        /// The side shown.
        side: WorktreeSide,
        /// Repository-relative path of the selected file, if any.
        file_path: Option<String>,
    },
}

/// One open project and how its view was left.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields)]
pub struct TabRecord {
    /// Canonical working-tree root of the project.
    pub path: String,
    /// The selection to return to.
    pub selection: SavedSelection,
    /// Full id of the commit the history was scrolled to, if any.
    pub history_anchor: Option<String>,
    /// Repository-relative paths of the folders collapsed in the file lists.
    pub collapsed_folders: Vec<String>,
}

/// Named palette identity, independent of theme and lane position.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum GraphColor {
    /// Amber palette pair.
    Amber,
    /// Teal palette pair.
    Teal,
    /// Violet palette pair.
    Violet,
    /// Blue palette pair.
    Blue,
    /// Rose palette pair.
    Rose,
    /// Green palette pair.
    Green,
    /// Gold palette pair.
    Gold,
    /// Stone palette pair.
    Stone,
}

/// Durable color for a full reference, retained while the reference is absent.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields)]
pub struct ReferenceColor {
    /// Full branch reference name.
    pub reference: String,
    /// Named palette identity.
    pub color: GraphColor,
    /// Last explicit edit, zero for automatic assignments.
    pub edited: u32,
}

/// Graph preferences belong to a canonical worktree, not its open tab.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields)]
pub struct GraphPreferences {
    /// Canonical project root; does not authorize repository access.
    pub path: String,
    /// Explicit principal; absent means local automatic detection.
    pub principal: Option<String>,
    /// Monotonic explicit color edit sequence.
    pub revision: u32,
    /// Assignments, including references temporarily absent from Git.
    pub colors: Vec<ReferenceColor>,
}

/// Maximum projects retaining graph preferences independently of tabs.
pub const MAX_GRAPH_PROJECTS: usize = 200;
/// Maximum remembered references per project.
pub const MAX_GRAPH_REFERENCES: usize = 10_000;

/// Everything the application remembers between runs about its projects.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields)]
pub struct Workspace {
    /// Open projects, in tab order.
    pub tabs: Vec<TabRecord>,
    /// Path of the active tab; it must be one of `tabs`.
    pub active: Option<String>,
    /// Favorite projects, unordered: the interface orders them for display.
    pub favorites: Vec<String>,
    /// Recent projects, most recently used first.
    pub recents: Vec<String>,
    /// Graph preferences survive closing their project.
    pub graph_preferences: Vec<GraphPreferences>,
}

/// The bounds the workspace is held to, sent to the interface so it never keeps
/// a second copy of them. They do not depend on what is stored, so they are
/// available even when the stored workspace could not be read.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct WorkspaceLimits {
    /// Most tabs open at once.
    pub max_tabs: u32,
    /// Most favorites kept.
    pub max_favorites: u32,
    /// Most recents kept.
    pub max_recents: u32,
    /// Maximum projects with graph preferences.
    pub max_graph_projects: u32,
    /// Maximum reference preferences per project.
    pub max_graph_references: u32,
}

impl WorkspaceLimits {
    /// The limits this build enforces.
    #[must_use]
    pub fn current() -> Self {
        let as_u32 = |value: usize| u32::try_from(value).unwrap_or(u32::MAX);
        Self {
            max_tabs: as_u32(MAX_TABS),
            max_favorites: as_u32(MAX_FAVORITES),
            max_recents: as_u32(MAX_RECENTS),
            max_graph_projects: as_u32(MAX_GRAPH_PROJECTS),
            max_graph_references: as_u32(MAX_GRAPH_REFERENCES),
        }
    }
}

fn invalid(message: impl Into<String>) -> AppError {
    AppError::InvalidInput(format!("invalid workspace: {}", message.into()))
}

/// An absolute, NUL-free path within the length bound.
///
/// Absoluteness is checked because every path stored here was a canonical root;
/// a relative one could only come from damage or tampering, and would resolve
/// against whatever directory the process happens to be in.
fn check_project_path(what: &str, value: &str) -> Result<(), AppError> {
    if value.is_empty() || value.len() > MAX_PATH_BYTES || value.contains('\0') {
        return Err(invalid(format!("{what} is not a usable path")));
    }
    if !Path::new(value).is_absolute() {
        return Err(invalid(format!("{what} is not an absolute path")));
    }
    Ok(())
}

/// A non-empty, NUL-free path inside a repository, within the length bound.
fn check_repository_path(what: &str, value: &str) -> Result<(), AppError> {
    if value.is_empty() || value.len() > MAX_PATH_BYTES || value.contains('\0') {
        return Err(invalid(format!("{what} is not a usable path")));
    }
    Ok(())
}

/// A full commit id: exactly 40 hexadecimal digits, as every command requires.
fn check_commit_id(what: &str, value: &str) -> Result<(), AppError> {
    if value.len() == COMMIT_ID_LENGTH && value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err(invalid(format!("{what} is not a full commit id")))
    }
}

/// Checks a list of project paths: bounded, valid and without repeats.
fn check_project_list(what: &str, values: &[String], max: usize) -> Result<(), AppError> {
    if values.len() > max {
        return Err(invalid(format!("{what} has more than {max} entries")));
    }
    let mut seen = BTreeSet::new();
    for value in values {
        check_project_path(what, value)?;
        if !seen.insert(value.as_str()) {
            return Err(invalid(format!("{what} lists a project twice")));
        }
    }
    Ok(())
}

impl SavedSelection {
    fn validate(&self) -> Result<(), AppError> {
        match self {
            Self::History => Ok(()),
            Self::Commit {
                commit_id,
                file_path,
                snapshot: _,
            } => {
                check_commit_id("a selected commit", commit_id)?;
                file_path.as_deref().map_or(Ok(()), |path| {
                    check_repository_path("a selected file", path)
                })
            }
            Self::Worktree { side: _, file_path } => file_path.as_deref().map_or(Ok(()), |path| {
                check_repository_path("a selected file", path)
            }),
        }
    }
}

impl TabRecord {
    fn validate(&self) -> Result<(), AppError> {
        check_project_path("a tab", &self.path)?;
        self.selection.validate()?;
        if let Some(anchor) = &self.history_anchor {
            check_commit_id("a history anchor", anchor)?;
        }
        if self.collapsed_folders.len() > MAX_COLLAPSED_FOLDERS {
            return Err(invalid(format!(
                "a tab collapses more than {MAX_COLLAPSED_FOLDERS} folders"
            )));
        }
        self.collapsed_folders
            .iter()
            .try_for_each(|folder| check_repository_path("a collapsed folder", folder))
    }
}

impl Workspace {
    /// Checks every rule the workspace must satisfy.
    ///
    /// # Errors
    /// Returns [`AppError::InvalidInput`] naming the first rule broken: a bound
    /// exceeded, a malformed path or commit id, a repeated project, or an active
    /// tab that is not among the tabs.
    pub fn validate(&self) -> Result<(), AppError> {
        if self.tabs.len() > MAX_TABS {
            return Err(invalid(format!("more than {MAX_TABS} tabs are open")));
        }
        let mut seen = BTreeSet::new();
        for tab in &self.tabs {
            tab.validate()?;
            if !seen.insert(tab.path.as_str()) {
                return Err(invalid("a project is open in two tabs"));
            }
        }
        if let Some(active) = &self.active {
            if !seen.contains(active.as_str()) {
                return Err(invalid("the active tab is not one of the tabs"));
            }
        }
        check_project_list("the favorites", &self.favorites, MAX_FAVORITES)?;
        check_project_list("the recents", &self.recents, MAX_RECENTS)?;
        if self.graph_preferences.len() > MAX_GRAPH_PROJECTS {
            return Err(invalid("too many graph projects"));
        }
        let mut roots = BTreeSet::new();
        for preferences in &self.graph_preferences {
            check_project_path("graph preferences", &preferences.path)?;
            if !roots.insert(&preferences.path) || preferences.colors.len() > MAX_GRAPH_REFERENCES {
                return Err(invalid(
                    "duplicate graph project or too many reference colors",
                ));
            }
            let check_ref = |value: &str| -> Result<(), AppError> {
                if value.len() > MAX_PATH_BYTES
                    || !git2::Reference::is_valid_name(value)
                    || !(value.starts_with("refs/heads/") || value.starts_with("refs/remotes/"))
                {
                    return Err(invalid("invalid graph branch identity"));
                }
                Ok(())
            };
            if let Some(principal) = &preferences.principal {
                check_ref(principal)?;
            }
            let mut references = BTreeSet::new();
            for color in &preferences.colors {
                check_ref(&color.reference)?;
                if !references.insert(&color.reference) || color.edited > preferences.revision {
                    return Err(invalid("duplicate color or invalid edit sequence"));
                }
            }
        }
        Ok(())
    }
}
