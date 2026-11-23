//! Author identity resolution and bounded `.mailmap` reading (CR-1, cases 1-4 and 42).

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    clippy::arithmetic_side_effects
)]

mod support;

use std::fs;

use git2::{Oid, Signature, Time};
use gitcanvas_core::authors::{load_mailmap, MailmapWarning, MAX_MAILMAP_BYTES};
use gitcanvas_core::{
    authors::{
        get_author_catalog_chunk, get_author_commit_ids, AuthorCatalogRequest,
        AuthorCommitIdsRequest, AuthorKey, IncompleteReason, AUTHOR_CATALOG_CHUNK_SIZE,
    },
    history::{HistoryReader, MAX_PAGE_SIZE},
    repository::ActiveRepo,
};
use support::Fixture;

fn commit_as(fixture: &Fixture, name: &str, email: &str, files: &[(&str, &[u8])]) -> Oid {
    let signature = Signature::new(name, email, &Time::new(1_700_000_000, 0)).unwrap();
    let mut builder = fixture.repo.treebuilder(None).unwrap();
    for (path, content) in files {
        let blob = fixture.repo.blob(content).unwrap();
        builder.insert(path, blob, 0o100_644).unwrap();
    }
    let tree = fixture.repo.find_tree(builder.write().unwrap()).unwrap();
    fixture
        .repo
        .commit(Some("HEAD"), &signature, &signature, "c", &tree, &[])
        .unwrap()
}

#[test]
fn author_commit_ids_page_across_the_visible_history_without_gaps_or_duplicates() {
    let fixture = Fixture::new();
    let tree_id = fixture.repo.treebuilder(None).unwrap().write().unwrap();
    let tree = fixture.repo.find_tree(tree_id).unwrap();
    let mut parent = fixture.repo.head().ok().and_then(|head| head.target());
    let mut selected = Vec::new();
    for index in 0..1_002 {
        let (name, email) = if index % 2 == 0 {
            ("Selected", "selected@example.test")
        } else {
            ("Other", "other@example.test")
        };
        let signature = Signature::new(name, email, &Time::new(i64::from(index), 0)).unwrap();
        let parents = parent
            .map(|id| vec![fixture.repo.find_commit(id).unwrap()])
            .unwrap_or_default();
        let parent_refs: Vec<_> = parents.iter().collect();
        parent = Some(
            fixture
                .repo
                .commit(
                    Some("HEAD"),
                    &signature,
                    &signature,
                    "mixed",
                    &tree,
                    &parent_refs,
                )
                .unwrap(),
        );
        if index % 2 == 0 {
            selected.push(parent.unwrap().to_string());
        }
    }
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();
    let reader = HistoryReader::default();
    let visible = reader
        .get_commits(
            &active,
            &gitcanvas_core::history::HistoryRequest {
                limit: 20,
                cursor: None,
                roots: None,
                references: None,
            },
        )
        .unwrap();
    assert_eq!(visible.commits.len(), 20);
    let author = AuthorKey {
        name: "Selected".into(),
        email: "selected@example.test".into(),
    };
    let first = get_author_commit_ids(
        &active,
        &AuthorCommitIdsRequest {
            author: author.clone(),
            cursor: None,
        },
        &reader,
    )
    .unwrap();
    assert_eq!(first.commit_ids.len(), 500);
    let cursor = first.next_cursor.clone().unwrap();
    let second = get_author_commit_ids(
        &active,
        &AuthorCommitIdsRequest {
            author,
            cursor: Some(cursor),
        },
        &reader,
    )
    .unwrap();
    assert_eq!(second.commit_ids.len(), 1);
    assert!(second.next_cursor.is_none());
    let actual: Vec<_> = first
        .commit_ids
        .into_iter()
        .chain(second.commit_ids)
        .collect();
    selected.reverse();
    assert_eq!(actual, selected);
    assert!(actual
        .iter()
        .any(|id| !visible.commits.iter().any(|commit| commit.id == *id)));
}

#[test]
fn author_commit_ids_for_absent_author_returns_empty_page() {
    let fixture = Fixture::new();
    commit_as(&fixture, "Existing", "existing@example.test", &[]);
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();
    let page = get_author_commit_ids(
        &active,
        &AuthorCommitIdsRequest {
            author: AuthorKey {
                name: "Absent".into(),
                email: "absent@example.test".into(),
            },
            cursor: None,
        },
        &HistoryReader::default(),
    )
    .unwrap();
    assert!(page.commit_ids.is_empty());
    assert!(page.next_cursor.is_none());
}

#[test]
fn author_commit_cursor_is_stale_after_mailmap_or_roots_change() {
    let fixture = Fixture::new();
    let tree_id = fixture.repo.treebuilder(None).unwrap().write().unwrap();
    let tree = fixture.repo.find_tree(tree_id).unwrap();
    let mut parent = fixture.repo.head().ok().and_then(|head| head.target());
    for index in 0..502 {
        let signature = Signature::new(
            "Selected",
            "selected@example.test",
            &Time::new(i64::from(index), 0),
        )
        .unwrap();
        let parents = parent
            .map(|id| vec![fixture.repo.find_commit(id).unwrap()])
            .unwrap_or_default();
        let parent_refs: Vec<_> = parents.iter().collect();
        parent = Some(
            fixture
                .repo
                .commit(
                    Some("HEAD"),
                    &signature,
                    &signature,
                    "selected",
                    &tree,
                    &parent_refs,
                )
                .unwrap(),
        );
    }
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();
    let reader = HistoryReader::default();
    let author = AuthorKey {
        name: "Selected".into(),
        email: "selected@example.test".into(),
    };
    let first = get_author_commit_ids(
        &active,
        &AuthorCommitIdsRequest {
            author: author.clone(),
            cursor: None,
        },
        &reader,
    )
    .unwrap();
    let cursor = first.next_cursor.unwrap();
    let request = AuthorCommitIdsRequest {
        author,
        cursor: Some(cursor),
    };
    let path = fixture.dir.path().join(".mailmap");
    std::fs::write(&path, "Canonical <selected@example.test>\n").unwrap();
    assert!(matches!(
        get_author_commit_ids(&active, &request, &reader),
        Err(gitcanvas_core::error::AppError::StaleCursor(_))
    ));

    std::fs::remove_file(path).unwrap();
    assert!(get_author_commit_ids(&active, &request, &reader).is_ok());
    add_catalog_commits(&fixture, 1);
    assert!(matches!(
        get_author_commit_ids(&active, &request, &reader),
        Err(gitcanvas_core::error::AppError::StaleCursor(_))
    ));
}

fn key(
    mailmap: &gitcanvas_core::authors::LoadedMailmap,
    name: &str,
    email: &str,
) -> (String, String) {
    let key = mailmap.resolve(name, email);
    (key.name, key.email)
}

#[test]
fn same_name_with_different_emails_is_two_identities() {
    let fixture = Fixture::new();
    let mailmap = load_mailmap(&fixture.repo);
    assert_ne!(
        mailmap.resolve("Ana", "ana@a.test"),
        mailmap.resolve("Ana", "ana@b.test")
    );
}

#[test]
fn email_letter_case_is_not_merged_without_mailmap() {
    let fixture = Fixture::new();
    let mailmap = load_mailmap(&fixture.repo);
    assert_ne!(
        mailmap.resolve("Ana", "ana@a.test"),
        mailmap.resolve("Ana", "ANA@a.test")
    );
}

#[test]
fn working_tree_mailmap_joins_two_emails_under_the_canonical_name() {
    let fixture = Fixture::new();
    fs::write(
        fixture.dir.path().join(".mailmap"),
        "Ana Canonical <ana@a.test>\nAna Canonical <ana@a.test> <old@b.test>\n",
    )
    .unwrap();
    let mailmap = load_mailmap(&fixture.repo);
    let one = key(&mailmap, "Ana", "ana@a.test");
    let two = key(&mailmap, "ana old", "old@b.test");
    assert_eq!(one, ("Ana Canonical".to_owned(), "ana@a.test".to_owned()));
    assert_eq!(one, two);
    assert_eq!(mailmap.warning(), None);
}

#[test]
fn head_mailmap_is_used_when_the_working_tree_has_none() {
    let fixture = Fixture::new();
    commit_as(
        &fixture,
        "Ana",
        "ana@a.test",
        &[(".mailmap", b"Ana Canonical <ana@a.test> <old@b.test>\n")],
    );
    let mailmap = load_mailmap(&fixture.repo);
    assert_eq!(
        key(&mailmap, "x", "old@b.test"),
        ("Ana Canonical".to_owned(), "ana@a.test".to_owned())
    );
}

#[test]
fn absent_empty_and_invalid_mailmaps_never_fail() {
    let fixture = Fixture::new();
    let absent = load_mailmap(&fixture.repo);
    assert_eq!(absent.warning(), None);
    assert_eq!(
        key(&absent, "Ana", "a@a.test"),
        ("Ana".to_owned(), "a@a.test".to_owned())
    );

    let path = fixture.dir.path().join(".mailmap");
    fs::write(&path, "").unwrap();
    let empty = load_mailmap(&fixture.repo);
    assert_eq!(empty.warning(), None);
    assert_eq!(
        key(&empty, "Ana", "a@a.test"),
        ("Ana".to_owned(), "a@a.test".to_owned())
    );

    fs::write(
        &path,
        "<<< garbage\n# comment\nOk Name <ok@a.test> <x@a.test>\n",
    )
    .unwrap();
    let invalid = load_mailmap(&fixture.repo);
    assert_eq!(key(&invalid, "q", "x@a.test").0, "Ok Name");
    assert_eq!(
        key(&invalid, "Zed", "z@a.test"),
        ("Zed".to_owned(), "z@a.test".to_owned())
    );
}

#[test]
fn unreadable_mailmap_warns_and_leaves_identities_unmapped() {
    let fixture = Fixture::new();
    // A directory where the file should be, and non UTF-8 content, are both unreadable.
    fs::create_dir(fixture.dir.path().join(".mailmap")).unwrap();
    let directory = load_mailmap(&fixture.repo);
    assert_eq!(directory.warning(), Some(MailmapWarning::Unreadable));
    assert_eq!(
        key(&directory, "Ana", "a@a.test"),
        ("Ana".to_owned(), "a@a.test".to_owned())
    );

    fs::remove_dir(fixture.dir.path().join(".mailmap")).unwrap();
    fs::write(fixture.dir.path().join(".mailmap"), [0xff, 0xfe, 0x00]).unwrap();
    let binary = load_mailmap(&fixture.repo);
    assert_eq!(binary.warning(), Some(MailmapWarning::Unreadable));
}

#[test]
fn oversized_mailmap_is_refused_before_reading() {
    let fixture = Fixture::new();
    let path = fixture.dir.path().join(".mailmap");
    let mut content = b"Big Name <a@a.test> <b@a.test>\n".to_vec();
    content.resize(MAX_MAILMAP_BYTES + 1, b'#');
    fs::write(&path, &content).unwrap();
    let mailmap = load_mailmap(&fixture.repo);
    assert_eq!(mailmap.warning(), Some(MailmapWarning::Unreadable));
    assert_eq!(key(&mailmap, "n", "b@a.test").0, "n");

    // Exactly at the ceiling is accepted.
    content.truncate(MAX_MAILMAP_BYTES);
    fs::write(&path, &content).unwrap();
    assert_eq!(load_mailmap(&fixture.repo).warning(), None);
}

#[test]
fn oversized_head_blob_is_refused() {
    let fixture = Fixture::new();
    let mut content = b"Big Name <a@a.test> <b@a.test>\n".to_vec();
    content.resize(MAX_MAILMAP_BYTES + 1, b'#');
    commit_as(&fixture, "Ana", "a@a.test", &[(".mailmap", &content)]);
    let mailmap = load_mailmap(&fixture.repo);
    assert_eq!(mailmap.warning(), Some(MailmapWarning::Unreadable));
}

#[test]
fn mailmap_file_config_pointing_outside_the_repository_is_ignored() {
    let fixture = Fixture::new();
    let outside = tempfile::tempdir().unwrap();
    let outside_file = outside.path().join("elsewhere.mailmap");
    fs::write(&outside_file, "Leaked <leak@a.test> <b@a.test>\n").unwrap();
    fixture
        .repo
        .config()
        .unwrap()
        .set_str("mailmap.file", outside_file.to_str().unwrap())
        .unwrap();
    let mailmap = load_mailmap(&fixture.repo);
    assert_eq!(
        key(&mailmap, "n", "b@a.test"),
        ("n".to_owned(), "b@a.test".to_owned())
    );
}

#[cfg(unix)]
#[test]
fn symlinked_mailmap_is_not_followed() {
    let fixture = Fixture::new();
    let outside = tempfile::tempdir().unwrap();
    let target = outside.path().join("secret");
    fs::write(&target, "Leaked <leak@a.test> <b@a.test>\n").unwrap();
    std::os::unix::fs::symlink(&target, fixture.dir.path().join(".mailmap")).unwrap();
    let mailmap = load_mailmap(&fixture.repo);
    assert_eq!(mailmap.warning(), Some(MailmapWarning::Unreadable));
    assert_eq!(key(&mailmap, "n", "b@a.test").0, "n");
}

#[test]
fn content_hash_changes_with_the_effective_content() {
    let fixture = Fixture::new();
    let path = fixture.dir.path().join(".mailmap");
    let none = load_mailmap(&fixture.repo).content_hash().to_owned();
    fs::write(&path, "").unwrap();
    assert_eq!(load_mailmap(&fixture.repo).content_hash(), none);
    fs::write(&path, "A <a@a.test> <b@a.test>\n").unwrap();
    let one = load_mailmap(&fixture.repo).content_hash().to_owned();
    assert_ne!(one, none);
    fs::write(&path, "A <a@a.test> <c@a.test>\n").unwrap();
    assert_ne!(load_mailmap(&fixture.repo).content_hash(), one);
}

fn add_catalog_commits(fixture: &Fixture, count: usize) {
    let tree_id = fixture.repo.treebuilder(None).unwrap().write().unwrap();
    let tree = fixture.repo.find_tree(tree_id).unwrap();
    let mut parent = fixture.repo.head().ok().and_then(|head| head.target());
    for index in 0..count {
        let signature = Signature::new(
            &format!("Author {index}"),
            &format!("author-{index}@example.test"),
            &Time::new(i64::try_from(index).unwrap(), 0),
        )
        .unwrap();
        let parents = parent
            .map(|id| vec![fixture.repo.find_commit(id).unwrap()])
            .unwrap_or_default();
        let parent_refs: Vec<_> = parents.iter().collect();
        parent = Some(
            fixture
                .repo
                .commit(
                    Some("HEAD"),
                    &signature,
                    &signature,
                    "catalog",
                    &tree,
                    &parent_refs,
                )
                .unwrap(),
        );
    }
}

fn load_unfiltered_history(active: &ActiveRepo, reader: &HistoryReader) -> Vec<String> {
    let history = reader
        .get_commits(
            active,
            &gitcanvas_core::history::HistoryRequest {
                limit: MAX_PAGE_SIZE,
                cursor: None,
                roots: None,
                references: None,
            },
        )
        .unwrap();
    assert_eq!(history.commits.len(), usize::from(MAX_PAGE_SIZE));
    let next_page = reader
        .get_commits(
            active,
            &gitcanvas_core::history::HistoryRequest {
                limit: MAX_PAGE_SIZE,
                cursor: history.next_cursor.clone(),
                roots: Some(history.roots.clone()),
                references: Some(history.references.clone()),
            },
        )
        .unwrap();
    assert_eq!(next_page.roots, history.roots);
    assert_eq!(next_page.commits.len(), usize::from(MAX_PAGE_SIZE));

    history.roots
}

#[test]
fn author_catalog_returns_delta_chunks_and_detects_stale_mailmap_cursor() {
    let fixture = Fixture::new();
    add_catalog_commits(&fixture, AUTHOR_CATALOG_CHUNK_SIZE + 1);
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();
    let reader = HistoryReader::default();
    let tree = fixture
        .repo
        .find_tree(fixture.repo.treebuilder(None).unwrap().write().unwrap())
        .unwrap();
    let side = Signature::new("Only on side", "side@example.test", &Time::new(10_000, 0)).unwrap();
    fixture
        .repo
        .commit(
            Some("refs/heads/catalog-side"),
            &side,
            &side,
            "side",
            &tree,
            &[],
        )
        .unwrap();
    let before_filters = get_author_catalog_chunk(
        &active,
        &AuthorCatalogRequest::default(),
        &HistoryReader::default(),
    )
    .unwrap();
    let unfiltered_roots = load_unfiltered_history(&active, &reader);
    // Loading graph history first does not affect the complete catalog scope.
    let filtered = reader
        .get_commits(
            &active,
            &gitcanvas_core::history::HistoryRequest {
                limit: MAX_PAGE_SIZE,
                cursor: None,
                roots: None,
                references: Some(vec!["HEAD".into()]),
            },
        )
        .unwrap();

    assert_ne!(filtered.roots, unfiltered_roots);
    let first =
        get_author_catalog_chunk(&active, &AuthorCatalogRequest::default(), &reader).unwrap();
    assert_eq!(first.authors, before_filters.authors);
    assert!(first
        .authors
        .iter()
        .any(|entry| entry.author.email == "side@example.test"));
    assert!(!filtered.roots.contains(
        &fixture
            .repo
            .find_reference("refs/heads/catalog-side")
            .unwrap()
            .target()
            .unwrap()
            .to_string()
    ));
    assert_eq!(first.authors.len(), AUTHOR_CATALOG_CHUNK_SIZE);
    assert_eq!(first.scanned, AUTHOR_CATALOG_CHUNK_SIZE as u64);
    assert!(!first.complete);
    let cursor = first.cursor.unwrap();

    std::fs::write(
        fixture.dir.path().join(".mailmap"),
        "Canonical <x@example.test>\n",
    )
    .unwrap();
    let stale = get_author_catalog_chunk(
        &active,
        &AuthorCatalogRequest {
            cursor: Some(cursor.clone()),
            cancelled: false,
        },
        &reader,
    );
    assert!(matches!(
        stale,
        Err(gitcanvas_core::error::AppError::StaleCursor(_))
    ));
    std::fs::remove_file(fixture.dir.path().join(".mailmap")).unwrap();
    add_catalog_commits(&fixture, 1);
    let stale_roots = get_author_catalog_chunk(
        &active,
        &AuthorCatalogRequest {
            cursor: Some(cursor),
            cancelled: false,
        },
        &reader,
    );
    assert!(matches!(
        stale_roots,
        Err(gitcanvas_core::error::AppError::StaleCursor(_))
    ));
}

#[test]
fn author_catalog_finishes_last_delta_and_cancellation_is_between_chunks() {
    let fixture = Fixture::new();
    add_catalog_commits(&fixture, AUTHOR_CATALOG_CHUNK_SIZE + 1);
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();
    let reader = HistoryReader::default();
    let first =
        get_author_catalog_chunk(&active, &AuthorCatalogRequest::default(), &reader).unwrap();
    let cursor = first.cursor.unwrap();
    let cancelled = get_author_catalog_chunk(
        &active,
        &AuthorCatalogRequest {
            cursor: Some(cursor.clone()),
            cancelled: true,
        },
        &reader,
    )
    .unwrap();
    assert!(!cancelled.complete);
    assert_eq!(
        cancelled.incomplete_reason,
        Some(IncompleteReason::Cancelled)
    );
    assert_eq!(cancelled.scanned, AUTHOR_CATALOG_CHUNK_SIZE as u64);

    let final_chunk = get_author_catalog_chunk(
        &active,
        &AuthorCatalogRequest {
            cursor: Some(cursor),
            cancelled: false,
        },
        &reader,
    )
    .unwrap();
    assert!(final_chunk.complete);
    assert_eq!(final_chunk.scanned, (AUTHOR_CATALOG_CHUNK_SIZE + 1) as u64);
    assert_eq!(final_chunk.authors.len(), 1);
}

#[test]
fn author_catalog_stops_without_chunks_when_history_exceeds_reader_budget() {
    let fixture = Fixture::new();
    add_catalog_commits(&fixture, AUTHOR_CATALOG_CHUNK_SIZE + 2);
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();
    let reader = HistoryReader::with_budget(AUTHOR_CATALOG_CHUNK_SIZE + 1);
    let chunk =
        get_author_catalog_chunk(&active, &AuthorCatalogRequest::default(), &reader).unwrap();
    assert!(!chunk.complete);
    assert_eq!(
        chunk.incomplete_reason,
        Some(IncompleteReason::HistoryTooLarge)
    );
    assert!(chunk.authors.is_empty());
    assert!(chunk.cursor.is_none());
}
