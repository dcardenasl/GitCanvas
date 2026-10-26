//! Linked-worktree inventory integration tests.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]

mod support;

use git2::{Repository, WorktreeAddOptions};
use gitcanvas_core::{
    repository::ActiveRepo,
    worktrees::{get_repository_worktrees, WorktreeAvailability, WorktreeHead},
};
use support::Fixture;

#[test]
fn lists_shared_identity_and_branch_without_opening_the_linked_repository() {
    let fixture = Fixture::new();
    let root = fixture.commit("HEAD", "initial", &[], 1);
    fixture.repo.set_head("refs/heads/main").unwrap();
    fixture
        .repo
        .reference("refs/heads/main", root, true, "fixture")
        .unwrap();
    fixture
        .repo
        .branch(
            "topic-tree",
            &fixture.repo.find_commit(root).unwrap(),
            false,
        )
        .unwrap();
    let external = tempfile::tempdir().unwrap();
    let linked = external.path().join("linked");
    let mut options = WorktreeAddOptions::new();
    options.checkout_existing(true);
    fixture
        .repo
        .worktree("topic-tree", &linked, Some(&options))
        .unwrap();

    let snapshot = get_repository_worktrees(&ActiveRepo::validate(&linked).unwrap()).unwrap();
    assert_eq!(snapshot.worktrees.len(), 2);
    assert_eq!(
        snapshot.repository_id,
        fixture
            .repo
            .commondir()
            .canonicalize()
            .unwrap()
            .to_str()
            .unwrap()
    );
    let main = snapshot
        .worktrees
        .iter()
        .find(|entry| entry.is_main)
        .unwrap();
    let topic = snapshot
        .worktrees
        .iter()
        .find(|entry| !entry.is_main)
        .unwrap();
    assert!(topic.is_active);
    assert_eq!(topic.availability, WorktreeAvailability::Available);
    assert_eq!(
        topic.head,
        WorktreeHead::Branch("refs/heads/topic-tree".into())
    );
    assert_eq!(main.head, WorktreeHead::Branch("refs/heads/main".into()));
    assert!(!topic.locked);
}

#[test]
fn distinguishes_detached_and_locked_metadata_without_treating_lock_as_access_denial() {
    let fixture = Fixture::new();
    let root = fixture.commit("HEAD", "initial", &[], 1);
    let external = tempfile::tempdir().unwrap();
    let linked = external.path().join("linked");
    fixture.repo.worktree("linked", &linked, None).unwrap();
    Repository::open(&linked)
        .unwrap()
        .set_head_detached(root)
        .unwrap();
    fixture
        .repo
        .find_worktree("linked")
        .unwrap()
        .lock(Some("fixture lock"))
        .unwrap();

    let snapshot =
        get_repository_worktrees(&ActiveRepo::validate(fixture.dir.path()).unwrap()).unwrap();
    let entry = snapshot
        .worktrees
        .iter()
        .find(|entry| !entry.is_main)
        .unwrap();
    assert!(entry.locked);
    assert_eq!(entry.lock_reason.as_deref(), Some("fixture lock"));
    assert_eq!(entry.head, WorktreeHead::Detached(root.to_string()));
    assert_eq!(entry.availability, WorktreeAvailability::Available);
}

#[test]
fn reports_missing_registered_location_without_failing_the_inventory() {
    let fixture = Fixture::new();
    fixture.commit("HEAD", "initial", &[], 1);
    let external = tempfile::tempdir().unwrap();
    let linked = external.path().join("linked");
    fixture.repo.worktree("linked", &linked, None).unwrap();
    std::fs::remove_dir_all(&linked).unwrap();
    let snapshot =
        get_repository_worktrees(&ActiveRepo::validate(fixture.dir.path()).unwrap()).unwrap();
    let entry = snapshot
        .worktrees
        .iter()
        .find(|entry| !entry.is_main)
        .unwrap();
    assert!(matches!(
        entry.availability,
        WorktreeAvailability::Missing | WorktreeAvailability::Prunable
    ));
}

#[test]
fn independent_clones_have_independent_worktree_identity() {
    let first = Fixture::new();
    first.commit("HEAD", "initial", &[], 1);
    let second = Fixture::new();
    second.commit("HEAD", "initial", &[], 1);

    let first_id = get_repository_worktrees(&ActiveRepo::validate(first.dir.path()).unwrap())
        .unwrap()
        .repository_id;
    let second_id = get_repository_worktrees(&ActiveRepo::validate(second.dir.path()).unwrap())
        .unwrap()
        .repository_id;
    assert_ne!(first_id, second_id);
}
