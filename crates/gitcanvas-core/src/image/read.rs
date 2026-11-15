use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{
    blob::{bounded_bytes, BoundedBytes, MAX_EXPANDED_CONTENT_BYTES, MAX_INITIAL_CONTENT_BYTES},
    error::AppError,
};

use super::{header, sniff};

/// Supported image format determined from its leading bytes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum ImageFormat {
    /// Portable Network Graphics.
    Png,
    /// Joint Photographic Experts Group.
    Jpeg,
    /// Graphics Interchange Format.
    Gif,
    /// Web Picture.
    Webp,
    /// Bitmap image.
    Bmp,
    /// Windows icon container.
    Ico,
    /// Isolated Scalable Vector Graphics.
    Svg,
}

/// Why a recognized image was withheld from the webview.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum WithheldReason {
    /// The recognized container did not expose usable dimensions.
    UnreadableHeader,
    /// The declared pixel count exceeds the safety limit.
    TooManyPixels,
}

/// Image bytes and metadata safe to pass through the bounded IPC contract.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ImagePayload {
    /// Detected format.
    pub format: ImageFormat,
    /// Stored width, if available from the header.
    pub width: Option<u32>,
    /// Stored height, if available from the header.
    pub height: Option<u32>,
    /// Byte count as a decimal string.
    pub bytes: String,
    /// Whether the container advertises multiple frames.
    pub animated: bool,
    /// Standard base64 of the exact bounded bytes.
    pub data: String,
}

/// Result of classifying a bounded file version.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ImageOutcome {
    /// This version is absent.
    Missing,
    /// This version is not a regular blob.
    Unsupported,
    /// The bytes are not a supported image.
    NotImage {
        /// Size of the inspected bytes.
        bytes: String,
    },
    /// The content exceeds the initial budget.
    TooLarge {
        /// Total size, without returning content.
        bytes: String,
    },
    /// Recognized bytes are withheld because safe metadata is unavailable.
    Withheld {
        /// Detected container format.
        format: ImageFormat,
        /// Total size.
        bytes: String,
        /// Stored width when readable.
        width: Option<u32>,
        /// Stored height when readable.
        height: Option<u32>,
        /// Why bytes were not returned.
        reason: WithheldReason,
    },
    /// An image and its metadata.
    Image {
        /// Safe metadata and base64 content.
        image: ImagePayload,
    },
}

/// Which side of an image comparison a request reads.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum ImageVersion {
    /// The version before the selected change.
    Previous,
    /// The version after the selected change.
    Saved,
}

/// Image read for a commit and its first parent.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CommitImageRequest {
    /// Commit whose tree is the saved version.
    pub commit_id: String,
    /// Repository relative path.
    pub path: String,
    /// Previous path for a detected rename.
    pub previous_path: Option<String>,
    /// Requested comparison side.
    pub version: ImageVersion,
    /// Whether to use the explicit expanded byte budget.
    pub expand: bool,
}

/// Reads an image from a selected commit side.
///
/// # Errors
/// Returns repository, invalid commit/path, Git object, or resource-limit errors.
pub fn get_commit_image(
    active: &crate::repository::ActiveRepo,
    request: &CommitImageRequest,
) -> Result<ImageOutcome, AppError> {
    use crate::repository::{parse_commit_id, validate_relative_path};
    use std::path::Path;

    validate_relative_path(&request.path)?;
    if let Some(previous_path) = request.previous_path.as_deref() {
        validate_relative_path(previous_path)?;
    }
    let repo = active.open()?;
    let commit = repo.find_commit(parse_commit_id(&request.commit_id)?)?;
    let (tree, path) = match request.version {
        ImageVersion::Saved => (commit.tree()?, request.path.as_str()),
        ImageVersion::Previous => {
            let Some(parent) = commit.parent(0).ok() else {
                return Ok(ImageOutcome::Missing);
            };
            (
                parent.tree()?,
                request.previous_path.as_deref().unwrap_or(&request.path),
            )
        }
    };
    let Ok(entry) = tree.get_path(Path::new(path)) else {
        return Ok(ImageOutcome::Missing);
    };
    if entry.kind() != Some(git2::ObjectType::Blob) || entry.filemode() == 0o120_000 {
        return Ok(ImageOutcome::Unsupported);
    }
    read_blob_image(&repo, entry.id(), path, request.expand)
}

pub(crate) fn read_blob_image(
    repo: &git2::Repository,
    id: git2::Oid,
    path: &str,
    expand: bool,
) -> Result<ImageOutcome, AppError> {
    let (size, kind) = repo.odb()?.read_header(id)?;
    if kind != git2::ObjectType::Blob {
        return Ok(ImageOutcome::Unsupported);
    }
    let size = u64::try_from(size).unwrap_or(u64::MAX);
    let maximum = if expand {
        MAX_EXPANDED_CONTENT_BYTES
    } else {
        MAX_INITIAL_CONTENT_BYTES
    };
    if size > maximum as u64 {
        if expand && size > MAX_EXPANDED_CONTENT_BYTES as u64 {
            return Err(AppError::ResourceLimitExceeded(format!(
                "{path} is {size} bytes; the maximum is {MAX_EXPANDED_CONTENT_BYTES}"
            )));
        }
        return Ok(ImageOutcome::TooLarge {
            bytes: size.to_string(),
        });
    }
    let blob = repo.find_blob(id)?;
    classify(blob.content(), path, expand)
}

/// Classifies bytes without I/O, path inspection, or pixel decoding.
///
/// # Errors
/// Returns a resource-limit error if an expanded read exceeds the hard cap.
pub fn classify(raw: &[u8], path: &str, expand: bool) -> Result<ImageOutcome, AppError> {
    let bytes = match bounded_bytes(raw, path, expand)? {
        BoundedBytes::TooLarge(size) => {
            return Ok(ImageOutcome::TooLarge {
                bytes: size.to_string(),
            })
        }
        BoundedBytes::Bytes(bytes) => bytes,
    };
    let raw = bytes.as_ref();
    let byte_count = raw.len().to_string();
    let Some(format) = sniff::sniff(raw) else {
        return Ok(ImageOutcome::NotImage { bytes: byte_count });
    };
    if format == ImageFormat::Svg {
        return Ok(ImageOutcome::Image {
            image: ImagePayload {
                format,
                width: None,
                height: None,
                bytes: byte_count,
                animated: false,
                data: STANDARD.encode(raw),
            },
        });
    }
    let Some((width, height)) = header::dimensions(format, raw) else {
        return Ok(ImageOutcome::Withheld {
            format,
            bytes: byte_count,
            width: None,
            height: None,
            reason: WithheldReason::UnreadableHeader,
        });
    };
    let pixels = u64::from(width).saturating_mul(u64::from(height));
    if pixels > 40_000_000 {
        return Ok(ImageOutcome::Withheld {
            format,
            bytes: byte_count,
            width: Some(width),
            height: Some(height),
            reason: WithheldReason::TooManyPixels,
        });
    }
    Ok(ImageOutcome::Image {
        image: ImagePayload {
            format,
            width: Some(width),
            height: Some(height),
            bytes: byte_count,
            animated: header::animated(format, raw),
            data: STANDARD.encode(raw),
        },
    })
}

#[cfg(test)]
mod tests {
    use super::{classify, ImageFormat, ImageOutcome, WithheldReason};
    use base64::Engine;

    fn png(width: u32, height: u32) -> Vec<u8> {
        let mut bytes = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR".to_vec();
        bytes.extend_from_slice(&width.to_be_bytes());
        bytes.extend_from_slice(&height.to_be_bytes());
        bytes
    }

    #[test]
    fn classifies_png_and_refuses_images_over_the_pixel_budget() {
        let result = classify(&png(2, 3), "wrong.txt", false).unwrap();
        let ImageOutcome::Image { image } = result else {
            panic!("expected image")
        };
        assert_eq!(image.format, ImageFormat::Png);
        assert_eq!(image.width, Some(2));
        assert_eq!(image.height, Some(3));

        assert!(matches!(
            classify(&png(41_000, 1_000), "large.png", false).unwrap(),
            ImageOutcome::Withheld {
                reason: WithheldReason::TooManyPixels,
                ..
            }
        ));
    }

    #[test]
    #[allow(clippy::print_stdout)] // Retain the release measurement in the verification log.
    fn measures_classification_of_the_initial_two_mib_budget() {
        use std::time::Instant;

        let mut bytes = png(1, 1);
        bytes.resize(2 * 1024 * 1024, 0);
        let started = Instant::now();
        let result = classify(&bytes, "image.png", false).unwrap();
        let elapsed = started.elapsed();
        let ImageOutcome::Image { image } = result else {
            panic!("expected bounded image payload")
        };
        assert_eq!(image.bytes, "2097152");
        println!("2 MiB image classification and base64: {elapsed:?}");
    }

    #[test]
    fn classifies_svg_without_parsing_or_rewriting_it() {
        let svg = b"\xef\xbb\xbf<?xml version=\"1.0\"?><!-- x --><!DOCTYPE svg><svg onload=\"x\"><script/></svg>";
        let result = classify(svg, "image.svg", false).unwrap();
        let ImageOutcome::Image { image } = result else {
            panic!("expected SVG")
        };
        assert_eq!(image.format, ImageFormat::Svg);
        assert_eq!(
            image.data,
            base64::engine::general_purpose::STANDARD.encode(svg)
        );
    }

    #[test]
    fn arbitrary_truncations_never_panic() {
        let sample = png(10, 20);
        for length in 0..sample.len() {
            let _ = classify(sample.get(..length).unwrap_or_default(), "x.png", false);
        }
    }
}
