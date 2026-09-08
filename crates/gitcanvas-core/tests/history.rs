#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]

mod support;

use gitcanvas_core::{
    error::AppError,
    history::{get_commits, HistoryRequest},
    repository::ActiveRepo,
};
use support::Fixture;

fn request(limit: u16) -> HistoryRequest {
    HistoryRequest {
        limit,
        cursor: None,
        roots: None,
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
    assert_eq!(first.next_cursor, Some(middle.to_string()));
    let last = get_commits(
        &active,
        &HistoryRequest {
            limit: 2,
            cursor: first.next_cursor,
            roots: Some(first.roots),
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
            roots: None
        }
    )
    .is_err());
    assert!(matches!(
        get_commits(
            &active,
            &HistoryRequest {
                limit: 1,
                cursor: Some("0".repeat(40)),
                roots: Some(vec![])
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
