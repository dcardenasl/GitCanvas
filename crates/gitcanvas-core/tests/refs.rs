//! Branch and tag listing integration tests.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]

mod support;

use git2::{Repository, Signature};
use gitcanvas_core::{refs::get_repository_refs, repository::ActiveRepo};
use support::Fixture;

#[test]
fn distinguishes_head_by_identity_from_branches_at_the_same_commit() {
    let fixture = Fixture::new();
    let root = fixture.commit("HEAD", "root", &[], 1);
    fixture.repo.set_head("refs/heads/main").unwrap();
    fixture
        .repo
        .reference("refs/heads/main", root, true, "fixture")
        .unwrap();
    fixture
        .repo
        .reference("refs/heads/feature/one", root, true, "fixture")
        .unwrap();
    fixture
        .repo
        .reference("refs/remotes/origin/main", root, true, "fixture")
        .unwrap();
    fixture
        .repo
        .reference_symbolic(
            "refs/remotes/origin/HEAD",
            "refs/remotes/origin/main",
            true,
            "fixture",
        )
        .unwrap();
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();
    let branches = get_repository_refs(&active).unwrap().branches;
    assert_eq!(branches.iter().filter(|branch| branch.is_head).count(), 1);
    assert_eq!(
        branches
            .iter()
            .find(|branch| branch.is_head)
            .unwrap()
            .full_name,
        "refs/heads/main"
    );
    assert!(branches
        .iter()
        .any(|branch| branch.is_remote && branch.is_symbolic));
    assert!(branches.iter().any(|branch| branch.name == "feature/one"));
    assert!(branches
        .windows(2)
        .all(|pair| pair[0].full_name < pair[1].full_name));
    fixture.repo.set_head_detached(root).unwrap();
    assert!(get_repository_refs(&active)
        .unwrap()
        .branches
        .iter()
        .all(|branch| !branch.is_head));
}

#[test]
fn resolves_lightweight_annotated_nested_and_non_commit_tags() {
    let fixture = Fixture::new();
    let root = fixture.commit("HEAD", "root", &[], 1);
    let commit = fixture.repo.find_object(root, None).unwrap();
    let signature = git2::Signature::now("Test", "test@example.com").unwrap();
    fixture
        .repo
        .tag_lightweight("release/light", &commit, false)
        .unwrap();
    let annotated = fixture
        .repo
        .tag("v1", &commit, &signature, "release", false)
        .unwrap();
    let tag = fixture.repo.find_object(annotated, None).unwrap();
    fixture
        .repo
        .tag("nested", &tag, &signature, "nested release", false)
        .unwrap();
    let blob = fixture.repo.blob(b"blob").unwrap();
    fixture
        .repo
        .tag_lightweight(
            "blob",
            &fixture.repo.find_object(blob, None).unwrap(),
            false,
        )
        .unwrap();
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();
    let tags = get_repository_refs(&active).unwrap().tags;
    assert_eq!(tags.len(), 4);
    assert!(tags[0].commit_id.is_none());
    let nested = tags.iter().find(|tag| tag.name == "nested").unwrap();
    assert!(nested.is_annotated);
    assert_eq!(nested.commit_id, Some(root.to_string()));
    let light = tags.iter().find(|tag| tag.name == "release/light").unwrap();
    assert!(!light.is_annotated);
    assert_eq!(light.target, root.to_string());
    assert_eq!(
        tags.iter().find(|tag| tag.name == "v1").unwrap().target,
        annotated.to_string()
    );
}

#[test]
fn empty_repository_has_no_refs() {
    let fixture = Fixture::new();
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();
    assert!(get_repository_refs(&active).unwrap().branches.is_empty());
    assert!(get_repository_refs(&active).unwrap().tags.is_empty());
}

#[test]
fn snapshot_freezes_head_roots_and_configured_upstream() {
    let directory = tempfile::tempdir().unwrap();
    let repo = Repository::init(directory.path()).unwrap();
    let signature = Signature::now("Author", "author@example.com").unwrap();
    let tree_id = repo.treebuilder(None).unwrap().write().unwrap();
    let tree = repo.find_tree(tree_id).unwrap();
    let id = repo
        .commit(Some("HEAD"), &signature, &signature, "root", &tree, &[])
        .unwrap();
    let head_name = repo.head().unwrap().name().unwrap().to_owned();
    let local_name = head_name.strip_prefix("refs/heads/").unwrap();
    repo.reference("refs/remotes/origin/trunk", id, false, "test")
        .unwrap();
    repo.reference_symbolic(
        "refs/remotes/origin/HEAD",
        "refs/remotes/origin/trunk",
        false,
        "test",
    )
    .unwrap();
    let mut config = repo.config().unwrap();
    config
        .set_str("remote.origin.url", "https://example.com/project.git")
        .unwrap();
    config
        .set_str("remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*")
        .unwrap();
    config
        .set_str(&format!("branch.{local_name}.remote"), "origin")
        .unwrap();
    config
        .set_str(&format!("branch.{local_name}.merge"), "refs/heads/trunk")
        .unwrap();
    let active = ActiveRepo::validate(directory.path()).unwrap();
    let snapshot = gitcanvas_core::refs::get_repository_refs(&active).unwrap();
    assert_eq!(snapshot.head, Some(id.to_string()));
    assert_eq!(snapshot.roots, vec![id.to_string()]);
    assert_eq!(
        snapshot
            .branches
            .iter()
            .find(|b| b.is_head)
            .unwrap()
            .upstream
            .as_deref(),
        Some("refs/remotes/origin/trunk")
    );
    assert_eq!(
        snapshot
            .branches
            .iter()
            .find(|b| b.is_symbolic)
            .unwrap()
            .symbolic_target
            .as_deref(),
        Some("refs/remotes/origin/trunk")
    );
}

#[test]
fn broken_symbolic_default_is_reported_without_losing_valid_branches() {
    let fixture = Fixture::new();
    fixture.commit("HEAD", "root", &[], 1);
    fixture
        .repo
        .reference_symbolic(
            "refs/remotes/origin/HEAD",
            "refs/remotes/origin/missing",
            false,
            "test",
        )
        .unwrap();
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();
    let snapshot = gitcanvas_core::refs::get_repository_refs(&active).unwrap();
    assert!(snapshot.branches.iter().any(|branch| branch.is_head));
    assert!(snapshot
        .branches
        .iter()
        .any(|branch| branch.is_symbolic && branch.target.is_none()));
}
