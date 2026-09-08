#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]

mod support;

use gitcanvas_core::{error::AppError, repository::ActiveRepo};
use support::Fixture;

#[test]
fn accepts_only_canonical_working_roots() {
    let fixture = Fixture::new();
    let active = ActiveRepo::validate(fixture.dir.path().join(".")).unwrap();
    assert_eq!(active.path(), fixture.dir.path().canonicalize().unwrap());
    assert_eq!(active.info().unwrap().path, active.path().to_str().unwrap());
    let child = fixture.dir.path().join("nested");
    std::fs::create_dir(&child).unwrap();
    assert!(ActiveRepo::validate(child).is_err());
    assert!(ActiveRepo::validate(fixture.dir.path().join(".git")).is_err());
}

#[test]
fn rejects_missing_plain_file_malformed_and_bare_paths() {
    let dir = tempfile::tempdir().unwrap();
    assert!(ActiveRepo::validate(dir.path()).is_err());
    assert!(ActiveRepo::validate(dir.path().join("missing")).is_err());
    std::fs::write(dir.path().join("file"), "hello").unwrap();
    assert!(ActiveRepo::validate(dir.path().join("file")).is_err());
    std::fs::write(dir.path().join(".git"), "gitdir: missing").unwrap();
    assert!(ActiveRepo::validate(dir.path()).is_err());
    let bare = tempfile::tempdir().unwrap();
    git2::Repository::init_bare(bare.path()).unwrap();
    assert!(ActiveRepo::validate(bare.path()).is_err());
}

#[test]
fn reopens_and_detects_removed_repository() {
    let fixture = Fixture::new();
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();
    assert!(active.open().is_ok());
    std::fs::remove_dir_all(fixture.dir.path().join(".git")).unwrap();
    assert!(active.open().is_err());
}

#[test]
fn accepts_linked_worktree_git_file() {
    let fixture = Fixture::new();
    fixture.commit("HEAD", "initial", &[], 1);
    let target = tempfile::tempdir().unwrap();
    let path = target.path().join("linked");
    fixture.repo.worktree("linked", &path, None).unwrap();
    assert!(path.join(".git").is_file());
    assert_eq!(
        ActiveRepo::validate(&path).unwrap().path(),
        path.canonicalize().unwrap()
    );
}

#[cfg(unix)]
#[test]
fn resolves_symlink_to_root() {
    let fixture = Fixture::new();
    let target = tempfile::tempdir().unwrap();
    let link = target.path().join("link");
    std::os::unix::fs::symlink(fixture.dir.path(), &link).unwrap();
    assert_eq!(
        ActiveRepo::validate(link).unwrap().path(),
        fixture.dir.path().canonicalize().unwrap()
    );
}

#[test]
fn errors_serialize_as_stable_tagged_values() {
    let error = AppError::from(git2::Error::from_str("fixture failure"));
    assert_eq!(
        serde_json::to_value(error).unwrap(),
        serde_json::json!({"kind": "Git", "message": "fixture failure"})
    );
}
