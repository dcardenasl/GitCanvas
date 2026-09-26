//! Real IPC dispatch tests use the same registry and ACL as the application.

use serde_json::{json, Value};
use tauri::test::{get_ipc_response, mock_builder, MockRuntime, INVOKE_KEY};

fn webview() -> tauri::WebviewWindow<MockRuntime> {
    let builder = super::specta_builder();
    let app = mock_builder()
        .manage(crate::commands::github::CacheRoot(
            std::env::temp_dir().join("gitcanvas-test-cache"),
        ))
        .manage(std::sync::Arc::new(
            gitcanvas_core::history::HistoryReader::default(),
        ))
        .invoke_handler(builder.invoke_handler())
        .build(super::app_context())
        .unwrap();
    tauri::WebviewWindowBuilder::new(&app, "main", tauri::WebviewUrl::default())
        .build()
        .unwrap()
}

fn invoke(
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
    let webview = webview();
    let path = dir.path().to_str().unwrap();
    for command in ["open_repository", "validate_repository"] {
        let response = invoke(&webview, command, json!({"path": path})).unwrap();
        assert_eq!(
            response["path"],
            dir.path().canonicalize().unwrap().to_str().unwrap()
        );
    }
    let page = invoke(
        &webview,
        "get_commits",
        json!({"path": path, "request": {"limit": 500, "cursor": null, "roots": null}}),
    )
    .unwrap();
    assert_eq!(page["commits"][0]["id"], id.to_string());
    assert!(page["next_cursor"].is_null());
    assert!(page["commits"][0]["author_time"].is_string());
    let branches = invoke(&webview, "get_branches", json!({"path": path})).unwrap();
    assert_eq!(branches[0]["target"], id.to_string());
    assert_eq!(branches[0]["is_head"], true);
    let tags = invoke(&webview, "get_tags", json!({"path": path})).unwrap();
    assert_eq!(tags[0]["name"], "v1");
    assert_eq!(tags[0]["commit_id"], id.to_string());
}

#[test]
fn command_failures_are_structured_and_invalid_limits_are_rejected() {
    let dir = tempfile::tempdir().unwrap();
    let webview = webview();
    let path = dir.path().to_str().unwrap();
    for command in [
        "open_repository",
        "validate_repository",
        "get_branches",
        "get_tags",
    ] {
        let response = invoke(&webview, command, json!({"path": path})).unwrap_err();
        assert_eq!(response["kind"], "InvalidRepository");
        assert!(response["message"].is_string());
    }
    git2::Repository::init(dir.path()).unwrap();
    let response = invoke(
        &webview,
        "get_commits",
        json!({"path": path, "request": {"limit": 501, "cursor": null, "roots": null}}),
    )
    .unwrap_err();
    assert_eq!(response["kind"], "InvalidInput");
}

#[test]
fn independent_requests_do_not_change_each_others_repository() {
    let first = tempfile::tempdir().unwrap();
    let second = tempfile::tempdir().unwrap();
    git2::Repository::init(first.path()).unwrap();
    git2::Repository::init(second.path()).unwrap();
    let webview = webview();
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
        "get_branches",
        json!({"path": first.path().to_str().unwrap()})
    )
    .is_err());
    assert_eq!(
        invoke(
            &webview,
            "get_branches",
            json!({"path": second.path().to_str().unwrap()})
        )
        .unwrap(),
        json!([])
    );
}
