#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]
//! Every command that takes a commit id validates it the same way.

mod support;

use gitcanvas_core::{
    blob::{get_file_content, FileContentRequest},
    commit_tree::{get_commit_tree_page, CommitTreeRequest},
    diff::{get_commit_diff, DiffRequest},
    error::AppError,
    repository::ActiveRepo,
};
use support::Fixture;

#[test]
fn an_abbreviated_commit_id_is_refused_everywhere() {
    let fixture = Fixture::new();
    let commit = fixture.commit_files("HEAD", "root", &[], 1, &[("a.txt", b"a\n")]);
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();
    let short = commit.to_string()[..12].to_owned();

    let diff = get_commit_diff(
        &active,
        &DiffRequest {
            commit_id: short.clone(),
            expand_path: None,
        },
    )
    .unwrap_err();
    let content = get_file_content(
        &active,
        &FileContentRequest {
            commit_id: short.clone(),
            path: "a.txt".into(),
            expand: false,
        },
    )
    .unwrap_err();
    let tree = get_commit_tree_page(
        &active,
        &CommitTreeRequest {
            commit_id: short,
            directory_path: None,
            offset: 0,
        },
    )
    .unwrap_err();

    for error in [diff, content, tree] {
        assert!(matches!(error, AppError::InvalidInput(_)), "{error:?}");
    }
}
