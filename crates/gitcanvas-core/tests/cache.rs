#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]
//! Retention for the clone cache, exercised on real directories in a temp root.

use std::{
    fs,
    path::Path,
    time::{Duration, SystemTime},
};

use gitcanvas_core::github::{
    cache::{cached_entry_name, enforce_retention, status, touch_if_cached, MAX_REPOSITORIES},
    clone::cache_entry_name,
};

/// Creates a cache entry of `bytes` last used `age` ago.
fn seed(root: &Path, name: &str, bytes: usize, age: Duration) {
    let dir = root.join(name);
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("payload.bin"), vec![0u8; bytes]).unwrap();
    let when = SystemTime::now()
        .checked_sub(age)
        .expect("age predates now");
    filetime::set_file_mtime(&dir, filetime::FileTime::from_system_time(when)).unwrap();
}

#[test]
fn an_absent_cache_reports_empty_rather_than_failing() {
    let root = tempfile::tempdir().unwrap();
    let missing = root.path().join("never-created");

    let status = status(&missing).unwrap();

    assert!(status.entries.is_empty());
    assert_eq!(status.total_bytes, "0");
}

#[test]
fn entries_are_reported_newest_first_with_their_sizes() {
    let root = tempfile::tempdir().unwrap();
    seed(root.path(), "old", 1_000, Duration::from_secs(10_000));
    seed(root.path(), "new", 2_000, Duration::from_secs(10));

    let status = status(root.path()).unwrap();

    assert_eq!(status.entries.len(), 2);
    assert_eq!(status.entries[0].name, "new", "most recent first");
    assert!(status.total_bytes.parse::<u64>().unwrap() >= 3_000);
}

#[test]
fn nothing_is_evicted_while_both_limits_are_respected() {
    let root = tempfile::tempdir().unwrap();
    seed(root.path(), "a", 100, Duration::from_secs(10));
    seed(root.path(), "b", 100, Duration::from_secs(20));

    assert!(enforce_retention(root.path(), &[]).unwrap().is_empty());
    assert_eq!(status(root.path()).unwrap().entries.len(), 2);
}

#[test]
fn the_least_recently_used_repositories_go_first() {
    let root = tempfile::tempdir().unwrap();
    for index in 0..=MAX_REPOSITORIES {
        // Older index means older entry, so index 0 is the eviction candidate.
        let age = Duration::from_secs(u64::try_from(MAX_REPOSITORIES - index + 1).unwrap() * 1_000);
        seed(root.path(), &format!("repo{index}"), 10, age);
    }
    assert_eq!(
        status(root.path()).unwrap().entries.len(),
        MAX_REPOSITORIES + 1
    );

    let evicted = enforce_retention(root.path(), &[]).unwrap();

    assert_eq!(evicted, vec!["repo0".to_owned()]);
    assert_eq!(status(root.path()).unwrap().entries.len(), MAX_REPOSITORIES);
}

#[test]
fn the_repository_in_use_is_never_evicted_by_its_own_arrival() {
    let root = tempfile::tempdir().unwrap();
    // The oldest entry is also the one the caller says is in use.
    seed(root.path(), "keep-me", 10, Duration::from_secs(999_999));
    for index in 0..MAX_REPOSITORIES {
        seed(
            root.path(),
            &format!("repo{index}"),
            10,
            Duration::from_secs(10),
        );
    }

    let evicted = enforce_retention(root.path(), &["keep-me".to_owned()]).unwrap();

    assert!(!evicted.contains(&"keep-me".to_owned()));
    assert!(root.path().join("keep-me").exists());
    assert_eq!(evicted.len(), 1, "one over the limit means one eviction");
}

#[test]
fn cache_entry_names_stay_one_flat_level_inside_the_cache() {
    // A repository name must never be able to escape the cache root.
    assert_eq!(
        cache_entry_name("dcardenasl/gitcanvas").unwrap(),
        "dcardenasl__gitcanvas"
    );
    assert!(cache_entry_name("../../etc/passwd").is_err());
    assert!(cache_entry_name("a/../../b").is_err());
}

#[test]
fn in_flight_clones_are_not_counted_as_cache_entries() {
    let root = tempfile::tempdir().unwrap();
    seed(root.path(), "real", 10, Duration::from_secs(10));
    seed(root.path(), ".partial-real", 10, Duration::from_secs(10));

    let status = status(root.path()).unwrap();

    assert_eq!(status.entries.len(), 1);
    assert_eq!(status.entries[0].name, "real");
}

/// A cache entry that looks like a clone: a `.git` directory inside a folder.
fn seed_clone(root: &Path, name: &str, age: Duration) {
    // `.git` first: creating it after `seed` would bump the directory's mtime
    // and undo the age `seed` just set.
    fs::create_dir_all(root.join(name).join(".git")).unwrap();
    seed(root, name, 10, age);
}

#[test]
fn using_a_clone_makes_it_the_most_recent() {
    let root = tempfile::tempdir().unwrap();
    seed_clone(root.path(), "old", Duration::from_hours(14));
    seed_clone(root.path(), "new", Duration::from_secs(10));
    assert_eq!(status(root.path()).unwrap().entries[0].name, "new");

    assert!(touch_if_cached(root.path(), &root.path().join("old")));

    let names: Vec<_> = status(root.path())
        .unwrap()
        .entries
        .into_iter()
        .map(|entry| entry.name)
        .collect();
    assert_eq!(names[0], "old", "a used clone is not the one evicted first");
}

#[test]
fn a_used_clone_survives_retention_over_a_newer_unused_one() {
    let root = tempfile::tempdir().unwrap();
    seed_clone(root.path(), "oldest-but-used", Duration::from_hours(25));
    for index in 0..MAX_REPOSITORIES {
        seed_clone(
            root.path(),
            &format!("repo{index}"),
            Duration::from_secs(1_000 + u64::try_from(index).unwrap()),
        );
    }
    assert!(touch_if_cached(
        root.path(),
        &root.path().join("oldest-but-used")
    ));

    let evicted = enforce_retention(root.path(), &[]).unwrap();

    assert!(
        !evicted.contains(&"oldest-but-used".to_owned()),
        "{evicted:?}"
    );
    assert_eq!(evicted.len(), 1);
}

#[test]
fn retention_keeps_every_active_entry_named_by_the_caller() {
    let root = tempfile::tempdir().unwrap();
    seed(root.path(), "active-one", 10, Duration::from_hours(25));
    seed(root.path(), "active-two", 10, Duration::from_secs(80_000));
    for index in 0..MAX_REPOSITORIES {
        seed(
            root.path(),
            &format!("repo{index}"),
            10,
            Duration::from_secs(10),
        );
    }

    let keep = vec!["active-one".to_owned(), "active-two".to_owned()];
    let evicted = enforce_retention(root.path(), &keep).unwrap();

    assert_eq!(evicted.len(), 2);
    assert!(root.path().join("active-one").exists());
    assert!(root.path().join("active-two").exists());
}

#[test]
fn only_repositories_inside_the_cache_are_marked() {
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    seed_clone(root.path(), "owner__repo", Duration::from_secs(10));
    fs::create_dir_all(outside.path().join(".git")).unwrap();
    let canonical = root.path().canonicalize().unwrap();

    assert!(touch_if_cached(root.path(), &canonical.join("owner__repo")));
    assert!(canonical
        .join("owner__repo/.git/gitcanvas-last-used")
        .exists());
    assert!(!touch_if_cached(root.path(), outside.path()));
    assert!(!outside.path().join(".git/gitcanvas-last-used").exists());
}

#[test]
fn active_repository_resolves_only_to_a_direct_cache_entry() {
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    fs::create_dir_all(root.path().join("owner__repo/.git")).unwrap();
    fs::create_dir_all(root.path().join("nested/owner__repo/.git")).unwrap();

    assert_eq!(
        cached_entry_name(root.path(), &root.path().join("owner__repo")).as_deref(),
        Some("owner__repo")
    );
    assert_eq!(
        cached_entry_name(root.path(), &root.path().join("nested/owner__repo")),
        None
    );
    assert_eq!(cached_entry_name(root.path(), outside.path()), None);
}
