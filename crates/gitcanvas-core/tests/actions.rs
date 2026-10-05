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
    error::AppError,
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
        other @ CheckoutOutcome::Switched { .. } => {
            panic!("the checkout should have been refused, got {other:?}")
        }
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

// --- Remotes -----------------------------------------------------------------
//
// A bare repository stands in for GitHub and a second clone for "someone else
// pushed". Nothing here touches the network, but it exercises the same code
// paths a real remote does: fetch, tracking refs, and the per-ref status a
// server returns for a push.

use git2::{Oid, Repository, Signature, Time};
use tempfile::TempDir;

struct Remotes {
    local: Fixture,
    bare: TempDir,
    /// Owns the peer clone's directory so it lives as long as the scenario.
    #[allow(dead_code)]
    peer_dir: TempDir,
    peer: Repository,
    base: Oid,
}

fn url(dir: &TempDir) -> String {
    dir.path().to_str().unwrap().to_owned()
}

fn checkout_force(repo: &Repository) {
    repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))
        .unwrap();
}

/// Commits `files` on top of `HEAD` in `repo`, keeping everything already there.
fn commit_on_head(repo: &Repository, message: &str, time: i64, files: &[(&str, &[u8])]) -> Oid {
    let parent = repo.head().unwrap().peel_to_commit().unwrap();
    let mut builder = repo.treebuilder(Some(&parent.tree().unwrap())).unwrap();
    for (path, contents) in files {
        builder
            .insert(path, repo.blob(contents).unwrap(), 0o100_644)
            .unwrap();
    }
    let tree = repo.find_tree(builder.write().unwrap()).unwrap();
    let signature = Signature::new("Peer", "peer@example.com", &Time::new(time, 0)).unwrap();
    repo.commit(
        Some("HEAD"),
        &signature,
        &signature,
        message,
        &tree,
        &[&parent],
    )
    .unwrap()
}

fn push_from(repo: &Repository, refspec: &str) {
    repo.find_remote("origin")
        .unwrap()
        .push(&[refspec], None)
        .unwrap();
}

/// A local repository tracking `origin/main` on a bare remote, plus a peer
/// clone of the same remote.
fn remotes() -> Remotes {
    let remote_dir = tempfile::tempdir().unwrap();
    let remote = Repository::init_bare(remote_dir.path()).unwrap();
    remote.set_head("refs/heads/main").unwrap();

    let local = Fixture::new();
    let base = local.commit_files("refs/heads/main", "base", &[], 1_000, &[("a.txt", b"a\n")]);
    local.repo.set_head("refs/heads/main").unwrap();
    checkout_force(&local.repo);
    local.repo.remote("origin", &url(&remote_dir)).unwrap();

    assert!(matches!(
        push_current_branch(&open(&local)).unwrap(),
        PushOutcome::Pushed { .. }
    ));
    local
        .repo
        .find_remote("origin")
        .unwrap()
        .fetch(&["main"], None, None)
        .unwrap();
    local
        .repo
        .find_branch("main", git2::BranchType::Local)
        .unwrap()
        .set_upstream(Some("origin/main"))
        .unwrap();

    let peer_dir = tempfile::tempdir().unwrap();
    let peer = Repository::clone(&url(&remote_dir), peer_dir.path()).unwrap();
    Remotes {
        local,
        bare: remote_dir,
        peer_dir,
        peer,
        base,
    }
}

fn remote_main(remotes: &Remotes) -> Oid {
    Repository::open_bare(remotes.bare.path())
        .unwrap()
        .refname_to_id("refs/heads/main")
        .unwrap()
}

#[test]
fn a_push_reaches_the_remote() {
    let remotes = remotes();
    let next = remotes.local.commit_files(
        "refs/heads/main",
        "next",
        &[remotes.base],
        2_000,
        &[("a.txt", b"a\n"), ("b.txt", b"b\n")],
    );

    let outcome = push_current_branch(&open(&remotes.local)).unwrap();

    assert!(matches!(outcome, PushOutcome::Pushed { .. }));
    assert_eq!(remote_main(&remotes), next);
}

#[test]
fn a_push_behind_the_remote_is_reported_and_changes_nothing() {
    let remotes = remotes();
    let theirs = commit_on_head(&remotes.peer, "theirs", 2_000, &[("t.txt", b"t\n")]);
    push_from(&remotes.peer, "refs/heads/main:refs/heads/main");
    remotes.local.commit_files(
        "refs/heads/main",
        "mine",
        &[remotes.base],
        3_000,
        &[("a.txt", b"a\n"), ("m.txt", b"m\n")],
    );

    let outcome = push_current_branch(&open(&remotes.local)).unwrap();

    assert!(
        matches!(outcome, PushOutcome::RejectedNonFastForward { .. }),
        "a rejected push must never read as pushed: {outcome:?}"
    );
    assert_eq!(remote_main(&remotes), theirs, "the remote was not touched");
}

#[test]
fn a_branch_pushes_to_the_name_it_tracks() {
    let remotes = remotes();
    // `work` tracks `origin/main`, so pushing it must update `main` on the
    // remote and not create a second branch called `work`.
    let tip = remotes.local.commit_files(
        "refs/heads/work",
        "work",
        &[remotes.base],
        2_000,
        &[("a.txt", b"a\n"), ("w.txt", b"w\n")],
    );
    remotes
        .local
        .repo
        .find_branch("work", git2::BranchType::Local)
        .unwrap()
        .set_upstream(Some("origin/main"))
        .unwrap();
    remotes.local.repo.set_head("refs/heads/work").unwrap();

    let outcome = push_current_branch(&open(&remotes.local)).unwrap();

    assert!(matches!(outcome, PushOutcome::Pushed { .. }));
    assert_eq!(remote_main(&remotes), tip);
    assert!(Repository::open_bare(remotes.bare.path())
        .unwrap()
        .find_reference("refs/heads/work")
        .is_err());
}

#[test]
fn pull_is_up_to_date_when_nothing_arrived() {
    let remotes = remotes();

    assert!(matches!(
        pull_fast_forward(&open(&remotes.local)).unwrap(),
        PullOutcome::UpToDate
    ));
}

#[test]
fn pull_fast_forwards_the_branch_and_the_files() {
    let remotes = remotes();
    let theirs = commit_on_head(&remotes.peer, "theirs", 2_000, &[("t.txt", b"t\n")]);
    push_from(&remotes.peer, "refs/heads/main:refs/heads/main");

    let outcome = pull_fast_forward(&open(&remotes.local)).unwrap();

    match outcome {
        PullOutcome::FastForwarded { commits, to } => {
            assert_eq!(commits, 1);
            assert_eq!(to, theirs.to_string());
        }
        other => panic!("expected a fast-forward, got {other:?}"),
    }
    assert_eq!(
        remotes.local.repo.refname_to_id("refs/heads/main").unwrap(),
        theirs
    );
    assert_eq!(
        fs::read(remotes.local.dir.path().join("t.txt")).unwrap(),
        b"t\n"
    );
}

#[test]
fn pull_reports_divergence_instead_of_merging() {
    let remotes = remotes();
    commit_on_head(&remotes.peer, "theirs", 2_000, &[("t.txt", b"t\n")]);
    push_from(&remotes.peer, "refs/heads/main:refs/heads/main");
    let mine = remotes.local.commit_files(
        "refs/heads/main",
        "mine",
        &[remotes.base],
        3_000,
        &[("a.txt", b"a\n"), ("m.txt", b"m\n")],
    );

    let outcome = pull_fast_forward(&open(&remotes.local)).unwrap();

    assert!(matches!(outcome, PullOutcome::DivergedRequiresMerge { .. }));
    assert_eq!(
        remotes.local.repo.refname_to_id("refs/heads/main").unwrap(),
        mine
    );
}

#[test]
fn pull_that_would_overwrite_local_work_moves_nothing() {
    let remotes = remotes();
    commit_on_head(&remotes.peer, "theirs", 2_000, &[("a.txt", b"theirs\n")]);
    push_from(&remotes.peer, "refs/heads/main:refs/heads/main");
    fs::write(remotes.local.dir.path().join("a.txt"), b"unsaved work\n").unwrap();

    let error = pull_fast_forward(&open(&remotes.local)).unwrap_err();

    assert!(matches!(error, AppError::Conflict(_)), "{error:?}");
    assert_eq!(
        remotes.local.repo.refname_to_id("refs/heads/main").unwrap(),
        remotes.base,
        "the branch must not advance over a working tree that refused the update"
    );
    assert_eq!(
        fs::read(remotes.local.dir.path().join("a.txt")).unwrap(),
        b"unsaved work\n"
    );
}

#[test]
fn pull_follows_the_tracked_branch_even_when_it_is_named_differently() {
    let remotes = remotes();
    remotes
        .local
        .repo
        .branch(
            "work",
            &remotes.local.repo.find_commit(remotes.base).unwrap(),
            false,
        )
        .unwrap();
    remotes
        .local
        .repo
        .find_branch("work", git2::BranchType::Local)
        .unwrap()
        .set_upstream(Some("origin/main"))
        .unwrap();
    remotes.local.repo.set_head("refs/heads/work").unwrap();
    let theirs = commit_on_head(&remotes.peer, "theirs", 2_000, &[("t.txt", b"t\n")]);
    push_from(&remotes.peer, "refs/heads/main:refs/heads/main");

    let outcome = pull_fast_forward(&open(&remotes.local)).unwrap();

    assert!(matches!(outcome, PullOutcome::FastForwarded { .. }));
    assert_eq!(
        remotes.local.repo.refname_to_id("refs/heads/work").unwrap(),
        theirs
    );
}

#[test]
fn pull_on_a_detached_head_explains_itself() {
    let fixture = Fixture::new();
    let base = fixture.commit_files("refs/heads/main", "base", &[], 1_000, &[("a.txt", b"a\n")]);
    fixture.repo.set_head_detached(base).unwrap();

    let error = pull_fast_forward(&open(&fixture)).unwrap_err();

    assert!(format!("{error:?}").contains("InvalidInput"), "{error:?}");
}
