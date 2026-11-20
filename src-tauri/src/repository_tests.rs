//! Real IPC dispatch tests use the same registry and ACL as the application.

use serde_json::{json, Value};
use tauri::test::{get_ipc_response, mock_builder, MockRuntime, INVOKE_KEY};

pub(super) fn test_webview() -> tauri::WebviewWindow<MockRuntime> {
    let builder = super::specta_builder();
    let app = mock_builder()
        .manage(crate::commands::github::CacheRoot(
            std::env::temp_dir().join("gitcanvas-test-cache"),
        ))
        .manage(std::sync::Arc::new(
            gitcanvas_core::history::HistoryReader::default(),
        ))
        .manage(crate::commands::repository::FileHistoryCache(
            std::sync::Arc::new(gitcanvas_core::history::HistoryReader::with_budget(
                gitcanvas_core::file_history::FILE_HISTORY_CACHED_COMMITS,
            )),
        ))
        .manage(crate::commands::repo_access::AllowedRepos::default())
        .manage(crate::commands::open_repos::OpenRepos::default())
        .manage(std::sync::Arc::new(
            crate::lifecycle::ShutdownGate::default(),
        ))
        .manage(std::sync::Arc::new(
            gitcanvas_core::workspace::store::WorkspaceStore::new(
                std::env::temp_dir()
                    .join(format!("gitcanvas-test-workspace-{}", std::process::id())),
            ),
        ))
        .manage(crate::commands::menu::MenuApplier(std::sync::Arc::new(
            |_| Ok(()),
        )))
        .manage(crate::commands::lifecycle::RestartApplication(
            std::sync::Arc::new(|| Ok(())),
        ))
        .manage(crate::commands::watch::ActiveWatch::default())
        .manage(crate::commands::watch::ChangeNotifier(std::sync::Arc::new(
            |_| {},
        )))
        .manage(crate::commands::github::ProgressEmitter(
            std::sync::Arc::new(|_| {}),
        ))
        .invoke_handler(builder.invoke_handler())
        .build(super::app_context())
        .unwrap();
    tauri::WebviewWindowBuilder::new(&app, "main", tauri::WebviewUrl::default())
        .build()
        .unwrap()
}

pub(super) fn invoke(
    webview: &tauri::WebviewWindow<MockRuntime>,
    cmd: &str,
    body: Value,
) -> Result<Value, Value> {
    get_ipc_response(
        webview,
        tauri::webview::InvokeRequest {
            cmd: cmd.into(),
            callback: tauri::ipc::CallbackFn(0),
            error: tauri::ipc::CallbackFn(1),
            // Must match the scheme the mock webview's ACL resolves against,
            // which is `tauri://localhost` everywhere except Windows, where
            // it is `http://tauri.localhost` — see the `ping` roundtrip test
            // in `lib.rs`.
            url: if cfg!(target_os = "windows") {
                "http://tauri.localhost"
            } else {
                "tauri://localhost"
            }
            .parse()
            .unwrap(),
            body: tauri::ipc::InvokeBody::Json(body),
            headers: tauri::http::HeaderMap::new(),
            invoke_key: INVOKE_KEY.into(),
        },
    )
    .map(|response| response.deserialize().unwrap())
}

#[test]
fn repository_history_and_refs_round_trip_with_real_payloads() {
    let dir = tempfile::tempdir().unwrap();
    let repo = git2::Repository::init(dir.path()).unwrap();
    let signature = git2::Signature::now("Test", "test@example.com").unwrap();
    let tree_id = repo.treebuilder(None).unwrap().write().unwrap();
    let tree = repo.find_tree(tree_id).unwrap();
    let id = repo
        .commit(Some("HEAD"), &signature, &signature, "initial", &tree, &[])
        .unwrap();
    repo.tag_lightweight("v1", &repo.find_object(id, None).unwrap(), false)
        .unwrap();
    let webview = test_webview();
    let path = dir.path().to_str().unwrap();
    let response = invoke(&webview, "open_repository", json!({"path": path})).unwrap();
    assert_eq!(
        response["path"],
        dir.path().canonicalize().unwrap().to_str().unwrap()
    );
    let page = invoke(
        &webview,
        "get_commits",
        json!({"path": path, "request": {"limit": 500, "cursor": null, "roots": null}}),
    )
    .unwrap();
    assert_eq!(page["commits"][0]["id"], id.to_string());
    assert!(page["next_cursor"].is_null());
    assert!(page["commits"][0]["author_time"].is_string());
    let branches = invoke(&webview, "get_repository_refs", json!({"path": path})).unwrap();
    assert_eq!(branches["branches"][0]["target"], id.to_string());
    assert_eq!(branches["branches"][0]["is_head"], true);
    let tags = invoke(&webview, "get_repository_refs", json!({"path": path})).unwrap();
    assert_eq!(tags["tags"][0]["name"], "v1");
    assert_eq!(tags["tags"][0]["commit_id"], id.to_string());
}

#[test]
fn author_commands_are_authorized_and_isolated_by_repository() {
    let first_dir = tempfile::tempdir().unwrap();
    let second_dir = tempfile::tempdir().unwrap();
    let first_repo = git2::Repository::init(first_dir.path()).unwrap();
    let second_repo = git2::Repository::init(second_dir.path()).unwrap();
    let identity = git2::Signature::now("Shared Author", "shared@example.test").unwrap();
    let first_tree = first_repo
        .find_tree(first_repo.treebuilder(None).unwrap().write().unwrap())
        .unwrap();
    let second_tree = second_repo
        .find_tree(second_repo.treebuilder(None).unwrap().write().unwrap())
        .unwrap();
    let first_id = first_repo
        .commit(
            Some("HEAD"),
            &identity,
            &identity,
            "first repository",
            &first_tree,
            &[],
        )
        .unwrap();
    let second_root_id = second_repo
        .commit(
            Some("HEAD"),
            &identity,
            &identity,
            "second repository root",
            &second_tree,
            &[],
        )
        .unwrap();
    let second_root = second_repo.find_commit(second_root_id).unwrap();
    let second_id = second_repo
        .commit(
            Some("HEAD"),
            &identity,
            &identity,
            "second repository tip",
            &second_tree,
            &[&second_root],
        )
        .unwrap();
    let webview = test_webview();
    let first_path = first_dir.path().to_str().unwrap();
    let second_path = second_dir.path().to_str().unwrap();
    let identity_payload = json!({"name": "Shared Author", "email": "shared@example.test"});

    assert_author_commands_reject_unopened_repository(&webview, first_path);

    invoke(&webview, "open_repository", json!({"path": first_path})).unwrap();
    invoke(&webview, "open_repository", json!({"path": second_path})).unwrap();

    let first_catalog = invoke(
        &webview,
        "get_author_catalog_chunk",
        json!({"path": first_path, "request": {"cursor": null, "cancelled": false}}),
    )
    .unwrap();
    let second_catalog = invoke(
        &webview,
        "get_author_catalog_chunk",
        json!({"path": second_path, "request": {"cursor": null, "cancelled": false}}),
    )
    .unwrap();
    assert_eq!(first_catalog["authors"][0]["commits"], 1);
    assert_eq!(second_catalog["authors"][0]["commits"], 2);
    assert_eq!(
        first_catalog["authors"][0]["author"]["name"],
        "Shared Author"
    );
    assert_eq!(
        second_catalog["authors"][0]["author"]["name"],
        "Shared Author"
    );

    let first_page = invoke(
        &webview,
        "get_author_commit_ids",
        json!({"path": first_path, "request": {"author": identity_payload.clone(), "cursor": null}}),
    )
    .unwrap();
    let second_page = invoke(
        &webview,
        "get_author_commit_ids",
        json!({"path": second_path, "request": {"author": identity_payload, "cursor": null}}),
    )
    .unwrap();
    assert_eq!(first_page["commit_ids"][0], first_id.to_string());
    assert_eq!(second_page["commit_ids"].as_array().unwrap().len(), 2);
    assert_ne!(first_id, second_id);

    assert_author_cache_reads_are_isolated_after_return(
        &webview,
        first_path,
        second_path,
        first_id,
        second_id,
    );
}

fn assert_author_commands_reject_unopened_repository(
    webview: &tauri::WebviewWindow<MockRuntime>,
    path: &str,
) {
    let catalog_error = invoke(
        webview,
        "get_author_catalog_chunk",
        json!({"path": path, "request": {"cursor": null, "cancelled": false}}),
    )
    .unwrap_err();
    let commits_error = invoke(
        webview,
        "get_author_commit_ids",
        json!({
            "path": path,
            "request": {"author": {"name": "Shared Author", "email": "shared@example.test"}, "cursor": null}
        }),
    )
    .unwrap_err();
    assert_eq!(catalog_error["kind"], "InvalidRepository");
    assert_eq!(commits_error["kind"], "InvalidRepository");
}

fn assert_author_cache_reads_are_isolated_after_return(
    webview: &tauri::WebviewWindow<MockRuntime>,
    first_path: &str,
    second_path: &str,
    first_commit_id: git2::Oid,
    second_commit_id: git2::Oid,
) {
    // Re-read B after its caches are populated, then return to A with the same author query.
    let second_catalog = invoke(
        webview,
        "get_author_catalog_chunk",
        json!({"path": second_path, "request": {"cursor": null, "cancelled": false}}),
    )
    .unwrap();
    let second_page = invoke(
        webview,
        "get_author_commit_ids",
        json!({
            "path": second_path,
            "request": {"author": {"name": "Shared Author", "email": "shared@example.test"}, "cursor": null}
        }),
    )
    .unwrap();
    assert_eq!(second_catalog["authors"][0]["commits"], 2);
    assert_eq!(second_page["commit_ids"].as_array().unwrap().len(), 2);
    assert!(second_page["commit_ids"]
        .as_array()
        .unwrap()
        .contains(&json!(second_commit_id.to_string())));

    let first_catalog = invoke(
        webview,
        "get_author_catalog_chunk",
        json!({"path": first_path, "request": {"cursor": null, "cancelled": false}}),
    )
    .unwrap();
    let first_page = invoke(
        webview,
        "get_author_commit_ids",
        json!({
            "path": first_path,
            "request": {"author": {"name": "Shared Author", "email": "shared@example.test"}, "cursor": null}
        }),
    )
    .unwrap();
    assert_eq!(first_catalog["authors"][0]["commits"], 1);
    assert_ne!(
        first_catalog["authors"][0]["commits"],
        second_catalog["authors"][0]["commits"]
    );
    assert_eq!(first_page["commit_ids"].as_array().unwrap().len(), 1);
    assert_eq!(first_page["commit_ids"][0], first_commit_id.to_string());
    assert_ne!(first_commit_id, second_commit_id);
}

#[test]
fn author_commit_cursor_is_stale_across_repositories_with_different_roots() {
    let first_dir = tempfile::tempdir().unwrap();
    let second_dir = tempfile::tempdir().unwrap();
    let first_repo = git2::Repository::init(first_dir.path()).unwrap();
    let second_repo = git2::Repository::init(second_dir.path()).unwrap();
    let identity = git2::Signature::now("Paged Author", "paged@example.test").unwrap();
    let tree_id = first_repo.treebuilder(None).unwrap().write().unwrap();
    let tree = first_repo.find_tree(tree_id).unwrap();
    let mut parent = None;
    for number in 0..501 {
        let parents = parent
            .as_ref()
            .map(|id| vec![first_repo.find_commit(*id).unwrap()])
            .unwrap_or_default();
        let parent_refs = parents.iter().collect::<Vec<_>>();
        parent = Some(
            first_repo
                .commit(
                    Some("HEAD"),
                    &identity,
                    &identity,
                    &format!("commit {number}"),
                    &tree,
                    &parent_refs,
                )
                .unwrap(),
        );
    }
    let other_tree_id = second_repo.treebuilder(None).unwrap().write().unwrap();
    let other_tree = second_repo.find_tree(other_tree_id).unwrap();
    second_repo
        .commit(
            Some("HEAD"),
            &identity,
            &identity,
            "different history root",
            &other_tree,
            &[],
        )
        .unwrap();

    let webview = test_webview();
    let first_path = first_dir.path().to_str().unwrap();
    let second_path = second_dir.path().to_str().unwrap();
    invoke(&webview, "open_repository", json!({"path": first_path})).unwrap();
    invoke(&webview, "open_repository", json!({"path": second_path})).unwrap();
    let author = json!({"name": "Paged Author", "email": "paged@example.test"});
    let second_page_without_cursor = invoke(
        &webview,
        "get_author_commit_ids",
        json!({"path": second_path, "request": {"author": author.clone(), "cursor": null}}),
    )
    .unwrap();
    assert_eq!(
        second_page_without_cursor["commit_ids"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert!(second_page_without_cursor["next_cursor"].is_null());

    let first_page = invoke(
        &webview,
        "get_author_commit_ids",
        json!({"path": first_path, "request": {"author": author.clone(), "cursor": null}}),
    )
    .unwrap();
    assert_eq!(first_page["commit_ids"].as_array().unwrap().len(), 500);
    let cursor = first_page["next_cursor"].as_str().unwrap();
    let continuation = invoke(
        &webview,
        "get_author_commit_ids",
        json!({"path": first_path, "request": {"author": author.clone(), "cursor": cursor}}),
    )
    .unwrap();
    assert_eq!(continuation["commit_ids"].as_array().unwrap().len(), 1);
    assert!(continuation["next_cursor"].is_null());

    let stale = invoke(
        &webview,
        "get_author_commit_ids",
        json!({"path": second_path, "request": {"author": author, "cursor": cursor}}),
    )
    .unwrap_err();
    assert_eq!(stale["kind"], "StaleCursor");
}

#[test]
fn file_history_is_authorized_before_it_reads_anything() {
    let dir = tempfile::tempdir().unwrap();
    let repo = git2::Repository::init(dir.path()).unwrap();
    let signature = git2::Signature::now("Test", "test@example.com").unwrap();
    std::fs::write(dir.path().join("f.txt"), "hello\n").unwrap();
    let mut index = repo.index().unwrap();
    index.add_path(std::path::Path::new("f.txt")).unwrap();
    let tree = repo.find_tree(index.write_tree().unwrap()).unwrap();
    let id = repo
        .commit(Some("HEAD"), &signature, &signature, "initial", &tree, &[])
        .unwrap();
    let webview = test_webview();
    let path = dir.path().to_str().unwrap();
    let request = json!({
        "path": path,
        "request": {
            "path": "f.txt",
            "start": id.to_string(),
            "limit": 10,
            "cursor": null,
            "focus_commit": null
        }
    });
    let denied = invoke(&webview, "get_file_history", request.clone()).unwrap_err();
    assert_eq!(denied["kind"], "InvalidRepository");
    invoke(&webview, "open_repository", json!({"path": path})).unwrap();
    let page = invoke(&webview, "get_file_history", request).unwrap();
    assert_eq!(page["rows"][0]["commit"]["id"], id.to_string());
    assert_eq!(page["rows"][0]["path_at_commit"], "f.txt");
    assert_eq!(page["limits"]["max_renames"], 32);
}

#[test]
fn image_commands_require_authorization_and_commit_reads_return_bounded_metadata() {
    let dir = tempfile::tempdir().unwrap();
    let repo = git2::Repository::init(dir.path()).unwrap();
    let signature = git2::Signature::now("Test", "test@example.com").unwrap();
    let mut image = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR".to_vec();
    image.extend_from_slice(&3_u32.to_be_bytes());
    image.extend_from_slice(&4_u32.to_be_bytes());
    let blob = repo.blob(&image).unwrap();
    let mut builder = repo.treebuilder(None).unwrap();
    builder.insert("logo.png", blob, 0o100_644).unwrap();
    let tree = repo.find_tree(builder.write().unwrap()).unwrap();
    let commit = repo
        .commit(Some("HEAD"), &signature, &signature, "image", &tree, &[])
        .unwrap();
    let path = dir.path().to_str().unwrap();
    let webview = test_webview();
    let request = json!({
        "path": path,
        "request": {
            "commit_id": commit.to_string(),
            "path": "logo.png",
            "previous_path": null,
            "version": "saved",
            "expand": false
        }
    });
    let denied = invoke(&webview, "get_commit_image", request.clone()).unwrap_err();
    assert_eq!(denied["kind"], "InvalidRepository");
    invoke(&webview, "open_repository", json!({"path": path})).unwrap();
    let result = invoke(&webview, "get_commit_image", request).unwrap();
    assert_eq!(result["kind"], "image");
    assert_eq!(result["image"]["format"], "png");
    assert_eq!(result["image"]["width"], 3);
    assert_eq!(result["image"]["height"], 4);
}

#[test]
#[allow(clippy::print_stdout)] // The measurement is retained in the test log for v0.8 verification.
fn expanded_commit_image_round_trips_the_32_mib_payload_over_ipc() {
    use std::time::Instant;

    const IMAGE_BYTES: usize = 32 * 1024 * 1024;
    let dir = tempfile::tempdir().unwrap();
    let repo = git2::Repository::init(dir.path()).unwrap();
    let signature = git2::Signature::now("Test", "test@example.com").unwrap();
    let mut image = vec![0_u8; IMAGE_BYTES];
    image[..8].copy_from_slice(b"\x89PNG\r\n\x1a\n");
    image[12..16].copy_from_slice(b"IHDR");
    image[16..20].copy_from_slice(&1_u32.to_be_bytes());
    image[20..24].copy_from_slice(&1_u32.to_be_bytes());
    let blob = repo.blob(&image).unwrap();
    let mut builder = repo.treebuilder(None).unwrap();
    builder.insert("large.png", blob, 0o100_644).unwrap();
    let tree = repo.find_tree(builder.write().unwrap()).unwrap();
    let commit = repo
        .commit(
            Some("HEAD"),
            &signature,
            &signature,
            "large image",
            &tree,
            &[],
        )
        .unwrap();
    let webview = test_webview();
    let path = dir.path().to_str().unwrap();
    invoke(&webview, "open_repository", json!({"path": path})).unwrap();
    let request = json!({
        "path": path,
        "request": {
            "commit_id": commit.to_string(),
            "path": "large.png",
            "previous_path": null,
            "version": "saved",
            "expand": true
        }
    });

    let started = Instant::now();
    let result = invoke(&webview, "get_commit_image", request).unwrap();
    let serialized = serde_json::to_vec(&result).unwrap();
    let elapsed = started.elapsed();
    let data = result["image"]["data"].as_str().unwrap();
    let expected_base64_bytes = IMAGE_BYTES.div_ceil(3) * 4;
    assert_eq!(result["kind"], "image");
    assert_eq!(data.len(), expected_base64_bytes);
    println!(
        "32 MiB image IPC: {} base64 bytes, {} JSON bytes, {elapsed:?}",
        data.len(),
        serialized.len(),
    );
}

#[test]
fn command_failures_are_structured_and_invalid_limits_are_rejected() {
    let dir = tempfile::tempdir().unwrap();
    let webview = test_webview();
    let path = dir.path().to_str().unwrap();
    for command in [
        "open_repository",
        "get_repository_refs",
        "get_repository_refs",
    ] {
        let response = invoke(&webview, command, json!({"path": path})).unwrap_err();
        assert_eq!(response["kind"], "InvalidRepository");
        assert!(response["message"].is_string());
    }
    git2::Repository::init(dir.path()).unwrap();
    invoke(&webview, "open_repository", json!({"path": path})).unwrap();
    let response = invoke(
        &webview,
        "get_commits",
        json!({"path": path, "request": {"limit": 501, "cursor": null, "roots": null}}),
    )
    .unwrap_err();
    assert_eq!(response["kind"], "InvalidInput");
}

#[test]
fn git_commands_require_a_repository_to_be_opened_first() {
    let dir = tempfile::tempdir().unwrap();
    git2::Repository::init(dir.path()).unwrap();
    let webview = test_webview();
    let path = dir.path().to_str().unwrap();

    let denied = invoke(&webview, "get_repository_refs", json!({"path": path})).unwrap_err();
    assert_eq!(denied["kind"], "InvalidRepository");
    assert!(denied["message"]
        .as_str()
        .unwrap()
        .contains("has not been opened"));

    let denied_commit = invoke(
        &webview,
        "get_commit",
        json!({"path": path, "commitId": "a".repeat(40)}),
    )
    .unwrap_err();
    assert_eq!(denied_commit["kind"], "InvalidRepository");

    invoke(&webview, "open_repository", json!({"path": path})).unwrap();
    assert_eq!(
        invoke(&webview, "get_repository_refs", json!({"path": path})).unwrap()["branches"],
        json!([])
    );
}

#[test]
fn independent_requests_do_not_change_each_others_repository() {
    let first = tempfile::tempdir().unwrap();
    let second = tempfile::tempdir().unwrap();
    git2::Repository::init(first.path()).unwrap();
    git2::Repository::init(second.path()).unwrap();
    let webview = test_webview();
    invoke(
        &webview,
        "open_repository",
        json!({"path": first.path().to_str().unwrap()}),
    )
    .unwrap();
    invoke(
        &webview,
        "open_repository",
        json!({"path": second.path().to_str().unwrap()}),
    )
    .unwrap();
    std::fs::remove_dir_all(first.path().join(".git")).unwrap();
    assert!(invoke(
        &webview,
        "get_repository_refs",
        json!({"path": first.path().to_str().unwrap()})
    )
    .is_err());
    assert_eq!(
        invoke(
            &webview,
            "get_repository_refs",
            json!({"path": second.path().to_str().unwrap()})
        )
        .unwrap()["branches"],
        json!([])
    );
}

#[test]
fn stash_reads_are_authorized_and_round_trip_saved_content_through_real_ipc() {
    let directory = tempfile::tempdir().unwrap();
    let repo = git2::Repository::init(directory.path()).unwrap();
    repo.config()
        .unwrap()
        .set_str("user.name", "Fixture")
        .unwrap();
    repo.config()
        .unwrap()
        .set_str("user.email", "fixture@example.invalid")
        .unwrap();
    let signature = git2::Signature::now("Fixture", "fixture@example.invalid").unwrap();
    let commit = |reference: &str, body: &[u8], parents: &[git2::Oid]| {
        let blob = repo.blob(body).unwrap();
        let mut builder = repo.treebuilder(None).unwrap();
        builder.insert("file.txt", blob, 0o100_644).unwrap();
        let tree = repo.find_tree(builder.write().unwrap()).unwrap();
        let parents = parents
            .iter()
            .map(|id| repo.find_commit(*id).unwrap())
            .collect::<Vec<_>>();
        repo.commit(
            Some(reference),
            &signature,
            &signature,
            "fixture",
            &tree,
            &parents.iter().collect::<Vec<_>>(),
        )
        .unwrap()
    };
    let base = commit("HEAD", b"base", &[]);
    let index = commit("refs/heads/index", b"prepared", &[base]);
    let stash = commit("refs/heads/saved", b"saved", &[base, index]);
    repo.reference_ensure_log("refs/stash").unwrap();
    repo.reference("refs/stash", stash, true, "On main: fixture")
        .unwrap();
    let path = directory.path().to_str().unwrap();
    let webview = test_webview();
    let selection =
        json!({"stash_id": stash.to_string(), "mode": "all", "file_key": "placeholder"});
    let requests = [
        (
            "get_stashes",
            json!({"path":path,"request":{"limit":null,"cursor":null,"search":null,"selected_stash_id":stash.to_string()}}),
        ),
        (
            "get_stash_files",
            json!({"path":path,"request":{"stash_id":stash.to_string(),"mode":"all","limit":null,"cursor":null}}),
        ),
        (
            "get_stash_file_diff",
            json!({"path":path,"request":{"file":selection,"expand":false}}),
        ),
        (
            "get_stash_file_content",
            json!({"path":path,"request":{"file":selection,"side":"saved","expand":false}}),
        ),
        ("get_stash_fingerprint", json!({"path":path})),
    ];
    for (command, request) in &requests {
        assert_eq!(
            invoke(&webview, command, request.clone()).unwrap_err()["kind"],
            "InvalidRepository"
        );
    }
    invoke(&webview, "open_repository", json!({"path":path})).unwrap();
    let listed = invoke(&webview, "get_stashes", requests[0].1.clone()).unwrap();
    assert_eq!(listed["selected_entry"]["stash_id"], stash.to_string());
    let files = invoke(&webview, "get_stash_files", requests[1].1.clone()).unwrap();
    assert_eq!(files["files"][0]["file"]["path"], "file.txt");
    let file =
        json!({"stash_id":stash.to_string(),"mode":"all","file_key":files["files"][0]["key"]});
    let saved_diff = invoke(
        &webview,
        "get_stash_file_diff",
        json!({"path":path,"request":{"file":file,"expand":false}}),
    )
    .unwrap();
    assert!(saved_diff["patch"].as_str().unwrap().contains("+saved"));
    let content = invoke(
        &webview,
        "get_stash_file_content",
        json!({"path":path,"request":{"file":file,"side":"saved","expand":false}}),
    )
    .unwrap();
    assert_eq!(content["outcome"]["kind"], "available");
    assert_eq!(content["outcome"]["content"]["text"], "saved");
    assert!(
        invoke(&webview, "get_stash_fingerprint", requests[4].1.clone()).unwrap()["revision"]
            .is_string()
    );
}
