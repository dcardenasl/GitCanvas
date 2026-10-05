//! Commit tree paging integration tests.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]

mod support;

use git2::{Oid, Signature, Time};
use gitcanvas_core::{
    commit_tree::{
        get_commit_tree_page, CommitTreeEntryKind, CommitTreeRequest, COMMIT_TREE_PAGE_SIZE,
    },
    repository::ActiveRepo,
};
use support::Fixture;

fn commit_from_tree(fixture: &Fixture, tree_id: Oid) -> Oid {
    let signature =
        Signature::new("Test Author", "test@example.com", &Time::new(1_000, 0)).unwrap();
    let tree = fixture.repo.find_tree(tree_id).unwrap();
    fixture
        .repo
        .commit(
            Some("refs/heads/main"),
            &signature,
            &signature,
            "tree",
            &tree,
            &[],
        )
        .unwrap()
}

fn request(commit_id: Oid, directory_path: Option<&str>, offset: u32) -> CommitTreeRequest {
    CommitTreeRequest {
        commit_id: commit_id.to_string(),
        directory_path: directory_path.map(str::to_owned),
        offset,
    }
}

fn open(fixture: &Fixture) -> ActiveRepo {
    ActiveRepo::validate(fixture.dir.path()).unwrap()
}

#[test]
fn lists_only_direct_children_and_resolves_nested_directories() {
    let fixture = Fixture::new();
    let mut panel = fixture.repo.treebuilder(None).unwrap();
    let view_blob = fixture.repo.blob(b"export {};").unwrap();
    panel.insert("View.tsx", view_blob, 0o100_644).unwrap();
    let panel_tree_id = panel.write().unwrap();

    let mut modules = fixture.repo.treebuilder(None).unwrap();
    modules.insert("Panel", panel_tree_id, 0o040_000).unwrap();
    let modules_tree_id = modules.write().unwrap();

    let mut root = fixture.repo.treebuilder(None).unwrap();
    let readme = fixture.repo.blob(b"hello").unwrap();
    root.insert("README.md", readme, 0o100_644).unwrap();
    root.insert("modules", modules_tree_id, 0o040_000).unwrap();
    let commit = commit_from_tree(&fixture, root.write().unwrap());
    let active = open(&fixture);

    let root_page = get_commit_tree_page(&active, &request(commit, None, 0)).unwrap();
    assert_eq!(root_page.entries.len(), 2);
    let modules_entry = root_page
        .entries
        .iter()
        .find(|entry| entry.name == "modules")
        .unwrap();
    assert_eq!(modules_entry.path, "modules");
    assert_eq!(modules_entry.kind, CommitTreeEntryKind::Directory);
    assert!(root_page
        .entries
        .iter()
        .any(|entry| { entry.path == "README.md" && entry.kind == CommitTreeEntryKind::File }));

    let nested_page =
        get_commit_tree_page(&active, &request(commit, Some("modules/Panel"), 0)).unwrap();
    assert_eq!(nested_page.entries.len(), 1);
    assert_eq!(nested_page.entries[0].name, "View.tsx");
    assert_eq!(nested_page.entries[0].path, "modules/Panel/View.tsx");
    assert_eq!(nested_page.entries[0].kind, CommitTreeEntryKind::File);
}

#[test]
fn pages_wide_directories_with_a_fixed_resource_budget() {
    let fixture = Fixture::new();
    let mut root = fixture.repo.treebuilder(None).unwrap();
    for index in 0..COMMIT_TREE_PAGE_SIZE + 5 {
        let name = format!("file-{index:03}.txt");
        let blob = fixture.repo.blob(name.as_bytes()).unwrap();
        root.insert(&name, blob, 0o100_644).unwrap();
    }
    let commit = commit_from_tree(&fixture, root.write().unwrap());
    let active = open(&fixture);

    let first = get_commit_tree_page(&active, &request(commit, None, 0)).unwrap();
    assert_eq!(first.entries.len(), COMMIT_TREE_PAGE_SIZE);
    assert_eq!(
        first.next_offset,
        Some(u32::try_from(COMMIT_TREE_PAGE_SIZE).unwrap())
    );

    let last =
        get_commit_tree_page(&active, &request(commit, None, first.next_offset.unwrap())).unwrap();
    assert_eq!(last.entries.len(), 5);
    assert_eq!(last.next_offset, None);
}

#[test]
fn rejects_non_directories_and_out_of_range_offsets() {
    let fixture = Fixture::new();
    let commit = fixture.commit_files(
        "refs/heads/main",
        "one file",
        &[],
        1_000,
        &[("README.md", b"hello")],
    );
    let active = open(&fixture);

    assert!(get_commit_tree_page(&active, &request(commit, Some("README.md"), 0)).is_err());
    assert!(get_commit_tree_page(&active, &request(commit, Some("../outside"), 0)).is_err());
    assert!(get_commit_tree_page(&active, &request(commit, None, 2)).is_err());
}
