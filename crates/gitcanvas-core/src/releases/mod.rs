//! GitHub release source selection and release operations.

mod source;

pub(crate) use source::select_source_remote;
pub use source::{select_source, ReleaseSource};
