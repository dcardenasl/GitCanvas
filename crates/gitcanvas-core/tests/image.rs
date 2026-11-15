//! Bounded image classification and immutable commit source tests.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]

mod support;

use gitcanvas_core::{
    image::{get_commit_image, CommitImageRequest, ImageOutcome, ImageVersion},
    repository::ActiveRepo,
};
use support::Fixture;

fn png(width: u32, height: u32) -> Vec<u8> {
    let mut bytes = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR".to_vec();
    bytes.extend_from_slice(&width.to_be_bytes());
    bytes.extend_from_slice(&height.to_be_bytes());
    bytes
}

#[test]
fn reads_saved_and_previous_image_from_commit_and_first_parent() {
    let fixture = Fixture::new();
    let old = png(3, 4);
    let first = fixture.commit_files(
        "refs/heads/main",
        "first",
        &[],
        1_000,
        &[("logo.png", &old)],
    );
    let new = png(5, 6);
    let second = fixture.commit_files(
        "refs/heads/main",
        "second",
        &[first],
        2_000,
        &[("logo.png", &new)],
    );
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();

    let previous = get_commit_image(
        &active,
        &CommitImageRequest {
            commit_id: second.to_string(),
            path: "logo.png".into(),
            previous_path: None,
            version: ImageVersion::Previous,
            expand: false,
        },
    )
    .unwrap();
    let saved = get_commit_image(
        &active,
        &CommitImageRequest {
            commit_id: second.to_string(),
            path: "logo.png".into(),
            previous_path: None,
            version: ImageVersion::Saved,
            expand: false,
        },
    )
    .unwrap();
    assert!(matches!(previous, ImageOutcome::Image { image } if image.width == Some(3)));
    assert!(matches!(saved, ImageOutcome::Image { image } if image.width == Some(5)));
}

#[test]
fn root_commit_has_no_previous_image() {
    let fixture = Fixture::new();
    let content = png(3, 4);
    let commit = fixture.commit_files(
        "refs/heads/main",
        "root",
        &[],
        1_000,
        &[("logo.png", &content)],
    );
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();
    let outcome = get_commit_image(
        &active,
        &CommitImageRequest {
            commit_id: commit.to_string(),
            path: "logo.png".into(),
            previous_path: None,
            version: ImageVersion::Previous,
            expand: false,
        },
    )
    .unwrap();
    assert!(matches!(outcome, ImageOutcome::Missing));
}
