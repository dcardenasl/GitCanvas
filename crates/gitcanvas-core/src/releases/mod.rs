//! GitHub release source selection and release operations.

mod cache;
pub mod download;
pub mod list;
mod source;

pub use list::{get_releases, ReleaseInfo, ReleaseList, ReleaseListEntry};
pub(crate) use source::select_source_remote;
pub use source::{select_source, ReleaseSource};
