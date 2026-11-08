//! Read-only stash listing against real storage, Git and libgit2.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    clippy::arithmetic_side_effects,
    clippy::cast_possible_truncation
)]

mod support;

use std::{fs, path::PathBuf, process::Command};

use git2::Oid;
use gitcanvas_core::{
    error::AppError,
    repository::ActiveRepo,
    stash::{
        get_stashes, StashBranch, StashListRequest, StashPage, DEFAULT_STASH_PAGE_SIZE,
        MAX_STASH_CURSOR_BYTES, MAX_STASH_ENTRIES, MAX_STASH_ENTRY_BYTES, MAX_STASH_PAGE_SIZE,
        MAX_STASH_REFLOG_BYTES, MAX_STASH_SEARCH_BYTES,
    },
};
use support::{git, Fixture};

fn fixture() -> Fixture {
    let fixture = Fixture::new();
    let mut config = fixture.repo.config().unwrap();
    config.set_str("user.name", "Test Author").unwrap();
    config.set_str("user.email", "test@example.com").unwrap();
    fixture.repo.set_head("refs/heads/main").unwrap();
    fixture.commit("refs/heads/main", "base", &[], 1_000);
    fixture
}

fn log_path(fixture: &Fixture) -> PathBuf {
    fixture.repo.commondir().join("logs/refs/stash")
}

fn row(old: Oid, new: Oid, seconds: i64, message: &str) -> String {
    format!("{old} {new} Test Author <test@example.com> {seconds} -0330\t{message}\n")
}

fn write_log(fixture: &Fixture, count: usize) -> Oid {
    let base = fixture.repo.head().unwrap().target().unwrap();
    let index = fixture.commit("refs/heads/index-fixture", "index", &[base], 1_001);
    let id = fixture.commit("refs/heads/stash-fixture", "stash", &[base, index], 1_002);
    fixture
        .repo
        .reference("refs/stash", id, true, "fixture")
        .unwrap();
    let path = log_path(fixture);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    let mut bytes = String::new();
    let mut old = Oid::ZERO_SHA1;
    for index in 0..count {
        let message = if index == 0 {
            "On archived/branch: oldest needle".to_owned()
        } else {
            format!("WIP on main: change {index}")
        };
        bytes.push_str(&row(
            old,
            id,
            1_000 + i64::try_from(index).unwrap(),
            &message,
        ));
        old = id;
    }
    fs::write(path, bytes).unwrap();
    id
}

fn list(fixture: &Fixture, request: &StashListRequest) -> Result<StashPage, AppError> {
    get_stashes(&ActiveRepo::validate(fixture.dir.path()).unwrap(), request)
}

#[test]
fn empty_and_unborn_repositories_do_not_create_a_ref_or_log() {
    for fixture in [Fixture::new(), fixture()] {
        let path = log_path(&fixture);
        let result = list(&fixture, &StashListRequest::default()).unwrap();
        assert_eq!((result.total, result.total_matches), (0, 0));
        assert!(result.entries.is_empty());
        assert!(result.next_cursor.is_none());
        assert!(result.selected_present.is_none());
        assert!(!path.exists());
        assert!(fixture.repo.find_reference("refs/stash").is_err());
        assert_eq!(result.limits.default_page_size, DEFAULT_STASH_PAGE_SIZE);
        assert_eq!(result.limits.max_page_size, MAX_STASH_PAGE_SIZE);
        assert_eq!(result.limits.max_reflog_bytes, MAX_STASH_REFLOG_BYTES);
        assert_eq!(result.limits.max_entries, MAX_STASH_ENTRIES);
        assert_eq!(result.limits.max_entry_bytes, MAX_STASH_ENTRY_BYTES);
        assert_eq!(result.limits.max_search_bytes, MAX_STASH_SEARCH_BYTES);
        assert_eq!(result.limits.max_cursor_bytes, MAX_STASH_CURSOR_BYTES);
    }
}

#[test]
fn rows_match_git_and_libgit2_without_deduplicating_objects_or_writing_the_log() {
    let fixture = fixture();
    write_log(&fixture, 3);
    let before = fs::read(log_path(&fixture)).unwrap();
    let page = list(&fixture, &StashListRequest::default()).unwrap();
    let expected: Vec<_> = git(&fixture, &["stash", "list", "--format=%H%x09%gs"])
        .lines()
        .map(str::to_owned)
        .collect();
    assert_eq!(page.total, 3);
    assert_eq!(page.entries.len(), 3);
    let reflog = fixture.repo.reflog("refs/stash").unwrap();
    for (index, entry) in page.entries.iter().enumerate() {
        let oracle = reflog.get(index).unwrap();
        assert_eq!(
            format!("{}\t{}", entry.stash_id, entry.message.as_deref().unwrap()),
            expected[index]
        );
        assert_eq!(entry.stash_id, oracle.id_new().to_string());
        assert_eq!(entry.index, index as u32);
        assert_eq!(
            entry.recorded_at,
            oracle.committer().when().seconds().to_string()
        );
        assert_eq!(
            entry.offset_minutes,
            oracle.committer().when().offset_minutes()
        );
        assert_eq!(entry.message.as_deref(), oracle.message().unwrap());
    }
    assert_eq!(fs::read(log_path(&fixture)).unwrap(), before);
}

#[test]
fn pages_of_one_two_and_two_hundred_reconstruct_the_same_201_rows() {
    let fixture = fixture();
    write_log(&fixture, 201);
    for size in [1, 2, 200] {
        let mut request = StashListRequest {
            limit: Some(size),
            ..Default::default()
        };
        let mut entries = Vec::new();
        let mut revision = None;
        loop {
            let page = list(&fixture, &request).unwrap();
            assert_eq!((page.total, page.total_matches), (201, 201));
            assert!(page.entries.len() <= usize::from(size));
            if let Some(previous) = &revision {
                assert_eq!(previous, &page.revision);
            }
            revision = Some(page.revision);
            entries.extend(page.entries);
            request.cursor = page.next_cursor;
            if request.cursor.is_none() {
                break;
            }
        }
        assert_eq!(entries.len(), 201);
        assert_eq!(
            entries.iter().map(|entry| entry.index).collect::<Vec<_>>(),
            (0..201).collect::<Vec<_>>()
        );
        assert_eq!(
            entries.first().unwrap().message.as_deref(),
            Some("WIP on main: change 200")
        );
        assert_eq!(
            entries.last().unwrap().message.as_deref(),
            Some("On archived/branch: oldest needle")
        );
    }
}

#[test]
fn search_covers_the_complete_snapshot_and_selection_membership_is_independent() {
    let fixture = fixture();
    let id = write_log(&fixture, 201);
    let request = StashListRequest {
        limit: Some(1),
        search: Some("  ARCHIVED/BRANCH  ".into()),
        selected_stash_id: Some(id.to_string()),
        ..Default::default()
    };
    let page = list(&fixture, &request).unwrap();
    assert_eq!(page.search, "archived/branch");
    assert_eq!((page.total, page.total_matches), (201, 1));
    assert_eq!(page.entries[0].index, 200);
    assert_eq!(page.selected_present, Some(true));
    let empty = list(
        &fixture,
        &StashListRequest {
            search: Some("no match".into()),
            ..request.clone()
        },
    )
    .unwrap();
    assert!(empty.entries.is_empty());
    assert_eq!(empty.total_matches, 0);
    assert_eq!(empty.selected_present, Some(true));
    assert_eq!(
        list(
            &fixture,
            &StashListRequest {
                selected_stash_id: Some("f".repeat(40)),
                ..request
            }
        )
        .unwrap()
        .selected_present,
        Some(false)
    );
}

#[test]
fn search_pagination_is_scoped_to_normalized_unicode_search_not_page_size() {
    let fixture = fixture();
    let id = write_log(&fixture, 3);
    fs::write(
        log_path(&fixture),
        (0..3)
            .map(|index| row(id, id, index, "On revisión: Ajuste ÍNDICE"))
            .collect::<String>(),
    )
    .unwrap();
    let first = list(
        &fixture,
        &StashListRequest {
            limit: Some(1),
            search: Some(" ÍNDICE ".into()),
            ..Default::default()
        },
    )
    .unwrap();
    let request = StashListRequest {
        limit: Some(2),
        search: Some("índice".into()),
        cursor: first.next_cursor,
        ..Default::default()
    };
    assert_eq!(list(&fixture, &request).unwrap().entries.len(), 2);
    assert!(matches!(
        list(
            &fixture,
            &StashListRequest {
                search: Some("revision".into()),
                ..request
            }
        ),
        Err(AppError::StaleCursor(_))
    ));
    assert_eq!(
        list(
            &fixture,
            &StashListRequest {
                search: Some("indice".into()),
                ..Default::default()
            }
        )
        .unwrap()
        .total_matches,
        0
    );
}

#[test]
fn another_repository_cannot_resume_a_cursor_even_with_identical_bytes() {
    let first = fixture();
    let second = fixture();
    write_log(&first, 3);
    write_log(&second, 3);
    assert_eq!(
        fs::read(log_path(&first)).unwrap(),
        fs::read(log_path(&second)).unwrap()
    );
    let page = list(
        &first,
        &StashListRequest {
            limit: Some(1),
            ..Default::default()
        },
    )
    .unwrap();
    assert!(matches!(
        list(
            &second,
            &StashListRequest {
                cursor: page.next_cursor,
                ..Default::default()
            }
        ),
        Err(AppError::StaleCursor(_))
    ));
}

#[test]
fn changing_old_entries_or_adding_a_duplicate_invalidates_cursors_with_the_same_tip() {
    let fixture = fixture();
    let id = write_log(&fixture, 3);
    let first = list(
        &fixture,
        &StashListRequest {
            limit: Some(1),
            ..Default::default()
        },
    )
    .unwrap();
    git(&fixture, &["stash", "drop", "stash@{2}"]);
    assert_eq!(
        fixture.repo.find_reference("refs/stash").unwrap().target(),
        Some(id)
    );
    assert!(matches!(
        list(
            &fixture,
            &StashListRequest {
                cursor: first.next_cursor,
                ..Default::default()
            }
        ),
        Err(AppError::StaleCursor(_))
    ));
    let second = list(
        &fixture,
        &StashListRequest {
            limit: Some(1),
            ..Default::default()
        },
    )
    .unwrap();
    assert_ne!(first.revision, second.revision);
    let mut bytes = fs::read(log_path(&fixture)).unwrap();
    bytes.extend(row(id, id, 2_000, "On main: another entry").bytes());
    fs::write(log_path(&fixture), bytes).unwrap();
    assert!(matches!(
        list(
            &fixture,
            &StashListRequest {
                cursor: second.next_cursor,
                ..Default::default()
            }
        ),
        Err(AppError::StaleCursor(_))
    ));
}

#[test]
fn dropped_selection_is_not_reinterpreted_and_its_object_remains_untouched() {
    let fixture = fixture();
    let old = write_log(&fixture, 1);
    let index = fixture.commit("refs/heads/new-index", "index", &[old], 1_999);
    let new = fixture.commit("refs/heads/new-stash", "new", &[old, index], 2_000);
    fixture
        .repo
        .reference("refs/stash", new, true, "another")
        .unwrap();
    fs::write(
        log_path(&fixture),
        row(Oid::ZERO_SHA1, old, 1_000, "On main: old") + &row(old, new, 2_000, "On main: new"),
    )
    .unwrap();
    git(&fixture, &["stash", "drop", "stash@{1}"]);
    let page = list(
        &fixture,
        &StashListRequest {
            selected_stash_id: Some(old.to_string()),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(page.selected_present, Some(false));
    assert_eq!(page.entries[0].stash_id, new.to_string());
    assert!(fixture.repo.find_commit(old).is_ok());
}

#[test]
fn listing_does_not_require_the_recorded_objects_or_branches_to_exist() {
    let fixture = fixture();
    let id = Oid::from_str(&"e".repeat(40)).unwrap();
    // Raw ref storage simulates a partial/missing-object repository without
    // asking libgit2 to create a reference to an unavailable object.
    let reference = fixture.repo.commondir().join("refs/stash");
    fs::write(reference, format!("{id}\n")).unwrap();
    let path = log_path(&fixture);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(
        path,
        row(Oid::ZERO_SHA1, id, 1_000, "On deleted/branch: imported"),
    )
    .unwrap();
    let page = list(&fixture, &StashListRequest::default()).unwrap();
    assert_eq!(page.entries[0].stash_id, id.to_string());
    assert_eq!(
        page.entries[0].branch,
        StashBranch::Named {
            name: "deleted/branch".into()
        }
    );
}

#[test]
fn branch_context_is_recorded_or_explicitly_unknown() {
    let fixture = fixture();
    let id = write_log(&fixture, 1);
    let messages = [
        "On deleted/branch: custom",
        "WIP on (no branch): detached",
        "imported entry",
        "On : malformed",
        "WIP on main: normal",
    ];
    fs::write(
        log_path(&fixture),
        messages
            .iter()
            .map(|message| row(id, id, 1_000, message))
            .collect::<String>(),
    )
    .unwrap();
    let entries = list(&fixture, &StashListRequest::default())
        .unwrap()
        .entries;
    assert_eq!(
        entries[0].branch,
        StashBranch::Named {
            name: "main".into()
        }
    );
    assert_eq!(entries[1].branch, StashBranch::Unknown);
    assert_eq!(entries[2].branch, StashBranch::Unknown);
    assert_eq!(entries[3].branch, StashBranch::Detached);
    assert_eq!(
        entries[4].branch,
        StashBranch::Named {
            name: "deleted/branch".into()
        }
    );
}

#[test]
fn non_utf8_message_is_lossy_only_for_display_and_never_used_as_identity() {
    let fixture = fixture();
    let id = write_log(&fixture, 1);
    let mut bytes = row(id, id, -1_000, "On main: ").into_bytes();
    bytes.pop();
    bytes.extend_from_slice(b"\xff\tmore\n");
    fs::write(log_path(&fixture), bytes).unwrap();
    let page = list(
        &fixture,
        &StashListRequest {
            search: Some("MORE".into()),
            ..Default::default()
        },
    )
    .unwrap();
    let entry = &page.entries[0];
    assert_eq!(entry.stash_id, id.to_string());
    assert!(entry.message_lossy);
    assert_eq!(entry.branch, StashBranch::Unknown);
    assert_eq!(entry.recorded_at, "-1000");
    assert_eq!(entry.message.as_deref(), Some("On main: �\tmore"));
}

#[test]
fn missing_message_and_large_timestamps_are_preserved() {
    let fixture = fixture();
    let id = write_log(&fixture, 1);
    fs::write(
        log_path(&fixture),
        format!("{id} {id} Name <email> {} +0000\n", i64::MAX),
    )
    .unwrap();
    let page = list(&fixture, &StashListRequest::default()).unwrap();
    let entry = &page.entries[0];
    assert!(entry.message.is_none());
    assert_eq!(entry.recorded_at, i64::MAX.to_string());
    assert_eq!(entry.branch, StashBranch::Unknown);
}

#[test]
fn inconsistent_or_empty_logs_do_not_masquerade_as_an_empty_stash_list() {
    let fixture = fixture();
    let id = write_log(&fixture, 1);
    fs::remove_file(log_path(&fixture)).unwrap();
    assert!(matches!(
        list(&fixture, &StashListRequest::default()),
        Err(AppError::Git(_))
    ));
    assert!(!log_path(&fixture).exists());
    fs::write(log_path(&fixture), "").unwrap();
    assert!(matches!(
        list(&fixture, &StashListRequest::default()),
        Err(AppError::Git(_))
    ));
    fixture
        .repo
        .find_reference("refs/stash")
        .unwrap()
        .delete()
        .unwrap();
    fs::write(log_path(&fixture), row(Oid::ZERO_SHA1, id, 1_000, "orphan")).unwrap();
    assert!(matches!(
        list(&fixture, &StashListRequest::default()),
        Err(AppError::Git(_))
    ));
}

#[test]
fn malformed_or_partial_records_are_errors_instead_of_silently_skipped_rows() {
    let fixture = fixture();
    let id = write_log(&fixture, 1);
    let valid = row(id, id, 1_000, "valid");
    for contents in [
        "garbage\n".into(),
        valid.trim_end_matches('\n').to_owned(),
        valid.replace("1000", "not-a-time"),
        valid.replace("-0330", "+9960"),
        valid.replace("<test@example.com>", "test@example.com"),
        valid.replace("valid", "bad\0message"),
        row(id, Oid::ZERO_SHA1, 1_000, "zero"),
        format!("{valid}\n"),
    ] {
        fs::write(log_path(&fixture), contents).unwrap();
        assert!(matches!(
            list(&fixture, &StashListRequest::default()),
            Err(AppError::Git(_))
        ));
    }
}

#[test]
fn invalid_page_sizes_searches_selected_ids_and_cursors_are_rejected() {
    let fixture = fixture();
    let mut invalid = vec![
        StashListRequest {
            limit: Some(0),
            ..Default::default()
        },
        StashListRequest {
            limit: Some(201),
            ..Default::default()
        },
        StashListRequest {
            search: Some("é".repeat(257)),
            ..Default::default()
        },
        StashListRequest {
            search: Some("bad\0search".into()),
            ..Default::default()
        },
        StashListRequest {
            selected_stash_id: Some("abc".into()),
            ..Default::default()
        },
        StashListRequest {
            selected_stash_id: Some("0".repeat(40)),
            ..Default::default()
        },
    ];
    for cursor in [
        String::new(),
        "null".into(),
        "{}".into(),
        "x".repeat(MAX_STASH_CURSOR_BYTES as usize + 1),
    ] {
        invalid.push(StashListRequest {
            cursor: Some(cursor),
            ..Default::default()
        });
    }
    for request in invalid {
        assert!(matches!(
            list(&fixture, &request),
            Err(AppError::InvalidInput(_))
        ));
    }
    assert_eq!(
        list(
            &fixture,
            &StashListRequest {
                search: Some("a".repeat(MAX_STASH_SEARCH_BYTES as usize)),
                ..Default::default()
            }
        )
        .unwrap()
        .total,
        0
    );
}

#[test]
fn altered_cursor_positions_are_rejected_even_for_identical_records() {
    let fixture = fixture();
    let id = write_log(&fixture, 3);
    fs::write(log_path(&fixture), row(id, id, 1_000, "same").repeat(3)).unwrap();
    let page = list(
        &fixture,
        &StashListRequest {
            limit: Some(1),
            ..Default::default()
        },
    )
    .unwrap();
    let original: serde_json::Value =
        serde_json::from_str(page.next_cursor.as_deref().unwrap()).unwrap();
    for (key, value) in [
        ("version", serde_json::json!(2)),
        ("position", serde_json::json!(0)),
        ("position", serde_json::json!(2)),
        ("position", serde_json::json!(3)),
        ("anchor", serde_json::json!("a".repeat(64))),
        ("unknown", serde_json::json!(true)),
    ] {
        let mut altered = original.clone();
        altered[key] = value;
        assert!(list(
            &fixture,
            &StashListRequest {
                cursor: Some(altered.to_string()),
                ..Default::default()
            }
        )
        .is_err());
    }
}

#[test]
fn entry_and_snapshot_byte_limits_accept_the_boundary_and_reject_one_more() {
    let fixture = fixture();
    let id = write_log(&fixture, 1);
    let base = row(id, id, 1_000, "");
    let message = "x".repeat(MAX_STASH_ENTRY_BYTES as usize - base.len());
    let entry = row(id, id, 1_000, &message);
    assert_eq!(entry.len(), MAX_STASH_ENTRY_BYTES as usize);
    fs::write(log_path(&fixture), &entry).unwrap();
    assert_eq!(
        list(&fixture, &StashListRequest::default()).unwrap().total,
        1
    );
    fs::write(log_path(&fixture), row(id, id, 1_000, &(message + "x"))).unwrap();
    assert!(matches!(
        list(&fixture, &StashListRequest::default()),
        Err(AppError::ResourceLimitExceeded(_))
    ));
    let bytes = entry.repeat(MAX_STASH_REFLOG_BYTES as usize / entry.len());
    assert_eq!(bytes.len(), MAX_STASH_REFLOG_BYTES as usize);
    fs::write(log_path(&fixture), bytes).unwrap();
    assert_eq!(
        list(
            &fixture,
            &StashListRequest {
                limit: Some(200),
                ..Default::default()
            }
        )
        .unwrap()
        .total,
        128
    );
    fs::OpenOptions::new()
        .write(true)
        .open(log_path(&fixture))
        .unwrap()
        .set_len(u64::from(MAX_STASH_REFLOG_BYTES) + 1)
        .unwrap();
    assert!(matches!(
        list(&fixture, &StashListRequest::default()),
        Err(AppError::ResourceLimitExceeded(_))
    ));
}

#[test]
fn entry_count_limit_accepts_twenty_thousand_and_rejects_one_more() {
    let fixture = fixture();
    let id = write_log(&fixture, MAX_STASH_ENTRIES as usize);
    let page = list(&fixture, &StashListRequest::default()).unwrap();
    assert_eq!(page.total, MAX_STASH_ENTRIES);
    assert_eq!(page.entries.len(), usize::from(DEFAULT_STASH_PAGE_SIZE));
    let mut bytes = fs::read(log_path(&fixture)).unwrap();
    bytes.extend(row(id, id, 30_000, "one more").bytes());
    fs::write(log_path(&fixture), bytes).unwrap();
    assert!(matches!(
        list(&fixture, &StashListRequest::default()),
        Err(AppError::ResourceLimitExceeded(_))
    ));
}

#[test]
fn linked_worktrees_share_the_list_and_can_resume_a_snapshot() {
    let fixture = fixture();
    write_log(&fixture, 3);
    let parent = tempfile::tempdir().unwrap();
    let path = parent.path().join("linked");
    git(
        &fixture,
        &["worktree", "add", "-b", "linked", path.to_str().unwrap()],
    );
    let page = list(
        &fixture,
        &StashListRequest {
            limit: Some(1),
            ..Default::default()
        },
    )
    .unwrap();
    let next = get_stashes(
        &ActiveRepo::validate(path).unwrap(),
        &StashListRequest {
            cursor: page.next_cursor,
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(next.revision, page.revision);
    assert_eq!(next.entries[0].index, 1);
    assert_eq!(next.total, 3);
}

#[test]
fn inspection_leaves_head_index_refs_reflog_and_working_files_unchanged() {
    let fixture = fixture();
    write_log(&fixture, 2);
    fs::write(fixture.dir.path().join("untracked.txt"), "untouched").unwrap();
    let mut index = fixture.repo.index().unwrap();
    index.write().unwrap();
    let paths = [
        fixture.repo.path().join("HEAD"),
        fixture.repo.path().join("index"),
        fixture.repo.commondir().join("refs/stash"),
        log_path(&fixture),
        fixture.dir.path().join("untracked.txt"),
    ];
    let before: Vec<_> = paths.iter().map(|path| fs::read(path).unwrap()).collect();
    let page = list(
        &fixture,
        &StashListRequest {
            limit: Some(1),
            ..Default::default()
        },
    )
    .unwrap();
    list(
        &fixture,
        &StashListRequest {
            cursor: page.next_cursor,
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(
        before,
        paths
            .iter()
            .map(|path| fs::read(path).unwrap())
            .collect::<Vec<_>>()
    );
}

#[cfg(unix)]
#[test]
fn symlinked_logs_parent_directories_and_nonregular_files_are_rejected() {
    use std::os::unix::fs::symlink;
    let fixture = fixture();
    write_log(&fixture, 1);
    let path = log_path(&fixture);
    let outside = tempfile::NamedTempFile::new().unwrap();
    fs::remove_file(&path).unwrap();
    symlink(outside.path(), &path).unwrap();
    assert!(matches!(
        list(&fixture, &StashListRequest::default()),
        Err(AppError::Git(_))
    ));
    fs::remove_file(&path).unwrap();
    fs::create_dir(&path).unwrap();
    assert!(matches!(
        list(&fixture, &StashListRequest::default()),
        Err(AppError::Git(_))
    ));
    fs::remove_dir(&path).unwrap();
    let refs = path.parent().unwrap();
    fs::rename(refs, refs.with_file_name("refs-original")).unwrap();
    let outside_dir = tempfile::tempdir().unwrap();
    symlink(outside_dir.path(), refs).unwrap();
    assert!(matches!(
        list(&fixture, &StashListRequest::default()),
        Err(AppError::Git(_))
    ));
}

#[test]
#[ignore = "release-mode benchmark; run explicitly with --release --ignored --nocapture"]
#[allow(clippy::print_stderr)]
fn twenty_thousand_entry_snapshot_benchmark() {
    let fixture = fixture();
    write_log(&fixture, MAX_STASH_ENTRIES as usize);
    let request = StashListRequest {
        search: Some("oldest needle".into()),
        ..Default::default()
    };
    let start = std::time::Instant::now();
    let page = list(&fixture, &request).unwrap();
    let elapsed = start.elapsed();
    assert_eq!(page.total, MAX_STASH_ENTRIES);
    assert_eq!(page.total_matches, 1);
    assert_eq!(page.entries[0].index, MAX_STASH_ENTRIES - 1);
    eprintln!(
        "20,000-entry snapshot and oldest-entry search: {elapsed:?}; {} bytes",
        fs::metadata(log_path(&fixture)).unwrap().len()
    );
}

#[test]
fn stashes_created_by_git_match_the_libgit2_oracle_including_detached_and_custom_messages() {
    let fixture = fixture();
    let tracked = fixture.dir.path().join("tracked.txt");
    fs::write(&tracked, "base\n").unwrap();
    git(&fixture, &["add", "tracked.txt"]);
    git(
        &fixture,
        &[
            "-c",
            "commit.gpgsign=false",
            "-c",
            "core.hooksPath=",
            "commit",
            "-m",
            "tracked base",
        ],
    );
    for message in [
        None,
        Some("ÍNDICE: reintentos\ny espera"),
        Some("detached entry"),
    ] {
        if message == Some("detached entry") {
            git(&fixture, &["checkout", "--detach"]);
        }
        fs::write(&tracked, "prepared\n").unwrap();
        git(&fixture, &["add", "tracked.txt"]);
        fs::write(&tracked, "saved\n").unwrap();
        fs::write(fixture.dir.path().join("new.txt"), "new\n").unwrap();
        if let Some(message) = message {
            git(&fixture, &["stash", "push", "-u", "-m", message]);
        } else {
            git(&fixture, &["stash", "push", "-u"]);
        }
    }
    let before = fs::read(log_path(&fixture)).unwrap();
    let page = list(&fixture, &StashListRequest::default()).unwrap();
    let oracle = fixture.repo.reflog("refs/stash").unwrap();
    assert_eq!(page.entries.len(), 3);
    assert_eq!(page.entries[0].branch, StashBranch::Detached);
    assert_eq!(
        page.entries[1].branch,
        StashBranch::Named {
            name: "main".into()
        }
    );
    for (index, entry) in page.entries.iter().enumerate() {
        let expected = oracle.get(index).unwrap();
        assert_eq!(entry.message.as_deref(), expected.message().unwrap());
        assert_eq!(entry.stash_id, expected.id_new().to_string());
        assert_eq!(
            entry.recorded_at,
            expected.committer().when().seconds().to_string()
        );
    }
    assert_eq!(before, fs::read(log_path(&fixture)).unwrap());
}

#[test]
fn rewriting_only_message_bytes_invalidates_the_revision_even_with_the_original_mtime() {
    let fixture = fixture();
    write_log(&fixture, 3);
    let path = log_path(&fixture);
    let stamp = filetime::FileTime::from_last_modification_time(&fs::metadata(&path).unwrap());
    let page = list(
        &fixture,
        &StashListRequest {
            limit: Some(1),
            ..Default::default()
        },
    )
    .unwrap();
    let contents = fs::read_to_string(&path)
        .unwrap()
        .replace("change", "update");
    fs::write(&path, contents).unwrap();
    filetime::set_file_mtime(&path, stamp).unwrap();
    assert!(matches!(
        list(
            &fixture,
            &StashListRequest {
                cursor: page.next_cursor,
                ..Default::default()
            }
        ),
        Err(AppError::StaleCursor(_))
    ));
}

#[test]
fn a_symbolic_stash_ref_or_a_tip_that_disagrees_with_the_log_is_an_error() {
    let fixture = fixture();
    write_log(&fixture, 2);
    fixture
        .repo
        .reference_symbolic("refs/stash", "refs/heads/main", true, "symbolic")
        .unwrap();
    assert!(matches!(
        list(&fixture, &StashListRequest::default()),
        Err(AppError::Git(_))
    ));
    let base = fixture.repo.head().unwrap().target().unwrap();
    fs::write(
        fixture.repo.commondir().join("refs/stash"),
        format!("{base}\n"),
    )
    .unwrap();
    assert!(matches!(
        list(&fixture, &StashListRequest::default()),
        Err(AppError::Git(_))
    ));
}

#[cfg(unix)]
#[test]
fn unreadable_reflog_is_a_filesystem_error_and_fifo_is_rejected_without_opening_it() {
    use std::os::unix::fs::PermissionsExt;
    let fixture = fixture();
    write_log(&fixture, 1);
    let path = log_path(&fixture);
    let permissions = fs::metadata(&path).unwrap().permissions();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o000)).unwrap();
    let result = list(&fixture, &StashListRequest::default());
    fs::set_permissions(&path, permissions).unwrap();
    // Administrators can read mode-000 files; only assert denial when the OS enforces it.
    if result.is_err() {
        assert!(matches!(result, Err(AppError::Io(_))));
    }
    fs::remove_file(&path).unwrap();
    #[allow(
        clippy::disallowed_methods,
        reason = "Create a FIFO only in a disposable test fixture"
    )]
    let output = Command::new("mkfifo").arg(&path).output().unwrap();
    assert!(output.status.success());
    assert!(matches!(
        list(&fixture, &StashListRequest::default()),
        Err(AppError::Git(_))
    ));
}
