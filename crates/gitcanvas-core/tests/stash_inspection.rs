//! Immutable stash comparisons against Git, with exact origin/path identity.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    clippy::arithmetic_side_effects
)]

mod support;

use git2::{Oid, Signature, Time};
use gitcanvas_core::{
    blob::{MAX_EXPANDED_CONTENT_BYTES, MAX_INITIAL_CONTENT_BYTES},
    diff::{DiffOmission, FileChange},
    error::AppError,
    repository::ActiveRepo,
    stash::{
        get_stash_file_content, get_stash_file_diff, get_stash_files, StashComparisonMode as Mode,
        StashContentOutcome, StashContentSide as Side, StashContentUnavailable,
        StashFileContentRequest, StashFileDiffRequest, StashFileOrigin as Origin, StashFileRequest,
        StashFileSummary, StashFilesPage, StashFilesRequest, StashInspectionNotice,
        StashPreviewUnavailable, MAX_STASH_FILES,
    },
};
use std::{fs, time::Instant};
use support::{git, Fixture};

fn saved_from_git_variant(option: &str) -> Saved {
    let fixture = Fixture::new();
    fixture
        .repo
        .config()
        .unwrap()
        .set_str("user.name", "Fixture")
        .unwrap();
    fixture
        .repo
        .config()
        .unwrap()
        .set_str("user.email", "fixture@example.invalid")
        .unwrap();
    fixture.repo.set_head("refs/heads/main").unwrap();
    let base = fixture.commit_files(
        "refs/heads/main",
        "base",
        &[],
        1000,
        &[
            ("a", b"base a\n"),
            ("b", b"base b\n"),
            (".gitignore", b"ignored\n"),
        ],
    );
    for (name, contents) in [
        ("a", "base a\n"),
        ("b", "base b\n"),
        (".gitignore", "ignored\n"),
    ] {
        fs::write(fixture.dir.path().join(name), contents).unwrap();
    }
    git(&fixture, &["add", "a", "b", ".gitignore"]);
    fs::write(fixture.dir.path().join("a"), "prepared a\n").unwrap();
    git(&fixture, &["add", "a"]);
    fs::write(fixture.dir.path().join("b"), "saved b\n").unwrap();
    fs::write(fixture.dir.path().join("new"), "new\n").unwrap();
    fs::write(fixture.dir.path().join("ignored"), "ignored\n").unwrap();
    support::git_with_input(
        &fixture,
        &["stash", "push", option, "-m", "variant fixture"],
        (option == "--patch").then_some(b"y\ny\n".as_slice()),
    );
    let stash = fixture
        .repo
        .find_reference("refs/stash")
        .unwrap()
        .target()
        .unwrap();
    let commit = fixture.repo.find_commit(stash).unwrap();
    let index = commit.parent_id(1).unwrap();
    let untracked = (commit.parent_count() == 3).then(|| commit.parent_id(2).unwrap());
    drop(commit);
    Saved {
        fixture,
        base,
        index,
        stash,
        untracked,
    }
}

#[test]
fn system_git_stash_variants_match_each_saved_tree_without_assuming_their_contents() {
    for option in ["--staged", "--keep-index", "--patch", "-u", "-a"] {
        let saved = saved_from_git_variant(option);
        let (base, index, stash, untracked) =
            (saved.base, saved.index, saved.stash, saved.untracked);
        let empty = saved
            .fixture
            .repo
            .treebuilder(None)
            .unwrap()
            .write()
            .unwrap();
        for (mode, before, after, origin) in [
            (Mode::All, base, Some(stash), Origin::Tracked),
            (Mode::Staged, base, Some(index), Origin::Tracked),
            (Mode::Unstaged, index, Some(stash), Origin::Tracked),
            (Mode::Untracked, empty, untracked, Origin::Untracked),
        ] {
            let page = saved.page(mode);
            if let Some(after) = after {
                let oracle = git(
                    &saved.fixture,
                    &[
                        "diff",
                        "--no-ext-diff",
                        "--numstat",
                        &before.to_string(),
                        &after.to_string(),
                    ],
                );
                let expected = oracle
                    .lines()
                    .map(|line| line.split('\t').collect::<Vec<_>>())
                    .collect::<Vec<_>>();
                assert_eq!(
                    page.files
                        .iter()
                        .filter(|entry| entry.origin == origin)
                        .count(),
                    expected.len(),
                    "{option} {mode:?}"
                );
                for parts in expected {
                    let entry = page
                        .files
                        .iter()
                        .find(|entry| entry.origin == origin && entry.file.path == parts[2])
                        .unwrap();
                    assert_eq!(entry.file.insertions, parts[0].parse::<u32>().unwrap());
                    assert_eq!(entry.file.deletions, parts[1].parse::<u32>().unwrap());
                    assert_eq!(
                        saved.text(mode, entry, Side::Saved),
                        git(&saved.fixture, &["show", &format!("{after}:{}", parts[2])])
                    );
                }
            } else {
                assert_eq!(page.total_files, 0);
            }
        }
    }
}

#[test]
fn the_comparison_work_budget_is_enforced_before_loading_many_large_blobs() {
    let a = vec![b'a'; 22 * 1024 * 1024];
    let b = vec![b'b'; 22 * 1024 * 1024];
    let c = vec![b'c'; 22 * 1024 * 1024];
    let saved = Saved::new(&[], &[], &[("a", &a), ("b", &b), ("c", &c)], None);
    assert!(matches!(
        get_stash_files(
            &saved.active(),
            &StashFilesRequest {
                stash_id: saved.stash.to_string(),
                mode: Mode::All,
                limit: None,
                cursor: None
            }
        ),
        Err(AppError::ResourceLimitExceeded(_))
    ));
}

#[test]
fn objects_lost_after_listing_produce_read_errors_not_missing_side_or_empty_content() {
    let saved = Saved::new(&[], &[], &[("a", b"content that will disappear")], None);
    let page = saved.page(Mode::All);
    let id = &page.files[0].saved.as_ref().unwrap().object_id;
    let path = saved
        .fixture
        .repo
        .commondir()
        .join("objects")
        .join(id.get(..2).unwrap())
        .join(id.get(2..).unwrap());
    fs::remove_file(path).unwrap();
    let request = StashFileContentRequest {
        file: saved.request(Mode::All, &page.files[0]),
        side: Side::Saved,
        expand: false,
    };
    assert!(matches!(
        get_stash_file_content(&saved.active(), &request),
        Err(AppError::Git(_))
    ));
}

#[test]
fn a_renamed_non_utf8_path_keeps_its_old_display_name_even_when_both_look_identical() {
    let fixture = Fixture::new();
    fixture.repo.set_head("refs/heads/main").unwrap();
    let blob = fixture.repo.blob(b"same content").unwrap();
    let base = commit_raw(
        &fixture,
        "refs/heads/main",
        &[],
        &[(b"file-\xff", blob, 0o100_644)],
    );
    let index = commit_raw(
        &fixture,
        "refs/heads/index",
        &[base],
        &[(b"file-\xff", blob, 0o100_644)],
    );
    let stash = commit_raw(
        &fixture,
        "refs/heads/saved",
        &[base, index],
        &[(b"file-\xfe", blob, 0o100_644)],
    );
    let saved = Saved {
        fixture,
        base,
        index,
        stash,
        untracked: None,
    };
    let page = saved.page(Mode::All);
    assert_eq!(page.total_files, 1);
    assert_eq!(page.files[0].file.change, FileChange::Renamed);
    assert_eq!(
        page.files[0].file.old_path.as_deref(),
        Some(page.files[0].file.path.as_str())
    );
    assert_eq!(
        saved.text(Mode::All, &page.files[0], Side::Previous),
        "same content"
    );
    assert_eq!(
        saved.text(Mode::All, &page.files[0], Side::Saved),
        "same content"
    );
}

struct Saved {
    fixture: Fixture,
    base: Oid,
    index: Oid,
    stash: Oid,
    untracked: Option<Oid>,
}

impl Saved {
    fn new(
        base: &[(&str, &[u8])],
        index: &[(&str, &[u8])],
        saved: &[(&str, &[u8])],
        untracked: Option<&[(&str, &[u8])]>,
    ) -> Self {
        let fixture = Fixture::new();
        fixture.repo.set_head("refs/heads/main").unwrap();
        let base = fixture.commit_files("refs/heads/main", "base", &[], 1000, base);
        let index = fixture.commit_files("refs/heads/index", "index", &[base], 1001, index);
        let untracked = untracked.map(|files| {
            fixture.commit_files("refs/heads/untracked", "untracked", &[], 1002, files)
        });
        let mut parents = vec![base, index];
        if let Some(untracked) = untracked {
            parents.push(untracked);
        }
        let stash = fixture.commit_files("refs/heads/saved", "saved", &parents, 1003, saved);
        Self {
            fixture,
            base,
            index,
            stash,
            untracked,
        }
    }

    fn active(&self) -> ActiveRepo {
        ActiveRepo::validate(self.fixture.dir.path()).unwrap()
    }

    fn page(&self, mode: Mode) -> StashFilesPage {
        get_stash_files(
            &self.active(),
            &StashFilesRequest {
                stash_id: self.stash.to_string(),
                mode,
                limit: None,
                cursor: None,
            },
        )
        .unwrap()
    }

    fn request(&self, mode: Mode, entry: &StashFileSummary) -> StashFileRequest {
        StashFileRequest {
            stash_id: self.stash.to_string(),
            mode,
            file_key: entry.key.clone(),
        }
    }

    fn text(&self, mode: Mode, entry: &StashFileSummary, side: Side) -> String {
        match get_stash_file_content(
            &self.active(),
            &StashFileContentRequest {
                file: self.request(mode, entry),
                side,
                expand: false,
            },
        )
        .unwrap()
        .outcome
        {
            StashContentOutcome::Available { content } => content.text.unwrap(),
            other @ StashContentOutcome::Unavailable { .. } => {
                panic!("Expected saved text, got {other:?}")
            }
        }
    }
}

fn file<'a>(page: &'a StashFilesPage, path: &str) -> &'a StashFileSummary {
    page.files
        .iter()
        .find(|entry| entry.file.path == path)
        .unwrap()
}

#[test]
fn all_modes_compare_the_correct_saved_states_and_never_the_live_worktree() {
    let saved = Saved::new(
        &[("a.txt", b"base\n")],
        &[("a.txt", b"prepared\n")],
        &[("a.txt", b"saved\n")],
        Some(&[("new.txt", b"new\n"), ("ignored.txt", b"ignored\n")]),
    );
    fs::write(
        saved.fixture.dir.path().join("a.txt"),
        "live contents must not leak",
    )
    .unwrap();
    let mut index = saved.fixture.repo.index().unwrap();
    index.add_path(std::path::Path::new("a.txt")).unwrap();
    index.write().unwrap();
    for (mode, before, after) in [
        (Mode::All, "base\n", "saved\n"),
        (Mode::Staged, "base\n", "prepared\n"),
        (Mode::Unstaged, "prepared\n", "saved\n"),
    ] {
        let page = saved.page(mode);
        let entry = file(&page, "a.txt");
        assert_eq!(saved.text(mode, entry, Side::Previous), before);
        assert_eq!(saved.text(mode, entry, Side::Saved), after);
        let diff = get_stash_file_diff(
            &saved.active(),
            &StashFileDiffRequest {
                file: saved.request(mode, entry),
                expand: false,
            },
        )
        .unwrap();
        let patch = diff.patch.unwrap();
        assert!(patch.contains(&format!("-{before}")), "{patch}");
        assert!(patch.contains(&format!("+{after}")), "{patch}");
        assert!(!patch.contains("live contents"));
        assert_eq!(entry.file.insertions, 1);
        assert_eq!(entry.file.deletions, 1);
    }
    let all = saved.page(Mode::All);
    assert_eq!(all.total_files, 3);
    let untracked = saved.page(Mode::Untracked);
    assert_eq!(untracked.total_files, 2);
    assert_eq!(
        saved.text(
            Mode::Untracked,
            file(&untracked, "ignored.txt"),
            Side::Saved
        ),
        "ignored\n"
    );
}

#[test]
fn prepared_changes_cancelled_before_saving_are_absent_only_from_the_net_view() {
    let saved = Saved::new(
        &[("a.txt", b"base\n")],
        &[("a.txt", b"temporary\n")],
        &[("a.txt", b"base\n")],
        None,
    );
    assert_eq!(saved.page(Mode::All).total_files, 0);
    assert_eq!(saved.page(Mode::Staged).total_files, 1);
    assert_eq!(saved.page(Mode::Unstaged).total_files, 1);
    assert_eq!(saved.page(Mode::Untracked).total_files, 0);
}

#[test]
fn added_deleted_renamed_and_empty_files_resolve_both_sides_explicitly() {
    let original = [
        ("deleted.txt", &b"gone\n"[..]),
        ("old.txt", &b"rename me\n"[..]),
    ];
    let current = [
        ("added.txt", &b"added\n"[..]),
        ("new.txt", &b"rename me\n"[..]),
        ("empty.txt", &b""[..]),
    ];
    let saved = Saved::new(&original, &original, &current, None);
    let page = saved.page(Mode::All);
    let rename = file(&page, "new.txt");
    assert_eq!(rename.file.change, FileChange::Renamed);
    assert_eq!(rename.file.old_path.as_deref(), Some("old.txt"));
    assert_eq!(rename.previous.as_ref().unwrap().path, "old.txt");
    assert_eq!(saved.text(Mode::All, rename, Side::Previous), "rename me\n");
    assert_eq!(saved.text(Mode::All, rename, Side::Saved), "rename me\n");
    for (path, side) in [("added.txt", Side::Previous), ("deleted.txt", Side::Saved)] {
        let entry = file(&page, path);
        let response = get_stash_file_content(
            &saved.active(),
            &StashFileContentRequest {
                file: saved.request(Mode::All, entry),
                side,
                expand: false,
            },
        )
        .unwrap();
        assert!(response.version.is_none());
        assert!(matches!(
            response.outcome,
            StashContentOutcome::Unavailable {
                reason: StashContentUnavailable::MissingSide
            }
        ));
    }
    assert_eq!(
        saved.text(Mode::All, file(&page, "empty.txt"), Side::Saved),
        ""
    );
}

#[test]
fn same_name_in_tracked_and_untracked_trees_is_never_overwritten_or_confused() {
    let saved = Saved::new(
        &[],
        &[],
        &[("same.txt", b"tracked\n")],
        Some(&[("same.txt", b"untracked\n")]),
    );
    let page = saved.page(Mode::All);
    assert_eq!(page.total_files, 2);
    assert_ne!(page.files[0].key, page.files[1].key);
    let tracked = page
        .files
        .iter()
        .find(|entry| entry.origin == Origin::Tracked)
        .unwrap();
    let untracked = page
        .files
        .iter()
        .find(|entry| entry.origin == Origin::Untracked)
        .unwrap();
    assert_eq!(saved.text(Mode::All, tracked, Side::Saved), "tracked\n");
    assert_eq!(saved.text(Mode::All, untracked, Side::Saved), "untracked\n");
}

#[test]
fn page_sizes_and_cross_mode_or_altered_file_keys_cannot_change_file_identity() {
    let files = [("a", &b"a"[..]), ("b", &b"b"[..]), ("c", &b"c"[..])];
    let saved = Saved::new(&[], &files, &files, None);
    let mut request = StashFilesRequest {
        stash_id: saved.stash.to_string(),
        mode: Mode::All,
        limit: Some(1),
        cursor: None,
    };
    let mut keys = Vec::new();
    loop {
        let page = get_stash_files(&saved.active(), &request).unwrap();
        keys.extend(page.files.into_iter().map(|entry| entry.key));
        request.cursor = page.next_cursor;
        if request.cursor.is_none() {
            break;
        }
    }
    assert_eq!(
        keys,
        saved
            .page(Mode::All)
            .files
            .into_iter()
            .map(|entry| entry.key)
            .collect::<Vec<_>>()
    );
    let mut selected = StashFileRequest {
        stash_id: saved.stash.to_string(),
        mode: Mode::Staged,
        file_key: keys[0].clone(),
    };
    assert!(matches!(
        get_stash_file_diff(
            &saved.active(),
            &StashFileDiffRequest {
                file: selected.clone(),
                expand: false
            }
        ),
        Err(AppError::StaleCursor(_))
    ));
    selected.mode = Mode::All;
    let original: serde_json::Value = serde_json::from_str(&selected.file_key).unwrap();
    for (key, value) in [
        ("position", serde_json::json!(2)),
        ("version", serde_json::json!(2)),
        ("anchor", serde_json::json!("a".repeat(64))),
        ("untrusted_path", serde_json::json!("../private")),
    ] {
        let mut altered = original.clone();
        altered[key] = value;
        selected.file_key = altered.to_string();
        assert!(get_stash_file_diff(
            &saved.active(),
            &StashFileDiffRequest {
                file: selected.clone(),
                expand: false
            }
        )
        .is_err());
    }
}

#[test]
fn cross_repository_keys_are_rejected_even_with_identical_stash_objects() {
    let a = Saved::new(&[], &[], &[("a.txt", b"saved")], None);
    let b = Saved::new(&[], &[], &[("a.txt", b"saved")], None);
    assert_eq!(a.stash, b.stash);
    let key = a.request(Mode::All, &a.page(Mode::All).files[0]);
    assert!(matches!(
        get_stash_file_diff(
            &b.active(),
            &StashFileDiffRequest {
                file: key,
                expand: false
            }
        ),
        Err(AppError::StaleCursor(_))
    ));
}

#[test]
fn binary_and_oversized_content_use_shared_omissions_and_explicit_expansion() {
    let initial = vec![b'x'; MAX_INITIAL_CONTENT_BYTES + 1];
    let hard = vec![b'y'; MAX_EXPANDED_CONTENT_BYTES + 1];
    let saved = Saved::new(
        &[],
        &[],
        &[("binary", b"a\0b"), ("initial", &initial), ("hard", &hard)],
        None,
    );
    let page = saved.page(Mode::All);
    let binary = file(&page, "binary");
    let diff = get_stash_file_diff(
        &saved.active(),
        &StashFileDiffRequest {
            file: saved.request(Mode::All, binary),
            expand: true,
        },
    )
    .unwrap();
    assert_eq!(diff.entry.file.omitted, Some(DiffOmission::Binary));
    assert!(diff.patch.is_none());
    assert_eq!(
        file(&page, "hard").file.omitted,
        Some(DiffOmission::TooLarge)
    );
    assert!(!file(&page, "hard").stats_available);
    assert!(page
        .inspection
        .notices
        .contains(&StashInspectionNotice::RenameSimilaritySkipped));
    for path in ["initial", "hard"] {
        let entry = file(&page, path);
        let response = get_stash_file_content(
            &saved.active(),
            &StashFileContentRequest {
                file: saved.request(Mode::All, entry),
                side: Side::Saved,
                expand: false,
            },
        )
        .unwrap();
        assert!(
            matches!(response.outcome, StashContentOutcome::Available { content } if content.omitted == Some(DiffOmission::TooLarge) && content.text.is_none())
        );
    }
    let expanded = get_stash_file_content(
        &saved.active(),
        &StashFileContentRequest {
            file: saved.request(Mode::All, file(&page, "initial")),
            side: Side::Saved,
            expand: true,
        },
    )
    .unwrap();
    assert!(
        matches!(expanded.outcome, StashContentOutcome::Available { content } if content.text.as_ref().map(String::len) == Some(initial.len()))
    );
    assert!(matches!(
        get_stash_file_content(
            &saved.active(),
            &StashFileContentRequest {
                file: saved.request(Mode::All, file(&page, "hard")),
                side: Side::Saved,
                expand: true
            }
        ),
        Err(AppError::ResourceLimitExceeded(_))
    ));
}

#[test]
fn initial_patch_limits_and_explicit_hard_cap_are_enforced_without_other_file_patches() {
    let old = "old\n".repeat(2500);
    let new = "new\n".repeat(2500);
    let saved = Saved::new(
        &[("large", old.as_bytes())],
        &[("large", old.as_bytes())],
        &[("large", new.as_bytes()), ("other", b"other\n")],
        None,
    );
    let page = saved.page(Mode::All);
    let selected = saved.request(Mode::All, file(&page, "large"));
    let small = get_stash_file_diff(
        &saved.active(),
        &StashFileDiffRequest {
            file: selected.clone(),
            expand: false,
        },
    )
    .unwrap();
    assert_eq!(small.entry.file.omitted, Some(DiffOmission::TooLarge));
    assert!(small.patch.is_none());
    let expanded = get_stash_file_diff(
        &saved.active(),
        &StashFileDiffRequest {
            file: selected,
            expand: true,
        },
    )
    .unwrap();
    assert!(expanded.patch.unwrap().contains("+new"));
    let json = serde_json::to_value(page).unwrap();
    assert!(json["files"]
        .as_array()
        .unwrap()
        .iter()
        .all(|entry| entry.get("patch").is_none() && entry["file"].get("patch").is_none()));
    let old = "x".repeat(9 * 1024 * 1024);
    let new = "y".repeat(9 * 1024 * 1024);
    let saved = Saved::new(
        &[("huge", old.as_bytes())],
        &[("huge", old.as_bytes())],
        &[("huge", new.as_bytes())],
        None,
    );
    let page = saved.page(Mode::All);
    let response = get_stash_file_diff(
        &saved.active(),
        &StashFileDiffRequest {
            file: saved.request(Mode::All, &page.files[0]),
            expand: true,
        },
    )
    .unwrap();
    assert_eq!(response.entry.file.omitted, Some(DiffOmission::TooLarge));
    assert!(response.patch.is_none());
}

#[test]
fn decoded_patch_byte_limit_is_checked_before_allocating_replacement_text() {
    let raw = vec![0xff; 700 * 1024];
    let saved = Saved::new(&[], &[], &[("invalid-text", &raw)], None);
    let page = saved.page(Mode::All);
    let request = saved.request(Mode::All, &page.files[0]);
    let initial = get_stash_file_diff(
        &saved.active(),
        &StashFileDiffRequest {
            file: request.clone(),
            expand: false,
        },
    )
    .unwrap();
    assert_eq!(initial.entry.file.omitted, Some(DiffOmission::TooLarge));
    assert!(initial.patch.is_none());
    let expanded = get_stash_file_diff(
        &saved.active(),
        &StashFileDiffRequest {
            file: request,
            expand: true,
        },
    )
    .unwrap();
    assert!(expanded.patch.unwrap().len() > 2 * 1024 * 1024);
}

#[test]
fn malformed_topology_missing_objects_and_invalid_requests_are_not_empty_results() {
    let saved = Saved::new(&[], &[], &[], None);
    for id in [saved.base, saved.index] {
        assert!(matches!(
            get_stash_files(
                &saved.active(),
                &StashFilesRequest {
                    stash_id: id.to_string(),
                    mode: Mode::All,
                    limit: None,
                    cursor: None
                }
            ),
            Err(AppError::InvalidInput(_))
        ));
    }
    for limit in [0, 251] {
        assert!(matches!(
            get_stash_files(
                &saved.active(),
                &StashFilesRequest {
                    stash_id: saved.stash.to_string(),
                    mode: Mode::All,
                    limit: Some(limit),
                    cursor: None
                }
            ),
            Err(AppError::InvalidInput(_))
        ));
    }
    assert!(get_stash_files(
        &saved.active(),
        &StashFilesRequest {
            stash_id: "f".repeat(40),
            mode: Mode::All,
            limit: None,
            cursor: None
        }
    )
    .is_err());
    assert!(get_stash_file_diff(
        &saved.active(),
        &StashFileDiffRequest {
            file: StashFileRequest {
                stash_id: saved.stash.to_string(),
                mode: Mode::All,
                file_key: "../private".into()
            },
            expand: false
        }
    )
    .is_err());
    let unrelated = saved
        .fixture
        .commit("refs/heads/unrelated", "unrelated", &[], 2000);
    let bad = saved
        .fixture
        .commit("refs/heads/bad", "bad", &[saved.base, unrelated], 2001);
    assert!(get_stash_files(
        &saved.active(),
        &StashFilesRequest {
            stash_id: bad.to_string(),
            mode: Mode::All,
            limit: None,
            cursor: None
        }
    )
    .is_err());
}

fn commit_raw(
    fixture: &Fixture,
    reference: &str,
    parents: &[Oid],
    entries: &[(&[u8], Oid, i32)],
) -> Oid {
    let mut builder = fixture.repo.treebuilder(None).unwrap();
    for (path, id, mode) in entries {
        builder.insert(*path, *id, *mode).unwrap();
    }
    let tree_id = builder.write().unwrap();
    let tree = fixture.repo.find_tree(tree_id).unwrap();
    let signature =
        Signature::new("Fixture", "fixture@example.invalid", &Time::new(3000, 0)).unwrap();
    let parents = parents
        .iter()
        .map(|id| fixture.repo.find_commit(*id).unwrap())
        .collect::<Vec<_>>();
    fixture
        .repo
        .commit(
            Some(reference),
            &signature,
            &signature,
            "fixture",
            &tree,
            &parents.iter().collect::<Vec<_>>(),
        )
        .unwrap()
}

#[test]
fn symlink_blobs_are_not_followed_and_submodules_have_typed_unavailable_sides() {
    let mut saved = Saved::new(&[], &[], &[], None);
    let target = saved.fixture.repo.blob(b"/outside/private").unwrap();
    saved.stash = commit_raw(
        &saved.fixture,
        "refs/heads/special",
        &[saved.base, saved.index],
        &[
            (b"link", target, 0o120_000),
            (b"submodule", saved.base, 0o160_000),
        ],
    );
    let page = saved.page(Mode::All);
    assert_eq!(
        saved.text(Mode::All, file(&page, "link"), Side::Saved),
        "/outside/private"
    );
    let submodule = file(&page, "submodule");
    assert_eq!(
        submodule.preview_unavailable,
        Some(StashPreviewUnavailable::Submodule)
    );
    assert!(!submodule.stats_available);
    let response = get_stash_file_content(
        &saved.active(),
        &StashFileContentRequest {
            file: saved.request(Mode::All, submodule),
            side: Side::Saved,
            expand: false,
        },
    )
    .unwrap();
    assert!(matches!(
        response.outcome,
        StashContentOutcome::Unavailable {
            reason: StashContentUnavailable::Submodule
        }
    ));
    assert!(get_stash_file_diff(
        &saved.active(),
        &StashFileDiffRequest {
            file: saved.request(Mode::All, submodule),
            expand: false
        }
    )
    .unwrap()
    .patch
    .is_none());
}

#[test]
fn executable_mode_changes_are_not_lost_when_blob_content_is_identical() {
    let mut saved = Saved::new(
        &[("script", b"echo hi\n")],
        &[("script", b"echo hi\n")],
        &[],
        None,
    );
    let id = saved.fixture.repo.blob(b"echo hi\n").unwrap();
    saved.stash = commit_raw(
        &saved.fixture,
        "refs/heads/mode-change",
        &[saved.base, saved.index],
        &[(b"script", id, 0o100_755)],
    );
    let page = saved.page(Mode::All);
    assert_eq!(page.total_files, 1);
    assert_eq!(page.files[0].file.change, FileChange::Modified);
    assert!(get_stash_file_diff(
        &saved.active(),
        &StashFileDiffRequest {
            file: saved.request(Mode::All, &page.files[0]),
            expand: false
        }
    )
    .unwrap()
    .patch
    .unwrap()
    .contains("new mode 100755"));
}

#[test]
fn byte_distinct_names_with_the_same_lossy_display_have_distinct_keys_and_content() {
    let mut saved = Saved::new(&[], &[], &[], None);
    let one = saved.fixture.repo.blob(b"one").unwrap();
    let two = saved.fixture.repo.blob(b"two").unwrap();
    saved.stash = commit_raw(
        &saved.fixture,
        "refs/heads/raw-paths",
        &[saved.base, saved.index],
        &[(b"raw-\xff", one, 0o100_644), (b"raw-\xfe", two, 0o100_644)],
    );
    let page = saved.page(Mode::All);
    assert_eq!(page.files[0].file.path, page.files[1].file.path);
    assert_ne!(page.files[0].key, page.files[1].key);
    let mut texts = page
        .files
        .iter()
        .map(|entry| {
            assert!(entry.saved.as_ref().unwrap().path_lossy);
            saved.text(Mode::All, entry, Side::Saved)
        })
        .collect::<Vec<_>>();
    texts.sort();
    assert_eq!(texts, ["one", "two"]);
    let commit = gitcanvas_core::diff::get_commit_diff(
        &saved.active(),
        &gitcanvas_core::diff::DiffRequest {
            commit_id: saved.stash.to_string(),
            file_path: None,
            expand_path: None,
        },
    )
    .unwrap();
    assert!(commit.files.iter().all(|file| file.insertions == 1));
    for entry in &page.files {
        let result = get_stash_file_diff(
            &saved.active(),
            &StashFileDiffRequest {
                file: saved.request(Mode::All, entry),
                expand: false,
            },
        )
        .unwrap();
        assert!(result.patch.is_some());
    }
}

#[test]
fn dropping_the_list_entry_does_not_prevent_immutable_file_reads() {
    let saved = Saved::new(&[], &[], &[("a", b"saved")], None);
    saved
        .fixture
        .repo
        .reference("refs/stash", saved.stash, true, "fixture")
        .unwrap();
    let page = saved.page(Mode::All);
    saved
        .fixture
        .repo
        .find_reference("refs/stash")
        .unwrap()
        .delete()
        .unwrap();
    assert_eq!(saved.text(Mode::All, &page.files[0], Side::Saved), "saved");
}

#[test]
fn comparisons_and_content_match_git_diff_and_show() {
    let saved = Saved::new(
        &[("a", b"base\n")],
        &[("a", b"prepared\n")],
        &[("a", b"saved\n")],
        Some(&[("new", b"new\n")]),
    );
    for (mode, before, after) in [
        (Mode::All, saved.base, saved.stash),
        (Mode::Staged, saved.base, saved.index),
        (Mode::Unstaged, saved.index, saved.stash),
    ] {
        let page = saved.page(mode);
        let entry = file(&page, "a");
        let oracle = git(
            &saved.fixture,
            &[
                "diff",
                "--no-ext-diff",
                "--numstat",
                &before.to_string(),
                &after.to_string(),
            ],
        );
        assert_eq!(
            oracle.trim(),
            format!("{}\t{}\ta", entry.file.insertions, entry.file.deletions)
        );
        assert_eq!(
            saved.text(mode, entry, Side::Saved),
            git(&saved.fixture, &["show", &format!("{after}:a")])
        );
    }
    let page = saved.page(Mode::Untracked);
    assert_eq!(
        saved.text(Mode::Untracked, &page.files[0], Side::Saved),
        git(
            &saved.fixture,
            &["show", &format!("{}:new", saved.untracked.unwrap())]
        )
    );
}

#[test]
fn five_thousand_file_cap_is_checked_before_rename_or_patch_work() {
    let names = (0..=MAX_STASH_FILES)
        .map(|index| format!("file-{index:05}"))
        .collect::<Vec<_>>();
    let files = names
        .iter()
        .map(|name| (name.as_str(), &b"data\n"[..]))
        .collect::<Vec<_>>();
    let saved = Saved::new(&[], &[], &files, None);
    assert!(matches!(
        get_stash_files(
            &saved.active(),
            &StashFilesRequest {
                stash_id: saved.stash.to_string(),
                mode: Mode::All,
                limit: None,
                cursor: None
            }
        ),
        Err(AppError::ResourceLimitExceeded(_))
    ));
}

#[test]
fn inspection_of_all_modes_and_sides_does_not_write_git_metadata_or_live_files() {
    let saved = Saved::new(
        &[("a", b"base")],
        &[("a", b"prepared")],
        &[("a", b"saved")],
        Some(&[("new", b"new")]),
    );
    fs::write(saved.fixture.dir.path().join("a"), "live").unwrap();
    fs::write(saved.fixture.dir.path().join("untracked"), "live untracked").unwrap();
    let mut index = saved.fixture.repo.index().unwrap();
    index.add_path(std::path::Path::new("a")).unwrap();
    index.write().unwrap();
    saved
        .fixture
        .repo
        .reference_ensure_log("refs/stash")
        .unwrap();
    saved
        .fixture
        .repo
        .reference("refs/stash", saved.stash, true, "fixture")
        .unwrap();
    let common = saved.fixture.repo.commondir();
    let paths = [
        common.join("HEAD"),
        common.join("index"),
        common.join("refs/heads/main"),
        common.join("refs/stash"),
        common.join("logs/refs/stash"),
        saved.fixture.dir.path().join("a"),
        saved.fixture.dir.path().join("untracked"),
    ];
    let before = paths
        .iter()
        .map(|path| fs::read(path).unwrap())
        .collect::<Vec<_>>();
    for mode in [Mode::All, Mode::Staged, Mode::Unstaged, Mode::Untracked] {
        for entry in saved.page(mode).files {
            get_stash_file_diff(
                &saved.active(),
                &StashFileDiffRequest {
                    file: saved.request(mode, &entry),
                    expand: true,
                },
            )
            .unwrap();
            for side in [Side::Previous, Side::Saved] {
                get_stash_file_content(
                    &saved.active(),
                    &StashFileContentRequest {
                        file: saved.request(mode, &entry),
                        side,
                        expand: true,
                    },
                )
                .unwrap();
            }
        }
    }
    assert_eq!(
        before,
        paths
            .iter()
            .map(|path| fs::read(path).unwrap())
            .collect::<Vec<_>>()
    );
}

#[test]
fn linked_worktrees_can_read_the_same_immutable_comparison_without_using_their_index() {
    let saved = Saved::new(
        &[("a", b"base")],
        &[("a", b"prepared")],
        &[("a", b"saved")],
        None,
    );
    let parent = tempfile::tempdir().unwrap();
    let linked = parent.path().join("linked");
    git(
        &saved.fixture,
        &["worktree", "add", "-b", "linked", linked.to_str().unwrap()],
    );
    fs::write(linked.join("a"), "linked live contents").unwrap();
    let page = saved.page(Mode::All);
    let response = get_stash_file_content(
        &ActiveRepo::validate(linked).unwrap(),
        &StashFileContentRequest {
            file: saved.request(Mode::All, &page.files[0]),
            side: Side::Saved,
            expand: false,
        },
    )
    .unwrap();
    assert_eq!(response.inspection.revision, page.inspection.revision);
    assert!(
        matches!(response.outcome, StashContentOutcome::Available { content } if content.text.as_deref() == Some("saved"))
    );
}

#[test]
fn exact_content_byte_boundaries_are_readable_and_a_page_cursor_can_change_size() {
    let initial = vec![b'x'; MAX_INITIAL_CONTENT_BYTES];
    let expanded = vec![b'y'; MAX_EXPANDED_CONTENT_BYTES];
    let saved = Saved::new(
        &[],
        &[],
        &[("initial", &initial), ("expanded", &expanded)],
        None,
    );
    let first = get_stash_files(
        &saved.active(),
        &StashFilesRequest {
            stash_id: saved.stash.to_string(),
            mode: Mode::All,
            limit: Some(1),
            cursor: None,
        },
    )
    .unwrap();
    let second = get_stash_files(
        &saved.active(),
        &StashFilesRequest {
            stash_id: saved.stash.to_string(),
            mode: Mode::All,
            limit: Some(250),
            cursor: first.next_cursor,
        },
    )
    .unwrap();
    assert_eq!(second.files.len(), 1);
    assert!(second.next_cursor.is_none());
    let page = saved.page(Mode::All);
    for (path, expand, expected) in [
        ("initial", false, initial.len()),
        ("expanded", true, expanded.len()),
    ] {
        let response = get_stash_file_content(
            &saved.active(),
            &StashFileContentRequest {
                file: saved.request(Mode::All, file(&page, path)),
                side: Side::Saved,
                expand,
            },
        )
        .unwrap();
        assert!(
            matches!(response.outcome, StashContentOutcome::Available { content } if content.text.as_ref().map(String::len) == Some(expected))
        );
    }
}

#[test]
#[ignore = "release benchmark; execute explicitly with timing/RSS measurement"]
#[allow(clippy::print_stderr)]
fn five_thousand_files_benchmark() {
    let names = (0..MAX_STASH_FILES)
        .map(|index| format!("file-{index:05}"))
        .collect::<Vec<_>>();
    let contents = (0..MAX_STASH_FILES)
        .map(|index| format!("content {index}\n"))
        .collect::<Vec<_>>();
    let files = names
        .iter()
        .zip(&contents)
        .map(|(name, body)| (name.as_str(), body.as_bytes()))
        .collect::<Vec<_>>();
    let saved = Saved::new(&[], &[], &files, None);
    let start = Instant::now();
    let page = saved.page(Mode::All);
    let listing = start.elapsed();
    assert_eq!(page.total_files, 5000);
    assert_eq!(page.files.len(), 250);
    let start = Instant::now();
    let response = get_stash_file_diff(
        &saved.active(),
        &StashFileDiffRequest {
            file: saved.request(Mode::All, &page.files[0]),
            expand: false,
        },
    )
    .unwrap();
    let reading = start.elapsed();
    assert!(response.patch.is_some());
    eprintln!("5,000 files: first 250 summaries {listing:?}; one patch {reading:?}");
}
