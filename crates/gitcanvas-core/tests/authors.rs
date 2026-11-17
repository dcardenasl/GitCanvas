//! Author identity resolution and bounded `.mailmap` reading (CR-1, cases 1-4 and 42).

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    clippy::arithmetic_side_effects
)]

mod support;

use std::fs;

use git2::{Oid, Signature, Time};
use gitcanvas_core::authors::{load_mailmap, MailmapWarning, MAX_MAILMAP_BYTES};
use support::Fixture;

fn commit_as(fixture: &Fixture, name: &str, email: &str, files: &[(&str, &[u8])]) -> Oid {
    let signature = Signature::new(name, email, &Time::new(1_700_000_000, 0)).unwrap();
    let mut builder = fixture.repo.treebuilder(None).unwrap();
    for (path, content) in files {
        let blob = fixture.repo.blob(content).unwrap();
        builder.insert(path, blob, 0o100_644).unwrap();
    }
    let tree = fixture.repo.find_tree(builder.write().unwrap()).unwrap();
    fixture
        .repo
        .commit(Some("HEAD"), &signature, &signature, "c", &tree, &[])
        .unwrap()
}

fn key(
    mailmap: &gitcanvas_core::authors::LoadedMailmap,
    name: &str,
    email: &str,
) -> (String, String) {
    let key = mailmap.resolve(name, email);
    (key.name, key.email)
}

#[test]
fn same_name_with_different_emails_is_two_identities() {
    let fixture = Fixture::new();
    let mailmap = load_mailmap(&fixture.repo);
    assert_ne!(
        mailmap.resolve("Ana", "ana@a.test"),
        mailmap.resolve("Ana", "ana@b.test")
    );
}

#[test]
fn email_letter_case_is_not_merged_without_mailmap() {
    let fixture = Fixture::new();
    let mailmap = load_mailmap(&fixture.repo);
    assert_ne!(
        mailmap.resolve("Ana", "ana@a.test"),
        mailmap.resolve("Ana", "ANA@a.test")
    );
}

#[test]
fn working_tree_mailmap_joins_two_emails_under_the_canonical_name() {
    let fixture = Fixture::new();
    fs::write(
        fixture.dir.path().join(".mailmap"),
        "Ana Canonical <ana@a.test>\nAna Canonical <ana@a.test> <old@b.test>\n",
    )
    .unwrap();
    let mailmap = load_mailmap(&fixture.repo);
    let one = key(&mailmap, "Ana", "ana@a.test");
    let two = key(&mailmap, "ana old", "old@b.test");
    assert_eq!(one, ("Ana Canonical".to_owned(), "ana@a.test".to_owned()));
    assert_eq!(one, two);
    assert_eq!(mailmap.warning(), None);
}

#[test]
fn head_mailmap_is_used_when_the_working_tree_has_none() {
    let fixture = Fixture::new();
    commit_as(
        &fixture,
        "Ana",
        "ana@a.test",
        &[(".mailmap", b"Ana Canonical <ana@a.test> <old@b.test>\n")],
    );
    let mailmap = load_mailmap(&fixture.repo);
    assert_eq!(
        key(&mailmap, "x", "old@b.test"),
        ("Ana Canonical".to_owned(), "ana@a.test".to_owned())
    );
}

#[test]
fn absent_empty_and_invalid_mailmaps_never_fail() {
    let fixture = Fixture::new();
    let absent = load_mailmap(&fixture.repo);
    assert_eq!(absent.warning(), None);
    assert_eq!(
        key(&absent, "Ana", "a@a.test"),
        ("Ana".to_owned(), "a@a.test".to_owned())
    );

    let path = fixture.dir.path().join(".mailmap");
    fs::write(&path, "").unwrap();
    let empty = load_mailmap(&fixture.repo);
    assert_eq!(empty.warning(), None);
    assert_eq!(
        key(&empty, "Ana", "a@a.test"),
        ("Ana".to_owned(), "a@a.test".to_owned())
    );

    fs::write(
        &path,
        "<<< garbage\n# comment\nOk Name <ok@a.test> <x@a.test>\n",
    )
    .unwrap();
    let invalid = load_mailmap(&fixture.repo);
    assert_eq!(key(&invalid, "q", "x@a.test").0, "Ok Name");
    assert_eq!(
        key(&invalid, "Zed", "z@a.test"),
        ("Zed".to_owned(), "z@a.test".to_owned())
    );
}

#[test]
fn unreadable_mailmap_warns_and_leaves_identities_unmapped() {
    let fixture = Fixture::new();
    // A directory where the file should be, and non UTF-8 content, are both unreadable.
    fs::create_dir(fixture.dir.path().join(".mailmap")).unwrap();
    let directory = load_mailmap(&fixture.repo);
    assert_eq!(directory.warning(), Some(MailmapWarning::Unreadable));
    assert_eq!(
        key(&directory, "Ana", "a@a.test"),
        ("Ana".to_owned(), "a@a.test".to_owned())
    );

    fs::remove_dir(fixture.dir.path().join(".mailmap")).unwrap();
    fs::write(fixture.dir.path().join(".mailmap"), [0xff, 0xfe, 0x00]).unwrap();
    let binary = load_mailmap(&fixture.repo);
    assert_eq!(binary.warning(), Some(MailmapWarning::Unreadable));
}

#[test]
fn oversized_mailmap_is_refused_before_reading() {
    let fixture = Fixture::new();
    let path = fixture.dir.path().join(".mailmap");
    let mut content = b"Big Name <a@a.test> <b@a.test>\n".to_vec();
    content.resize(MAX_MAILMAP_BYTES + 1, b'#');
    fs::write(&path, &content).unwrap();
    let mailmap = load_mailmap(&fixture.repo);
    assert_eq!(mailmap.warning(), Some(MailmapWarning::Unreadable));
    assert_eq!(key(&mailmap, "n", "b@a.test").0, "n");

    // Exactly at the ceiling is accepted.
    content.truncate(MAX_MAILMAP_BYTES);
    fs::write(&path, &content).unwrap();
    assert_eq!(load_mailmap(&fixture.repo).warning(), None);
}

#[test]
fn oversized_head_blob_is_refused() {
    let fixture = Fixture::new();
    let mut content = b"Big Name <a@a.test> <b@a.test>\n".to_vec();
    content.resize(MAX_MAILMAP_BYTES + 1, b'#');
    commit_as(&fixture, "Ana", "a@a.test", &[(".mailmap", &content)]);
    let mailmap = load_mailmap(&fixture.repo);
    assert_eq!(mailmap.warning(), Some(MailmapWarning::Unreadable));
}

#[test]
fn mailmap_file_config_pointing_outside_the_repository_is_ignored() {
    let fixture = Fixture::new();
    let outside = tempfile::tempdir().unwrap();
    let outside_file = outside.path().join("elsewhere.mailmap");
    fs::write(&outside_file, "Leaked <leak@a.test> <b@a.test>\n").unwrap();
    fixture
        .repo
        .config()
        .unwrap()
        .set_str("mailmap.file", outside_file.to_str().unwrap())
        .unwrap();
    let mailmap = load_mailmap(&fixture.repo);
    assert_eq!(
        key(&mailmap, "n", "b@a.test"),
        ("n".to_owned(), "b@a.test".to_owned())
    );
}

#[cfg(unix)]
#[test]
fn symlinked_mailmap_is_not_followed() {
    let fixture = Fixture::new();
    let outside = tempfile::tempdir().unwrap();
    let target = outside.path().join("secret");
    fs::write(&target, "Leaked <leak@a.test> <b@a.test>\n").unwrap();
    std::os::unix::fs::symlink(&target, fixture.dir.path().join(".mailmap")).unwrap();
    let mailmap = load_mailmap(&fixture.repo);
    assert_eq!(mailmap.warning(), Some(MailmapWarning::Unreadable));
    assert_eq!(key(&mailmap, "n", "b@a.test").0, "n");
}

#[test]
fn content_hash_changes_with_the_effective_content() {
    let fixture = Fixture::new();
    let path = fixture.dir.path().join(".mailmap");
    let none = load_mailmap(&fixture.repo).content_hash().to_owned();
    fs::write(&path, "").unwrap();
    assert_eq!(load_mailmap(&fixture.repo).content_hash(), none);
    fs::write(&path, "A <a@a.test> <b@a.test>\n").unwrap();
    let one = load_mailmap(&fixture.repo).content_hash().to_owned();
    assert_ne!(one, none);
    fs::write(&path, "A <a@a.test> <c@a.test>\n").unwrap();
    assert_ne!(load_mailmap(&fixture.repo).content_hash(), one);
}
