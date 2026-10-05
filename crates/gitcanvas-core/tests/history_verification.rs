//! Manual comparisons and latency measurements against a local reference repository.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]

mod support;

use gitcanvas_core::{
    history::{get_commits, HistoryRequest},
    repository::ActiveRepo,
};
use std::{process::Command, time::Instant};

#[test]
#[ignore = "manual verification against a read-only local reference repository"]
// This manual check intentionally uses Git itself as an independent ordering
// oracle; it is never reachable from application code or routine tests.
#[allow(clippy::disallowed_methods, clippy::print_stdout)]
fn matches_git_log_for_reference_repository() {
    let path = std::env::var("GITCANVAS_REFERENCE_REPO").expect("Set GITCANVAS_REFERENCE_REPO");
    let active = ActiveRepo::validate(&path).unwrap();
    let actual = get_commits(
        &active,
        &HistoryRequest {
            limit: 50,
            cursor: None,
            roots: None,
        },
    )
    .unwrap();
    let git = Command::new("git")
        .args([
            "-C",
            &path,
            "log",
            "--all",
            "--topo-order",
            "--format=%H",
            "-n",
            "50",
        ])
        .output()
        .unwrap();
    assert!(git.status.success());
    let expected = String::from_utf8(git.stdout).unwrap();
    assert_eq!(
        actual
            .commits
            .iter()
            .map(|commit| commit.id.as_str())
            .collect::<Vec<_>>(),
        expected.lines().collect::<Vec<_>>()
    );
    println!(
        "Compared {} commits with git log --all --topo-order",
        actual.commits.len()
    );
}

#[test]
#[ignore = "manual latency measurement, deliberately no timing assertion"]
// Repacking and reporting the benchmark require the Git CLI in this manual tool.
#[allow(clippy::disallowed_methods, clippy::print_stdout)]
fn report_history_latency_for_ten_thousand_commits() {
    let fixture = support::Fixture::new();
    let mut parents = Vec::new();
    for time in 1..=10_000 {
        parents = vec![fixture.commit("HEAD", "benchmark commit", &parents, time)];
    }
    for storage in ["loose", "loose-cached", "packed", "packed-cached"] {
        if storage == "packed" {
            let output = Command::new("git")
                .arg("-C")
                .arg(fixture.dir.path())
                .args(["repack", "-ad"])
                .output()
                .unwrap();
            assert!(output.status.success());
        }
        let active = ActiveRepo::validate(fixture.dir.path()).unwrap();
        let reader = gitcanvas_core::history::HistoryReader::default();
        let mut elapsed = Vec::new();
        for _ in 0..50 {
            let start = Instant::now();
            let request = HistoryRequest {
                limit: 500,
                cursor: None,
                roots: None,
            };
            let page = if storage.ends_with("cached") {
                reader.get_commits(&active, &request)
            } else {
                get_commits(&active, &request)
            }
            .unwrap();
            assert_eq!(page.commits.len(), 500);
            elapsed.push(start.elapsed());
        }
        elapsed.sort();
        println!(
            "{storage} / 10,000 commits / 500 per page / 50 samples: p50={:?}, p95={:?}, max={:?}",
            elapsed[24], elapsed[47], elapsed[49]
        );
    }
}
