//! Bounded image classification for the file viewers.
//!
//! Classification is based only on bytes and never decodes image pixels.

mod header;
mod read;
mod sniff;

pub(crate) use read::read_blob_image;
pub use read::{
    classify, get_commit_image, CommitImageRequest, ImageFormat, ImageOutcome, ImagePayload,
    ImageVersion, WithheldReason,
};
