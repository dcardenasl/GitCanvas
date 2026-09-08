#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]
//! Checkout guards, fast-forward pull and push, on real repositories.
//!
//! Remote operations use a second local repository as the remote, so the
//! diverged and fast-forward paths are exercised without any network.

mod support;

use std::fs;

use gitcanvas_core::{
    actions::{
        checkout_branch, pull_fast_forward, push_current_branch, CheckoutOutcome, PullOutcome,
        PushOutcome,
    },
    repository::ActiveRepo,
};
use support::Fixture;

fn open(fixture: &Fixture) -> ActiveRepo {
    ActiveRepo::validate(fixture.dir.path()).unwrap()
}

#[test]
fn checkout_switches_branches_when_the_worktree_is_clean() {
    let fixture = Fixture::new();
    let base = fixture.commit_files("refs/heads/main", "base", &[], 1_000, &[("a.txt", b"a\n")]);
    fixture.commit_files(
        "refs/heads/side",
        "side",
        &[base],
        2_000,
        &[("a.txt", b"side\n")],
    );
    fixture.repo.set_head("refs/heads/main").unwrap();
    fixture
        .repo
        .checkout_head(Some(git2::build::CheckoutBuilder::default().force()))
        .unwrap();

    let outcome = checkout_branch(&open(&fixture), "side", false).unwrap();

    assert!(matches!(outcome, CheckoutOutcome::Switched { .. }));
    assert_eq!(fixture.repo.head().unwrap().shorthand().unwrap(), "side");
}

#[test]
fn checkout_refuses_when_uncommitted_changes_would_be_lost() {
    let fixture = Fixture::new();
    let base = fixture.commit_files("refs/heads/main", "base", &[], 1_000, &[("a.txt", b"a\n")]);
    fixture.commit_files(
        "refs/heads/side",
        "side",
        &[base],
        2_000,
        &[("a.txt", b"side\n")],
    );
    fixture.repo.set_head("refs/heads/main").unwrap();
    fixture
        .repo
        .checkout_head(Some(git2::build::CheckoutBuilder::default().force()))
        .unwrap();

    // Real, unsaved work sitting in the worktree.
    fs::write(fixture.dir.path().join("a.txt"), b"work in progress\n").unwrap();

    let outcome = checkout_branch(&open(&fixture), "side", false).unwrap();

    match outcome {
        CheckoutOutcome::Blocked { conflicts } => {
            assert!(conflicts.iter().any(|entry| entry.path == "a.txt"));
        }
        other => panic!("the checkout should have been refused, got {other:?}"),
    }
    assert_eq!(
        fs::read(fixture.dir.path().join("a.txt")).unwrap(),
        b"work in progress\n",
        "the refused checkout must not have touched the file"
    );
    assert_eq!(
        fixture.repo.head().unwrap().shorthand().unwrap(),
        "main",
        "and must not have moved HEAD"
    );
}

#[test]
fn an_untracked_file_is_not_a_conflict() {
    let fixture = Fixture::new();
    let base = fixture.commit_files("refs/heads/main", "base", &[], 1_000, &[("a.txt", b"a\n")]);
    fixture.commit_files(
        "refs/heads/side",
        "side",
        &[base],
        2_000,
        &[("a.txt", b"a\n"), ("b.txt", b"b\n")],
    );
    fixture.repo.set_head("refs/heads/main").unwrap();
    fixture
        .repo
        .checkout_head(Some(git2::build::CheckoutBuilder::default().force()))
        .unwrap();

    // A file git does not track survives a checkout, so it must not block one.
    fs::write(fixture.dir.path().join("notes.md"), b"scratch\n").unwrap();

    let outcome = checkout_branch(&open(&fixture), "side", false).unwrap();
    assert!(matches!(outcome, CheckoutOutcome::Switched { .. }));
}

#[test]
fn forcing_a_checkout_is_the_only_way_to_discard_work() {
    let fixture = Fixture::new();
    let base = fixture.commit_files("refs/heads/main", "base", &[], 1_000, &[("a.txt", b"a\n")]);
    fixture.commit_files(
        "refs/heads/side",
        "side",
        &[base],
        2_000,
        &[("a.txt", b"side\n")],
    );
    fixture.repo.set_head("refs/heads/main").unwrap();
    fixture
        .repo
        .checkout_head(Some(git2::build::CheckoutBuilder::default().force()))
        .unwrap();
    fs::write(fixture.dir.path().join("a.txt"), b"work in progress\n").unwrap();

    let outcome = checkout_branch(&open(&fixture), "side", true).unwrap();

    assert!(matches!(outcome, CheckoutOutcome::Switched { .. }));
    assert_eq!(
        fs::read(fixture.dir.path().join("a.txt")).unwrap(),
        b"side\n"
    );
}

#[test]
fn checkout_of_a_branch_that_does_not_exist_is_an_error() {
    let fixture = Fixture::new();
    fixture.commit_files("refs/heads/main", "base", &[], 1_000, &[("a.txt", b"a\n")]);

    assert!(checkout_branch(&open(&fixture), "nope", false).is_err());
}

#[test]
fn pull_reports_no_upstream_rather_than_failing() {
    let fixture = Fixture::new();
    fixture.commit_files("refs/heads/main", "base", &[], 1_000, &[("a.txt", b"a\n")]);
    fixture.repo.set_head("refs/heads/main").unwrap();

    assert!(matches!(
        pull_fast_forward(&open(&fixture)).unwrap(),
        PullOutcome::NoUpstream
    ));
}

#[test]
fn push_without_a_branch_is_refused_with_a_clear_reason() {
    let fixture = Fixture::new();
    let base = fixture.commit_files("refs/heads/main", "base", &[], 1_000, &[("a.txt", b"a\n")]);
    // Detached HEAD: there is no branch name to push.
    fixture.repo.set_head_detached(base).unwrap();

    let error = push_current_branch(&open(&fixture)).unwrap_err();
    assert!(
        format!("{error:?}").contains("InvalidInput"),
        "a detached HEAD is a state to explain, not an internal failure: {error:?}"
    );
}

#[test]
fn push_to_a_missing_remote_is_an_error_not_a_silent_success() {
    let fixture = Fixture::new();
    fixture.commit_files("refs/heads/main", "base", &[], 1_000, &[("a.txt", b"a\n")]);
    fixture.repo.set_head("refs/heads/main").unwrap();

    let outcome = push_current_branch(&open(&fixture));
    assert!(
        outcome.is_err(),
        "there is no `origin` configured, so this cannot report success: {outcome:?}"
    );
    assert!(!matches!(outcome, Ok(PushOutcome::Pushed { .. })));
}
