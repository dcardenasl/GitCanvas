//! GitHub integration.
//!
//! The REST API is used for exactly two things: validating a token and listing
//! the repositories it can reach. Every commit, branch and tag the graph shows
//! comes from a local clone read through libgit2 — one data path, not two.

pub mod api;
pub mod cache;
pub mod clone;
pub mod credentials;
