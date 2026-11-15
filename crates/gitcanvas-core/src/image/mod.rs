//! Bounded image classification for the file viewers.
//!
//! Classification is based only on bytes and never decodes image pixels.

mod header;
mod read;
mod sniff;

pub use read::{classify, ImageFormat, ImageOutcome, ImagePayload, WithheldReason};
