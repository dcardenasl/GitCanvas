//! Commit diff integration tests.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]

mod support;

use gitcanvas_core::{
    diff::{get_commit_diff, DiffOmission, DiffRequest, FileChange, LARGE_DIFF_LINE_LIMIT},
    repository::ActiveRepo,
};
use support::Fixture;

fn request(commit: &str) -> DiffRequest {
    DiffRequest {
        commit_id: commit.to_owned(),
        file_path: None,
        expand_path: None,
    }
}

fn open(fixture: &Fixture) -> ActiveRepo {
    ActiveRepo::validate(fixture.dir.path()).unwrap()
}

#[test]
fn a_root_commit_diffs_against_the_empty_tree() {
    let fixture = Fixture::new();
    let root = fixture.commit_files(
        "refs/heads/main",
        "initial",
        &[],
        1_000,
        &[("README.md", b"hello\n")],
    );

    let active = open(&fixture);
    let diff = get_commit_diff(&active, &request(&root.to_string())).unwrap();

    assert!(diff.parent_id.is_none(), "a root commit has no parent");
    assert_eq!(diff.files.len(), 1);
    assert_eq!(diff.files[0].path, "README.md");
    assert_eq!(diff.files[0].change, FileChange::Added);
    assert_eq!(diff.insertions, 1);
    assert_eq!(diff.deletions, 0);
}

#[test]
fn reports_added_modified_and_deleted_paths() {
    let fixture = Fixture::new();
    let first = fixture.commit_files(
        "refs/heads/main",
        "first",
        &[],
        1_000,
        &[("keep.txt", b"one\n"), ("gone.txt", b"bye\n")],
    );
    let second = fixture.commit_files(
        "refs/heads/main",
        "second",
        &[first],
        2_000,
        &[("keep.txt", b"one\ntwo\n"), ("new.txt", b"fresh\n")],
    );

    let active = open(&fixture);
    let diff = get_commit_diff(&active, &request(&second.to_string())).unwrap();

    let by_path = |path: &str| {
        diff.files
            .iter()
            .find(|file| file.path == path)
            .unwrap_or_else(|| panic!("{path} missing from the diff"))
    };

    assert_eq!(by_path("keep.txt").change, FileChange::Modified);
    assert_eq!(by_path("new.txt").change, FileChange::Added);
    assert_eq!(by_path("gone.txt").change, FileChange::Deleted);
    assert_eq!(diff.parent_id.as_deref(), Some(first.to_string().as_str()));
}

#[test]
fn commit_diff_returns_summaries_and_only_materializes_the_requested_patch() {
    let fixture = Fixture::new();
    let first = fixture.commit_files("refs/heads/main", "first", &[], 1_000, &[]);
    let second = fixture.commit_files(
        "refs/heads/main",
        "second",
        &[first],
        2_000,
        &[("a.txt", b"one\n"), ("b.txt", b"two\n")],
    );
    let active = open(&fixture);

    let summary = get_commit_diff(&active, &request(&second.to_string())).unwrap();
    assert_eq!(summary.files.len(), 2);
    assert_eq!(summary.insertions, 2);
    assert_eq!(summary.deletions, 0);
    assert!(summary.files.iter().all(|file| file.insertions == 1));
    assert!(summary.files.iter().all(|file| file.patch.is_none()));

    let detailed = get_commit_diff(
        &active,
        &DiffRequest {
            commit_id: second.to_string(),
            file_path: Some("a.txt".to_owned()),
            expand_path: None,
        },
    )
    .unwrap();
    assert!(detailed
        .files
        .iter()
        .find(|file| file.path == "a.txt")
        .is_some_and(|file| file.patch.is_some()));
    assert!(detailed
        .files
        .iter()
        .find(|file| file.path == "b.txt")
        .is_some_and(|file| file.patch.is_none()));
}

#[test]
fn a_merge_is_diffed_against_its_first_parent_and_says_so() {
    let fixture = Fixture::new();
    let base = fixture.commit_files("refs/heads/main", "base", &[], 1_000, &[("a.txt", b"a\n")]);
    let left = fixture.commit_files(
        "refs/heads/main",
        "left",
        &[base],
        2_000,
        &[("a.txt", b"a\nleft\n")],
    );
    let right = fixture.commit_files(
        "refs/heads/side",
        "right",
        &[base],
        2_500,
        &[("a.txt", b"a\nright\n")],
    );
    let merge = fixture.commit_files(
        "refs/heads/main",
        "merge",
        &[left, right],
        3_000,
        &[("a.txt", b"a\nleft\nright\n")],
    );

    let active = open(&fixture);
    let diff = get_commit_diff(&active, &request(&merge.to_string())).unwrap();

    assert!(diff.is_merge, "a two-parent commit must be flagged");
    assert_eq!(
        diff.parent_id.as_deref(),
        Some(left.to_string().as_str()),
        "the first parent is the one compared against"
    );
}

#[test]
fn binary_content_is_flagged_and_never_rendered_as_text() {
    let fixture = Fixture::new();
    // A NUL byte inside the first scan window is what makes libgit2 decide.
    let binary: Vec<u8> = (0u8..=255).cycle().take(4_096).collect();
    let first = fixture.commit_files("refs/heads/main", "first", &[], 1_000, &[("a.txt", b"a\n")]);
    let second = fixture.commit_files(
        "refs/heads/main",
        "second",
        &[first],
        2_000,
        &[("a.txt", b"a\n"), ("blob.bin", &binary)],
    );

    let active = open(&fixture);
    let diff = get_commit_diff(&active, &request(&second.to_string())).unwrap();
    let file = diff
        .files
        .iter()
        .find(|file| file.path == "blob.bin")
        .unwrap();

    assert_eq!(file.omitted, Some(DiffOmission::Binary));
    assert!(
        file.patch.is_none(),
        "a binary file must carry no patch text at all"
    );
}

#[test]
fn an_oversized_diff_is_withheld_until_it_is_asked_for() {
    let fixture = Fixture::new();
    let mut big = String::new();
    for line in 0..=LARGE_DIFF_LINE_LIMIT + 100 {
        use std::fmt::Write as _;
        writeln!(big, "line {line}").unwrap();
    }
    let big = big.into_bytes();

    let first = fixture.commit_files("refs/heads/main", "first", &[], 1_000, &[("a.txt", b"a\n")]);
    let second = fixture.commit_files(
        "refs/heads/main",
        "second",
        &[first],
        2_000,
        &[("a.txt", b"a\n"), ("huge.txt", &big)],
    );

    let active = open(&fixture);

    let withheld = get_commit_diff(&active, &request(&second.to_string())).unwrap();
    let file = withheld
        .files
        .iter()
        .find(|file| file.path == "huge.txt")
        .unwrap();
    assert_eq!(file.omitted, Some(DiffOmission::TooLarge));
    assert!(file.patch.is_none());
    assert!(
        file.insertions > LARGE_DIFF_LINE_LIMIT,
        "the counts stay available even when the text does not"
    );

    let expanded = get_commit_diff(
        &active,
        &DiffRequest {
            commit_id: second.to_string(),
            file_path: Some("huge.txt".to_owned()),
            expand_path: Some("huge.txt".to_owned()),
        },
    )
    .unwrap();
    let file = expanded
        .files
        .iter()
        .find(|file| file.path == "huge.txt")
        .unwrap();
    assert_eq!(file.omitted, None);
    assert!(file.patch.is_some(), "asking for it explicitly returns it");
}

#[test]
fn a_file_without_a_trailing_newline_still_produces_a_patch() {
    let fixture = Fixture::new();
    let first = fixture.commit_files(
        "refs/heads/main",
        "first",
        &[],
        1_000,
        &[("a.txt", b"no newline")],
    );
    let second = fixture.commit_files(
        "refs/heads/main",
        "second",
        &[first],
        2_000,
        &[("a.txt", b"still no newline")],
    );

    let active = open(&fixture);
    let detailed = get_commit_diff(
        &active,
        &DiffRequest {
            commit_id: second.to_string(),
            file_path: Some("a.txt".to_owned()),
            expand_path: None,
        },
    )
    .unwrap();
    let patch = detailed.files[0].patch.as_deref().unwrap();
    assert!(patch.contains("\\ No newline at end of file"));
}

#[test]
fn an_unknown_commit_is_an_error_not_an_empty_diff() {
    let fixture = Fixture::new();
    fixture.commit_files("refs/heads/main", "first", &[], 1_000, &[("a.txt", b"a\n")]);
    let active = open(&fixture);

    assert!(get_commit_diff(&active, &request("not-a-hash")).is_err());
    assert!(get_commit_diff(
        &active,
        &request("0000000000000000000000000000000000000001")
    )
    .is_err());
}
