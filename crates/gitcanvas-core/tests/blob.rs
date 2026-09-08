#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]

mod support;

use gitcanvas_core::{
    blob::{get_file_content, FileContentRequest, LARGE_FILE_LINE_LIMIT},
    diff::DiffOmission,
    repository::ActiveRepo,
};
use support::Fixture;

fn request(commit: &str, path: &str, expand: bool) -> FileContentRequest {
    FileContentRequest {
        commit_id: commit.to_owned(),
        path: path.to_owned(),
        expand,
    }
}

fn open(fixture: &Fixture) -> ActiveRepo {
    ActiveRepo::validate(fixture.dir.path()).unwrap()
}

#[test]
fn reads_a_file_exactly_as_it_stands_at_that_commit() {
    let fixture = Fixture::new();
    let first = fixture.commit_files(
        "refs/heads/main",
        "first",
        &[],
        1_000,
        &[("a.txt", b"one\ntwo\n")],
    );
    let second = fixture.commit_files(
        "refs/heads/main",
        "second",
        &[first],
        2_000,
        &[("a.txt", b"one\ntwo\nthree\n")],
    );

    let active = open(&fixture);

    // The older commit must still yield the older contents, which is the whole
    // point of reading a blob at a commit rather than from the worktree.
    let old = get_file_content(&active, &request(&first.to_string(), "a.txt", false)).unwrap();
    assert_eq!(old.text.as_deref(), Some("one\ntwo\n"));
    assert_eq!(old.lines, 2);

    let new = get_file_content(&active, &request(&second.to_string(), "a.txt", false)).unwrap();
    assert_eq!(new.text.as_deref(), Some("one\ntwo\nthree\n"));
    assert_eq!(new.lines, 3);
}

#[test]
fn binary_content_is_never_returned_as_text() {
    let fixture = Fixture::new();
    let binary: Vec<u8> = (0u8..=255).cycle().take(4_096).collect();
    let commit = fixture.commit_files(
        "refs/heads/main",
        "first",
        &[],
        1_000,
        &[("blob.bin", &binary)],
    );

    let content = get_file_content(
        &open(&fixture),
        &request(&commit.to_string(), "blob.bin", false),
    )
    .unwrap();

    assert_eq!(content.omitted, Some(DiffOmission::Binary));
    assert!(content.text.is_none());
    assert_eq!(content.bytes, "4096", "the size stays available");
}

#[test]
fn a_large_file_is_withheld_until_it_is_asked_for() {
    let fixture = Fixture::new();
    let mut big = String::new();
    for line in 0..=LARGE_FILE_LINE_LIMIT + 10 {
        use std::fmt::Write as _;
        writeln!(big, "line {line}").unwrap();
    }
    let commit = fixture.commit_files(
        "refs/heads/main",
        "first",
        &[],
        1_000,
        &[("huge.txt", big.as_bytes())],
    );
    let active = open(&fixture);

    let withheld =
        get_file_content(&active, &request(&commit.to_string(), "huge.txt", false)).unwrap();
    assert_eq!(withheld.omitted, Some(DiffOmission::TooLarge));
    assert!(withheld.text.is_none());
    assert!(
        withheld.lines > LARGE_FILE_LINE_LIMIT,
        "the line count stays available even when the text does not"
    );

    let expanded =
        get_file_content(&active, &request(&commit.to_string(), "huge.txt", true)).unwrap();
    assert_eq!(expanded.omitted, None);
    assert!(expanded.text.is_some());
}

#[test]
fn a_file_with_invalid_utf8_is_shown_rather_than_refused() {
    let fixture = Fixture::new();
    // A lone continuation byte inside otherwise valid text: not enough for
    // libgit2 to call it binary, but not valid UTF-8 either.
    let commit = fixture.commit_files(
        "refs/heads/main",
        "first",
        &[],
        1_000,
        &[("odd.txt", b"valid\n\xffstill readable\n")],
    );

    let content = get_file_content(
        &open(&fixture),
        &request(&commit.to_string(), "odd.txt", false),
    )
    .unwrap();

    assert!(
        content.text.is_some(),
        "a stray byte must not hide the file"
    );
    assert!(content.text.unwrap().contains("still readable"));
}

#[test]
fn a_path_the_commit_does_not_have_is_an_error() {
    let fixture = Fixture::new();
    let commit = fixture.commit_files("refs/heads/main", "first", &[], 1_000, &[("a.txt", b"a\n")]);
    let active = open(&fixture);

    assert!(get_file_content(&active, &request(&commit.to_string(), "gone.txt", false)).is_err());
    assert!(get_file_content(&active, &request("not-a-hash", "a.txt", false)).is_err());
}
