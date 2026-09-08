#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]

mod support;

use gitcanvas_core::{
    refs::{get_branches, get_tags},
    repository::ActiveRepo,
};
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
    let branches = get_branches(&active).unwrap();
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
    assert!(get_branches(&active)
        .unwrap()
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
    let tags = get_tags(&active).unwrap();
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
    assert!(get_branches(&active).unwrap().is_empty());
    assert!(get_tags(&active).unwrap().is_empty());
}
