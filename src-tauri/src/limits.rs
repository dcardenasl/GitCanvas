//! Bounds shared by every part of the workspace that names repositories.
//!
//! Defined once so the registry of open repositories, the persisted workspace
//! and the interface (which receives them from the backend rather than keeping
//! its own copy) cannot disagree about what is acceptable.

/// Most repositories that may be open as tabs at once.
pub const MAX_OPEN_TABS: usize = 30;

/// Longest repository path accepted across the IPC boundary or read from disk,
/// in bytes. Matches the largest `PATH_MAX` of the supported platforms.
pub const MAX_PATH_BYTES: usize = 4096;
