//! GitHub release source selection and release operations.

pub mod assets;
mod cache;
pub mod download;
pub mod list;
mod source;

pub use assets::{get_release_assets, resolve_release_asset, ReleaseAssetInfo, ReleaseAssetList};
pub use list::{get_cached_releases, get_releases, ReleaseInfo, ReleaseList, ReleaseListEntry};
pub(crate) use source::select_source_remote;
pub use source::{select_source, ReleaseSource};
