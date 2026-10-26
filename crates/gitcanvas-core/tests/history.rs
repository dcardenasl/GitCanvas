//! Commit history traversal and pagination integration tests.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]

mod support;

use gitcanvas_core::{
    error::AppError,
    history::{get_commit, get_commits, HistoryReader, HistoryRequest},
    repository::ActiveRepo,
};
use support::Fixture;

fn request(limit: u16) -> HistoryRequest {
    HistoryRequest {
        limit,
        cursor: None,
        roots: None,
        references: None,
    }
}

#[test]
fn linear_history_has_metadata_and_exact_page_boundaries() {
    let fixture = Fixture::new();
    let root = fixture.commit("HEAD", "root", &[], 1);
    let middle = fixture.commit("HEAD", "middle\n\nbody", &[root], 2);
    let tip = fixture.commit("HEAD", "tip", &[middle], 3);
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();
    let first = get_commits(&active, &request(2)).unwrap();
    assert_eq!(
        first
            .commits
            .iter()
            .map(|c| c.id.clone())
            .collect::<Vec<_>>(),
        vec![tip.to_string(), middle.to_string()]
    );
    assert_eq!(first.commits[1].message, "middle\n\nbody");
    assert_eq!(first.commits[1].author_email, "test@example.com");
    assert_eq!(first.commits[1].parents, vec![root.to_string()]);
    assert!(first
        .next_cursor
        .as_deref()
        .is_some_and(|cursor| cursor.ends_with(&middle.to_string())));
    let last = get_commits(
        &active,
        &HistoryRequest {
            limit: 2,
            cursor: first.next_cursor,
            roots: Some(first.roots),
            references: Some(first.references),
        },
    )
    .unwrap();
    assert_eq!(last.commits[0].id, root.to_string());
    assert!(last.next_cursor.is_none());
    assert!(get_commits(&active, &request(3))
        .unwrap()
        .next_cursor
        .is_none());
}

#[test]
fn merge_octopus_and_diverged_branches_keep_topological_order_across_pages() {
    let fixture = Fixture::new();
    let root = fixture.commit("HEAD", "root", &[], 1);
    let a = fixture.commit("refs/heads/a", "a", &[root], 2);
    let b = fixture.commit("refs/heads/b", "b", &[root], 3);
    let c = fixture.commit("refs/heads/c", "c", &[root], 4);
    let merge = fixture.commit("HEAD", "octopus", &[root, a, b, c], 5);
    let diverged = fixture.commit("refs/heads/diverged", "diverged", &[b], 6);
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();
    let full = get_commits(&active, &request(500)).unwrap();
    let ids: Vec<_> = full.commits.iter().map(|c| c.id.clone()).collect();
    assert_eq!(ids.len(), 6);
    assert!(ids.contains(&diverged.to_string()));
    assert_eq!(
        full.commits
            .iter()
            .find(|c| c.id == merge.to_string())
            .unwrap()
            .parents
            .len(),
        4
    );
    for commit in &full.commits {
        for parent in &commit.parents {
            assert!(
                ids.iter().position(|id| id == &commit.id).unwrap()
                    < ids.iter().position(|id| id == parent).unwrap()
            );
        }
    }
    let mut paginated = Vec::new();
    let mut next = request(1);
    loop {
        let page = get_commits(&active, &next).unwrap();
        paginated.extend(page.commits.iter().map(|c| c.id.clone()));
        if page.next_cursor.is_none() {
            break;
        }
        next = HistoryRequest {
            limit: 1,
            cursor: page.next_cursor,
            roots: Some(page.roots),
            references: Some(page.references),
        };
    }
    assert_eq!(paginated, ids);
}

#[test]
fn two_parent_merge_and_detached_head_are_included() {
    let fixture = Fixture::new();
    let root = fixture.commit("HEAD", "root", &[], 1);
    let side = fixture.commit("refs/heads/side", "side", &[root], 2);
    let merged = fixture.commit("HEAD", "merge", &[root, side], 3);
    fixture.repo.set_head_detached(merged).unwrap();
    let detached = fixture.commit("HEAD", "detached", &[merged], 4);
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();
    let page = get_commits(&active, &request(500)).unwrap();
    assert_eq!(page.commits[0].id, detached.to_string());
    assert_eq!(
        page.commits[1].parents,
        vec![root.to_string(), side.to_string()]
    );
}

#[test]
fn frozen_roots_survive_ref_moves_without_missing_or_duplicating_commits() {
    let fixture = Fixture::new();
    let root = fixture.commit("HEAD", "root", &[], 1);
    let tip = fixture.commit("HEAD", "tip", &[root], 2);
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();
    let first = get_commits(&active, &request(1)).unwrap();
    fixture.commit("HEAD", "new", &[tip], 3);
    let second = get_commits(
        &active,
        &HistoryRequest {
            limit: 1,
            cursor: first.next_cursor,
            roots: Some(first.roots),
            references: Some(first.references),
        },
    )
    .unwrap();
    assert_eq!(second.commits[0].id, root.to_string());
    assert!(second.next_cursor.is_none());
}

#[test]
fn empty_repository_invalid_requests_and_unreachable_cursor() {
    let fixture = Fixture::new();
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();
    assert!(get_commits(&active, &request(500))
        .unwrap()
        .commits
        .is_empty());
    for limit in [0, 501] {
        assert!(get_commits(&active, &request(limit)).is_err());
    }
    assert!(get_commits(
        &active,
        &HistoryRequest {
            limit: 1,
            cursor: Some("bad".into()),
            roots: None,
            references: None
        }
    )
    .is_err());
    assert!(matches!(
        get_commits(
            &active,
            &HistoryRequest {
                limit: 1,
                cursor: Some(format!("{}:{}", "0".repeat(64), "0".repeat(40))),
                roots: Some(vec![]),
                references: Some(vec![])
            }
        ),
        Err(AppError::StaleCursor(_))
    ));
}

#[test]
fn maximum_page_size_is_enforced_at_exact_boundary() {
    let fixture = Fixture::new();
    let mut parents = Vec::new();
    for time in 1..=501 {
        parents = vec![fixture.commit("HEAD", "commit", &parents, time)];
    }
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();
    let first = get_commits(&active, &request(500)).unwrap();
    assert_eq!(first.commits.len(), 500);
    let second = get_commits(
        &active,
        &HistoryRequest {
            limit: 500,
            cursor: first.next_cursor,
            roots: Some(first.roots),
            references: Some(first.references),
        },
    )
    .unwrap();
    assert_eq!(second.commits.len(), 1);
    assert!(second.next_cursor.is_none());
}

#[test]
fn tags_to_blobs_do_not_break_history() {
    let fixture = Fixture::new();
    fixture.commit("HEAD", "root", &[], 1);
    let blob = fixture.repo.blob(b"content").unwrap();
    let object = fixture.repo.find_object(blob, None).unwrap();
    fixture
        .repo
        .tag_lightweight("blob", &object, false)
        .unwrap();
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();
    assert_eq!(
        get_commits(&active, &request(500)).unwrap().commits.len(),
        1
    );
}

#[test]
fn walks_only_selected_full_reference_names_and_deduplicates_shared_commits() {
    let fixture = Fixture::new();
    let base = fixture.commit("refs/heads/main", "base", &[], 1);
    let main = fixture.commit("refs/heads/main", "main", &[base], 2);
    let side = fixture.commit("refs/heads/side", "side", &[base], 3);
    fixture.repo.set_head("refs/heads/main").unwrap();
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();

    let page = get_commits(
        &active,
        &HistoryRequest {
            limit: 500,
            cursor: None,
            roots: None,
            references: Some(vec!["refs/heads/main".into()]),
        },
    )
    .unwrap();
    let ids: Vec<_> = page
        .commits
        .iter()
        .map(|commit| commit.id.as_str())
        .collect();
    assert!(ids.contains(&main.to_string().as_str()));
    assert!(!ids.contains(&side.to_string().as_str()));
    assert!(ids.contains(&base.to_string().as_str()));
    assert_eq!(page.references, vec!["refs/heads/main"]);

    let shared = get_commits(
        &active,
        &HistoryRequest {
            limit: 500,
            cursor: None,
            roots: None,
            references: Some(vec!["refs/heads/main".into(), "refs/heads/side".into()]),
        },
    )
    .unwrap();
    assert_eq!(
        shared
            .commits
            .iter()
            .filter(|commit| commit.id == base.to_string())
            .count(),
        1
    );
    assert_eq!(shared.commits.len(), 3);

    let all_off = get_commits(
        &active,
        &HistoryRequest {
            limit: 500,
            cursor: None,
            roots: None,
            references: Some(vec![]),
        },
    )
    .unwrap();
    assert!(all_off.commits.is_empty());
}

#[test]
fn rejects_a_cursor_reused_with_a_different_reference_scope() {
    let fixture = Fixture::new();
    let base = fixture.commit("refs/heads/main", "base", &[], 1);
    fixture.commit("refs/heads/main", "main", &[base], 2);
    fixture.commit("refs/heads/side", "side", &[base], 3);
    fixture.repo.set_head("refs/heads/main").unwrap();
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();
    let first = get_commits(
        &active,
        &HistoryRequest {
            limit: 1,
            cursor: None,
            roots: None,
            references: Some(vec!["refs/heads/main".into()]),
        },
    )
    .unwrap();
    let error = get_commits(
        &active,
        &HistoryRequest {
            limit: 1,
            cursor: first.next_cursor,
            roots: Some(first.roots),
            references: Some(vec!["refs/heads/side".into()]),
        },
    )
    .unwrap_err();
    assert!(matches!(error, AppError::StaleCursor(_)));
}

#[test]
fn resolves_head_independently_and_peels_annotated_tag_roots() {
    let fixture = Fixture::new();
    let base = fixture.commit("refs/heads/main", "base", &[], 1);
    let main = fixture.commit("refs/heads/main", "main", &[base], 2);
    let side = fixture.commit("refs/heads/side", "side", &[base], 3);
    let signature = git2::Signature::now("Test", "test@example.com").unwrap();
    let side_commit = fixture.repo.find_commit(side).unwrap();
    fixture
        .repo
        .tag(
            "v-side",
            side_commit.as_object(),
            &signature,
            "side release",
            false,
        )
        .unwrap();
    fixture.repo.set_head_detached(side).unwrap();
    let detached = fixture.commit("HEAD", "detached", &[side], 4);
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();

    let head = get_commits(
        &active,
        &HistoryRequest {
            limit: 500,
            cursor: None,
            roots: None,
            references: Some(vec!["HEAD".into()]),
        },
    )
    .unwrap();
    let head_ids: Vec<_> = head
        .commits
        .iter()
        .map(|commit| commit.id.as_str())
        .collect();
    assert!(head_ids.contains(&detached.to_string().as_str()));
    assert!(!head_ids.contains(&main.to_string().as_str()));

    let tag = get_commits(
        &active,
        &HistoryRequest {
            limit: 500,
            cursor: None,
            roots: None,
            references: Some(vec!["refs/tags/v-side".into()]),
        },
    )
    .unwrap();
    let tag_ids: Vec<_> = tag
        .commits
        .iter()
        .map(|commit| commit.id.as_str())
        .collect();
    assert!(tag_ids.contains(&side.to_string().as_str()));
    assert!(tag_ids.contains(&base.to_string().as_str()));
    assert!(!tag_ids.contains(&main.to_string().as_str()));
}

#[test]
fn cached_walk_matches_uncached_pages_and_ref_updates() {
    let fixture = Fixture::new();
    let root = fixture.commit("HEAD", "root", &[], 1);
    let side = fixture.commit("refs/heads/side", "side", &[root], 2);
    let tip = fixture.commit("HEAD", "merge", &[root, side], 3);
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();
    let reader = gitcanvas_core::history::HistoryReader::default();
    let first = reader.get_commits(&active, &request(1)).unwrap();
    let next = HistoryRequest {
        limit: 500,
        cursor: first.next_cursor,
        roots: Some(first.roots),
        references: Some(first.references),
    };
    let actual = reader.get_commits(&active, &next).unwrap();
    let expected = get_commits(&active, &next).unwrap();
    assert_eq!(
        serde_json::to_value(actual).unwrap(),
        serde_json::to_value(expected).unwrap()
    );
    let newest = fixture.commit("HEAD", "newest", &[tip], 4);
    assert_eq!(
        reader.get_commits(&active, &request(1)).unwrap().commits[0].id,
        newest.to_string()
    );
    assert_eq!(
        reader.get_commits(&active, &next).unwrap().commits[0].id,
        side.to_string()
    );
}

/// Walks a whole history page by page and returns every commit id in order.
fn page_through(
    read: impl Fn(&HistoryRequest) -> gitcanvas_core::history::HistoryPage,
    limit: u16,
) -> Vec<String> {
    let mut ids = Vec::new();
    let mut next = request(limit);
    loop {
        let page = read(&next);
        ids.extend(page.commits.iter().map(|commit| commit.id.clone()));
        match page.next_cursor {
            Some(cursor) => {
                next = HistoryRequest {
                    limit,
                    cursor: Some(cursor),
                    roots: Some(page.roots),
                    references: Some(page.references),
                };
            }
            None => return ids,
        }
    }
}

#[test]
fn every_way_of_reading_history_yields_the_same_order() {
    // Two branches that merge, so the order is a real topological decision and
    // not a straight line every strategy would get right.
    let fixture = Fixture::new();
    let root = fixture.commit("refs/heads/main", "root", &[], 1);
    let left = fixture.commit("refs/heads/main", "left", &[root], 2);
    let right = fixture.commit("refs/heads/side", "right", &[root], 3);
    let merge = fixture.commit("refs/heads/main", "merge", &[left, right], 4);
    let mut tip = merge;
    for time in 5..12 {
        tip = fixture.commit("refs/heads/main", "more", &[tip], time);
    }
    fixture.repo.set_head("refs/heads/main").unwrap();
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();

    let uncached = page_through(|req| get_commits(&active, req).unwrap(), 3);
    let cached_reader = HistoryReader::default();
    let cached = page_through(|req| cached_reader.get_commits(&active, req).unwrap(), 3);
    // A budget smaller than the history forces the streaming path that very
    // large repositories take.
    let streaming_reader = HistoryReader::with_budget(4);
    let streamed = page_through(|req| streaming_reader.get_commits(&active, req).unwrap(), 3);

    assert_eq!(uncached.len(), 11);
    assert_eq!(cached, uncached);
    assert_eq!(streamed, uncached);
    let unique: std::collections::HashSet<_> = uncached.iter().collect();
    assert_eq!(unique.len(), uncached.len(), "no commit appears twice");
}

#[test]
fn a_continuation_cannot_carry_an_unbounded_number_of_roots() {
    let fixture = Fixture::new();
    fixture.commit("HEAD", "root", &[], 1);
    fixture.commit(
        "HEAD",
        "child",
        &[fixture.repo.head().unwrap().target().unwrap()],
        2,
    );
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();
    let first = get_commits(
        &active,
        &HistoryRequest {
            limit: 1,
            cursor: None,
            roots: None,
            references: Some(vec!["HEAD".into()]),
        },
    )
    .unwrap();
    let cursor = first.next_cursor.expect("two commits require continuation");
    let error = get_commits(
        &active,
        &HistoryRequest {
            limit: 1,
            cursor: Some(cursor),
            roots: Some(vec!["a".repeat(40); 10_001]),
            references: Some(vec![]),
        },
    )
    .unwrap_err();
    assert!(matches!(error, AppError::InvalidInput(_)));
}

#[test]
fn a_selected_commit_is_read_without_being_in_the_current_walk() {
    let fixture = Fixture::new();
    let root = fixture.commit("HEAD", "root", &[], 1);
    let orphan = fixture.commit("refs/heads/orphan", "remembered\n\nbody", &[], 2);
    fixture
        .repo
        .find_reference("refs/heads/orphan")
        .unwrap()
        .delete()
        .unwrap();
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();
    let page = get_commits(&active, &request(1)).unwrap();
    assert_eq!(page.commits[0].id, root.to_string());
    let selected = get_commit(&active, &orphan.to_string()).unwrap();
    assert_eq!(selected.id, orphan.to_string());
    assert_eq!(selected.message, "remembered\n\nbody");
    assert!(selected.parents.is_empty());
    assert!(matches!(
        get_commit(&active, "short"),
        Err(AppError::InvalidInput(_))
    ));
    assert!(matches!(
        get_commit(&active, &"0".repeat(40)),
        Err(AppError::Git(_))
    ));
}
