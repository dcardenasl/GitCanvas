//! Author identities and the repository's `.mailmap`.

mod identity;

pub use identity::{load_mailmap, AuthorKey, LoadedMailmap, MailmapWarning, MAX_MAILMAP_BYTES};
