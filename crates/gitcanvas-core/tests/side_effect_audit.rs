//! Cross-cutting state audit for repository inspection APIs (case 38).
#![cfg(feature = "e2e")]
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    clippy::arithmetic_side_effects,
    clippy::disallowed_methods
)]

mod support;

use std::{
    collections::BTreeMap,
    fs,
    io::{Read, Write},
    net::TcpListener,
    path::{Path, PathBuf},
    thread,
    time::Duration,
};

use git2::{build::CheckoutBuilder, Signature, StashFlags, Time};
use gitcanvas_core::{
    authors::{
        get_author_catalog_chunk, get_author_commit_ids, AuthorCatalogRequest,
        AuthorCommitIdsRequest, AuthorKey,
    },
    blob::{get_file_content, FileContentRequest},
    commit_tree::{get_commit_tree_page, CommitTreeRequest},
    diff::{get_commit_diff, DiffRequest},
    file_history::{get_file_history, FileHistoryRequest},
    github::api::GitHubClient,
    history::{get_commit, get_commits, HistoryReader, HistoryRequest},
    image::{get_commit_image, CommitImageRequest, ImageVersion},
    refs::get_repository_refs,
    releases::{
        get_cached_releases, get_release_assets_with_e2e_client, get_releases_with_e2e_client,
    },
    repository::ActiveRepo,
    stash::{
        get_stash_anchors, get_stash_file_content, get_stash_file_diff, get_stash_files,
        get_stash_fingerprint, get_stash_image, get_stashes, StashComparisonMode, StashContentSide,
        StashFileContentRequest, StashFileDiffRequest, StashFileRequest, StashFilesRequest,
        StashImageRequest, StashListRequest,
    },
    worktree::{
        get_worktree_file_content, get_worktree_file_diff, get_worktree_fingerprint,
        get_worktree_image, get_worktree_snapshot, WorktreeFileContentRequest,
        WorktreeFileDiffRequest, WorktreeImageRequest, WorktreeSide, WorktreeSnapshotRequest,
    },
    worktrees::get_repository_worktrees,
};
use support::Fixture;

fn png(width: u32, height: u32) -> Vec<u8> {
    let mut bytes = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR".to_vec();
    bytes.extend_from_slice(&width.to_be_bytes());
    bytes.extend_from_slice(&height.to_be_bytes());
    bytes
}

fn walk(root: &Path, current: &Path, output: &mut BTreeMap<PathBuf, Vec<u8>>) {
    let mut entries = fs::read_dir(current)
        .unwrap()
        .map(Result::unwrap)
        .collect::<Vec<_>>();
    entries.sort_by_key(std::fs::DirEntry::file_name);
    for entry in entries {
        let path = entry.path();
        let relative = path.strip_prefix(root).unwrap().to_path_buf();
        let metadata = fs::symlink_metadata(&path).unwrap();
        if metadata.file_type().is_symlink() {
            output.insert(
                relative,
                fs::read_link(path)
                    .unwrap()
                    .as_os_str()
                    .as_encoded_bytes()
                    .to_vec(),
            );
        } else if metadata.is_dir() {
            output.insert(relative, Vec::new());
            walk(root, &path, output);
        } else if metadata.is_file() {
            output.insert(relative, fs::read(path).unwrap());
        }
    }
}

fn snapshot(root: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
    let mut result = BTreeMap::new();
    walk(root, root, &mut result);
    result
}

fn set_up_fake_release_api() -> (String, thread::JoinHandle<Vec<String>>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let origin = format!("http://{address}");
    let asset_url = format!("{origin}/repos/acme/project/releases/assets/2");
    let worker = thread::spawn(move || {
        let mut requests = Vec::new();
        // The test makes one release-list request, then one published-release
        // and one asset-list request. A timeout also lets a failing assertion
        // join the worker without leaving a background thread behind.
        listener
            .set_nonblocking(true)
            .expect("local fake server accepts only its own test traffic");
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while requests.len() < 5 && std::time::Instant::now() < deadline {
            let (mut stream, _) = match listener.accept() {
                Ok(pair) => pair,
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(5));
                    continue;
                }
                Err(error) => panic!("fake API accept failed: {error}"),
            };
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut request = Vec::new();
            let mut buffer = [0_u8; 2048];
            while !request.windows(4).any(|window| window == b"\r\n\r\n") {
                let count = stream.read(&mut buffer).unwrap();
                if count == 0 {
                    break;
                }
                request.extend_from_slice(&buffer[..count]);
            }
            let header = String::from_utf8_lossy(&request);
            let request_line = header.lines().next().unwrap_or_default().to_owned();
            let path = request_line
                .split_whitespace()
                .nth(1)
                .unwrap_or_default()
                .to_owned();
            let body = if path.starts_with("/repos/acme/project/releases?") {
                r#"[{"id":1,"tag_name":"v1.0.0","name":"Audit release","body":"notes","html_url":"https://github.com/acme/project/releases/tag/v1.0.0","draft":false,"prerelease":false,"published_at":null}]"#.to_owned()
            } else if path == "/repos/acme/project/releases/1" {
                r#"{"id":1,"draft":false}"#.to_owned()
            } else if path.starts_with("/repos/acme/project/releases/1/assets?") {
                format!(
                    r#"[{{"id":2,"name":"release.zip","size":3,"digest":null,"url":"{asset_url}"}}]"#
                )
            } else {
                panic!("unexpected local API request: {request_line}");
            };
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            stream.write_all(response.as_bytes()).unwrap();
            requests.push(format!("{request_line}\n{header}"));
        }
        requests
    });
    (origin, worker)
}

fn create_fixture() -> (Fixture, String) {
    let mut fixture = Fixture::new();
    fixture
        .repo
        .config()
        .unwrap()
        .set_str("user.name", "Test Author")
        .unwrap();
    fixture
        .repo
        .config()
        .unwrap()
        .set_str("user.email", "test@example.com")
        .unwrap();
    fixture.repo.set_head("refs/heads/main").unwrap();
    let image = png(2, 3);
    let base = fixture.commit_files(
        "refs/heads/main",
        "base",
        &[],
        1_700_000_000,
        &[
            (".gitignore", b"ignored.txt\n"),
            ("logo.png", &image),
            ("readme.txt", b"base\n"),
        ],
    );
    let head = fixture.commit_files(
        "refs/heads/main",
        "head",
        &[base],
        1_700_000_001,
        &[
            (".gitignore", b"ignored.txt\n"),
            ("logo.png", &image),
            ("readme.txt", b"head\n"),
        ],
    );
    fixture
        .repo
        .checkout_head(Some(CheckoutBuilder::new().force()))
        .unwrap();
    fixture
        .repo
        .tag_lightweight(
            "v1.0.0",
            &fixture.repo.find_object(head, None).unwrap(),
            false,
        )
        .unwrap();
    fixture
        .repo
        .remote("origin", "https://github.com/acme/project.git")
        .unwrap();

    // Build one real stash before the audit snapshot so every stash inspection
    // operation has a saved file to read.
    fs::write(fixture.dir.path().join("readme.txt"), b"saved stash\n").unwrap();
    fixture
        .repo
        .stash_save(
            &Signature::new(
                "Test Author",
                "test@example.com",
                &Time::new(1_700_000_002, 0),
            )
            .unwrap(),
            "case 38 inspection fixture",
            Some(StashFlags::DEFAULT),
        )
        .unwrap();
    fixture
        .repo
        .checkout_head(Some(CheckoutBuilder::new().force()))
        .unwrap();

    // Stage and then unstaged-edit one tracked file; leave ignored and untracked
    // files present to make the worktree snapshot meaningful.
    fs::write(fixture.dir.path().join("readme.txt"), b"staged\n").unwrap();
    let mut index = fixture.repo.index().unwrap();
    index.add_path(Path::new("readme.txt")).unwrap();
    let staged_image = png(3, 4);
    fs::write(fixture.dir.path().join("logo.png"), &staged_image).unwrap();
    index.add_path(Path::new("logo.png")).unwrap();
    index.write().unwrap();
    fs::write(fixture.dir.path().join("readme.txt"), b"unstaged\n").unwrap();
    fs::write(fixture.dir.path().join("untracked.txt"), b"untracked\n").unwrap();
    fs::write(fixture.dir.path().join("ignored.txt"), b"ignored\n").unwrap();

    (fixture, head.to_string())
}

fn inspect_history(active: &ActiveRepo, head: &str, reader: &HistoryReader) {
    // These reads exercise the repository inspection routes and their stored
    // file versions. The snapshot covers .git, refs/reflogs, index, objects,
    // ignored/untracked files, symlinks and every tracked worktree byte.
    let history = get_commits(
        active,
        &HistoryRequest {
            limit: 20,
            cursor: None,
            roots: None,
            references: None,
        },
    )
    .unwrap();
    assert!(!history.commits.is_empty());
    get_commit(active, head).unwrap();
    get_repository_refs(active).unwrap();
    get_commit_tree_page(
        active,
        &CommitTreeRequest {
            commit_id: head.to_owned(),
            directory_path: None,
            offset: 0,
        },
    )
    .unwrap();
    get_commit_diff(
        active,
        &DiffRequest {
            commit_id: head.to_owned(),
            file_path: None,
            expand_path: None,
        },
    )
    .unwrap();
    get_file_content(
        active,
        &FileContentRequest {
            commit_id: head.to_owned(),
            path: "readme.txt".into(),
            expand: false,
        },
    )
    .unwrap();
    get_commit_image(
        active,
        &CommitImageRequest {
            commit_id: head.to_owned(),
            path: "logo.png".into(),
            previous_path: None,
            version: ImageVersion::Saved,
            expand: false,
        },
    )
    .unwrap();
    get_file_history(
        active,
        Some(reader),
        &FileHistoryRequest {
            path: "readme.txt".into(),
            start: head.to_owned(),
            limit: 20,
            cursor: None,
            focus_commit: None,
        },
    )
    .unwrap();
}

fn inspect_authors(active: &ActiveRepo, reader: &HistoryReader) {
    let catalog =
        get_author_catalog_chunk(active, &AuthorCatalogRequest::default(), reader).unwrap();
    assert!(catalog.complete);
    get_author_commit_ids(
        active,
        &AuthorCommitIdsRequest {
            author: AuthorKey {
                name: "Test Author".into(),
                email: "test@example.com".into(),
            },
            cursor: None,
        },
        reader,
    )
    .unwrap();
}

fn inspect_worktree(active: &ActiveRepo) {
    let worktree = get_worktree_snapshot(
        active,
        &WorktreeSnapshotRequest {
            staged_cursor: None,
            unstaged_cursor: None,
            limit: Some(250),
            expected_revision: None,
        },
    )
    .unwrap();
    get_worktree_file_diff(
        active,
        &WorktreeFileDiffRequest {
            side: WorktreeSide::Staged,
            path: "readme.txt".into(),
            expected_revision: Some(worktree.revision.clone()),
            expand: false,
        },
    )
    .unwrap();
    get_worktree_file_diff(
        active,
        &WorktreeFileDiffRequest {
            side: WorktreeSide::Unstaged,
            path: "readme.txt".into(),
            expected_revision: Some(worktree.revision.clone()),
            expand: false,
        },
    )
    .unwrap();
    get_worktree_file_content(
        active,
        &WorktreeFileContentRequest {
            side: WorktreeSide::Unstaged,
            path: "readme.txt".into(),
            expected_revision: Some(worktree.revision.clone()),
            expand: false,
        },
    )
    .unwrap();
    get_worktree_image(
        active,
        &WorktreeImageRequest {
            side: WorktreeSide::Staged,
            path: "logo.png".into(),
            previous_path: None,
            version: ImageVersion::Saved,
            expected_revision: Some(worktree.revision),
            expand: false,
        },
    )
    .unwrap();
    get_worktree_fingerprint(active).unwrap();
    get_repository_worktrees(active).unwrap();
}

fn inspect_stash(active: &ActiveRepo) {
    get_stash_anchors(active).unwrap();
    get_stash_fingerprint(active).unwrap();
    let stashes = get_stashes(active, &StashListRequest::default()).unwrap();
    let stash = stashes
        .entries
        .first()
        .expect("fixture has one saved stash");
    let stash_files = get_stash_files(
        active,
        &StashFilesRequest {
            stash_id: stash.stash_id.clone(),
            mode: StashComparisonMode::All,
            limit: None,
            cursor: None,
        },
    )
    .unwrap();
    let file = stash_files
        .files
        .first()
        .expect("stash fixture has a changed file");
    let file_request = StashFileRequest {
        stash_id: stash.stash_id.clone(),
        mode: StashComparisonMode::All,
        file_key: file.key.clone(),
    };
    get_stash_file_diff(
        active,
        &StashFileDiffRequest {
            file: file_request.clone(),
            expand: false,
        },
    )
    .unwrap();
    get_stash_file_content(
        active,
        &StashFileContentRequest {
            file: file_request.clone(),
            side: StashContentSide::Saved,
            expand: false,
        },
    )
    .unwrap();
    get_stash_image(
        active,
        &StashImageRequest {
            file: file_request,
            version: ImageVersion::Saved,
            expand: false,
        },
    )
    .unwrap();
}

fn inspect_releases(active: &ActiveRepo, client: &GitHubClient, data_dir: &Path) {
    let listed = get_releases_with_e2e_client(active, client, data_dir).unwrap();
    assert!(listed.cached_at.is_none());
    assert!(get_cached_releases(active, data_dir).unwrap().is_some());
    let assets = get_release_assets_with_e2e_client(active, 1, client).unwrap();
    assert_eq!(assets.assets.len(), 1);
    let (resolved_asset, _download_request) =
        gitcanvas_core::releases::resolve_release_asset_with_e2e_client(active, 1, 2, client)
            .unwrap();
    assert_eq!(resolved_asset.id, 2);
}

fn inspect_rejected_reads(active: &ActiveRepo, head: &str) {
    assert!(get_file_content(
        active,
        &FileContentRequest {
            commit_id: head.to_owned(),
            path: "../outside.txt".into(),
            expand: false,
        },
    )
    .is_err());
    assert!(get_file_content(
        active,
        &FileContentRequest {
            commit_id: head.to_owned(),
            path: "missing.txt".into(),
            expand: false,
        },
    )
    .is_err());
    assert!(get_commit_image(
        active,
        &CommitImageRequest {
            commit_id: head.to_owned(),
            path: "../outside.png".into(),
            previous_path: None,
            version: ImageVersion::Saved,
            expand: false,
        },
    )
    .is_err());
    assert!(get_worktree_file_content(
        active,
        &WorktreeFileContentRequest {
            side: WorktreeSide::Unstaged,
            path: "readme.txt".into(),
            expected_revision: Some("deliberately-stale".into()),
            expand: false,
        },
    )
    .is_err());
    assert!(get_stash_image(
        active,
        &StashImageRequest {
            file: StashFileRequest {
                stash_id: "0000000000000000000000000000000000000000".into(),
                mode: StashComparisonMode::All,
                file_key: "not-a-comparison-key".into(),
            },
            version: ImageVersion::Saved,
            expand: false,
        },
    )
    .is_err());
}

#[test]
fn all_inspection_routes_preserve_repository_state_and_only_release_cache_is_written() {
    let (fixture, head) = create_fixture();
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();
    let data_dir = tempfile::tempdir().unwrap();
    let (api_origin, server) = set_up_fake_release_api();
    let client = GitHubClient::for_e2e_loopback(&api_origin).unwrap();
    let history_reader = HistoryReader::default();
    let repo_before = snapshot(fixture.dir.path());
    let data_before = snapshot(data_dir.path());

    inspect_history(&active, &head, &history_reader);
    inspect_authors(&active, &history_reader);
    inspect_worktree(&active);
    inspect_stash(&active);
    inspect_rejected_reads(&active, &head);
    inspect_releases(&active, &client, data_dir.path());
    let requests = server.join().unwrap();
    assert_eq!(
        requests.len(),
        5,
        "fake API request inventory: {requests:?}"
    );
    assert!(requests
        .iter()
        .all(|request| !request.to_ascii_lowercase().contains("authorization:")));

    let repo_after = snapshot(fixture.dir.path());
    assert_eq!(repo_before, repo_after);

    let data_after = snapshot(data_dir.path());
    assert!(data_before.is_empty());
    assert!(!data_after.is_empty(), "the listed releases are cacheable");
    let expected_paths = [
        PathBuf::from("releases"),
        PathBuf::from("releases/.cache.lock"),
        PathBuf::from("releases/acme__project.json"),
    ]
    .into_iter()
    .collect::<std::collections::BTreeSet<_>>();
    assert_eq!(
        data_after
            .keys()
            .cloned()
            .collect::<std::collections::BTreeSet<_>>(),
        expected_paths,
        "only the exact release cache entry and its lock may be written"
    );
}
