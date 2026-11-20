//! Author identities and the repository's `.mailmap`.

mod catalog;
pub(crate) mod commits;

pub(crate) use catalog::CatalogCache;
mod identity;

pub use catalog::{
    get_author_catalog_chunk, AuthorCatalogChunk, AuthorCatalogRequest, AuthorCount,
    IncompleteReason, AUTHOR_CATALOG_CHUNK_SIZE, MAX_AUTHOR_IDENTITIES,
};
pub use commits::{get_author_commit_ids, AuthorCommitIdsPage, AuthorCommitIdsRequest};
pub use identity::{load_mailmap, AuthorKey, LoadedMailmap, MailmapWarning, MAX_MAILMAP_BYTES};
