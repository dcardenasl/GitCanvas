//! GitHub integration.
//!
//! The REST API is used for exactly two things: validating a token and listing
//! the repositories it can reach. Every commit, branch and tag the graph shows
//! comes from a local clone read through libgit2 — one data path, not two.

pub mod api;
pub mod cache;
pub mod clone;
pub mod credentials;

/// The stored token, for building an authenticated client.
///
/// Deliberately not re-exporting `credentials::read_token`: this is the one
/// place the secret leaves the credentials module, and it stays inside the
/// crate boundary that the IPC layer cannot see through.
///
/// # Errors
///
/// Returns [`crate::error::AppError`] when no token is stored.
pub fn api_token() -> Result<String, crate::error::AppError> {
    credentials::read_token()
}
