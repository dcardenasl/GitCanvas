//! Fresh, bounded release-asset metadata discovery and resolution.

use std::collections::HashSet;

use serde::Deserialize;

use crate::{
    error::AppError,
    github::api::GitHubClient,
    releases::{download::DownloadRequest, select_source_remote, ReleaseSource},
    repository::ActiveRepo,
};

const PAGE_SIZE: usize = 100;
const MAX_PAGES: usize = 10;
const MAX_RESPONSE_BYTES: u64 = 8 * 1024 * 1024;

/// Public asset descriptor; the IPC adapter represents the numeric fields as decimal strings.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReleaseAssetInfo {
    /// GitHub's stable asset identifier.
    pub id: u64,
    /// Suggested asset filename.
    pub name: String,
    /// API-reported size in bytes.
    pub size: u64,
    /// Optional API-provided `sha256:<hex>` digest.
    pub sha256: Option<String>,
}

/// Bounded metadata for assets belonging to one published release.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReleaseAssetList {
    /// Validated GitHub source.
    pub source: ReleaseSource,
    /// Stable identifier of the published release.
    pub release_id: u64,
    /// Assets returned within the configured page bound.
    pub assets: Vec<ReleaseAssetInfo>,
    /// Whether a full final page may have left more assets unlisted.
    pub truncated: bool,
}

#[derive(Deserialize)]
struct RawRelease {
    id: u64,
    draft: bool,
}

#[derive(Clone, Deserialize)]
struct RawAsset {
    id: u64,
    name: String,
    size: u64,
    digest: Option<String>,
    url: String,
}

/// Lists bounded asset descriptors for a fresh, published release.
///
/// # Errors
/// Returns provider, repository, access, pagination, or resource-limit errors.
pub fn get_release_assets(
    active: &ActiveRepo,
    release_id: u64,
) -> Result<ReleaseAssetList, AppError> {
    let client = GitHubClient::from_optional_stored_token()?;
    get_release_assets_with_client(active, release_id, &client)
}

/// Re-resolves an asset from the selected published release before download.
///
/// # Errors
/// Returns provider, repository, access, membership, URL-validation, or size-limit errors.
pub fn resolve_release_asset(
    active: &ActiveRepo,
    release_id: u64,
    asset_id: u64,
) -> Result<(ReleaseAssetInfo, DownloadRequest), AppError> {
    let client = GitHubClient::from_optional_stored_token()?;
    resolve_release_asset_with_client_impl(active, release_id, asset_id, &client)
}

fn get_release_assets_with_client(
    active: &ActiveRepo,
    release_id: u64,
    client: &GitHubClient,
) -> Result<ReleaseAssetList, AppError> {
    let repository = active.open()?;
    let (source, _) = select_source_remote(&repository)?;
    let owner_name = source_owner_name(&source);
    let _release = read_published_release(client, &owner_name, release_id)?;
    let (assets, truncated) = collect_assets(client, &owner_name, release_id, None)?;
    Ok(ReleaseAssetList {
        source,
        release_id,
        assets: assets.into_iter().map(|(asset, _)| asset).collect(),
        truncated,
    })
}

fn resolve_release_asset_with_client_impl(
    active: &ActiveRepo,
    release_id: u64,
    asset_id: u64,
    client: &GitHubClient,
) -> Result<(ReleaseAssetInfo, DownloadRequest), AppError> {
    if asset_id == 0 {
        return Err(AppError::InvalidInput(
            "release asset ID must be positive".to_owned(),
        ));
    }
    let repository = active.open()?;
    let (source, _) = select_source_remote(&repository)?;
    let owner_name = source_owner_name(&source);
    let _release = read_published_release(client, &owner_name, release_id)?;
    let (asset, truncated) = collect_assets_for_target(client, &owner_name, release_id, asset_id)?;
    let Some((info, raw)) = asset else {
        return if truncated {
            Err(AppError::ResourceLimitExceeded(
                "release asset was not found within the 1,000 asset limit".to_owned(),
            ))
        } else {
            Err(AppError::NotFound)
        };
    };
    validate_asset_url(&raw.url, &owner_name, asset_id)?;
    if info.size > crate::releases::download::MAX_DOWNLOAD_BYTES {
        return Err(AppError::ResourceLimitExceeded(
            "release asset exceeds the 1 GiB download limit".to_owned(),
        ));
    }
    if let Some(digest) = info.sha256.as_deref() {
        crate::releases::download::validate_sha256_digest(digest)?;
    }
    let request = DownloadRequest {
        url: raw.url,
        file_name: info.name.clone(),
        size: info.size,
        sha256: info.sha256.clone(),
    };
    Ok((info, request))
}

fn source_owner_name(source: &ReleaseSource) -> String {
    match source {
        ReleaseSource::Github { owner, name } => format!("{owner}/{name}"),
    }
}

fn read_published_release(
    client: &GitHubClient,
    owner_name: &str,
    release_id: u64,
) -> Result<RawRelease, AppError> {
    if release_id == 0 {
        return Err(AppError::InvalidInput(
            "release ID must be positive".to_owned(),
        ));
    }
    let (owner, name) = split_owner_name(owner_name)?;
    let path = format!("/repos/{owner}/{name}/releases/{release_id}");
    let body = client.get_release_metadata_body(&path, MAX_RESPONSE_BYTES)?;
    let release: RawRelease = serde_json::from_slice(&body).map_err(|error| {
        AppError::Internal(format!("unexpected GitHub release metadata: {error}"))
    })?;
    if release.id != release_id || release.draft {
        return Err(AppError::NotFound);
    }
    Ok(release)
}

fn collect_assets(
    client: &GitHubClient,
    owner_name: &str,
    release_id: u64,
    target: Option<u64>,
) -> Result<(Vec<(ReleaseAssetInfo, RawAsset)>, bool), AppError> {
    let (owner, name) = split_owner_name(owner_name)?;
    let mut assets = Vec::new();
    let mut ids = HashSet::new();
    let mut truncated = false;
    for page in 1..=MAX_PAGES {
        let path = format!(
            "/repos/{owner}/{name}/releases/{release_id}/assets?per_page={PAGE_SIZE}&page={page}"
        );
        let body = client.get_release_metadata_body(&path, MAX_RESPONSE_BYTES)?;
        let current: Vec<RawAsset> = serde_json::from_slice(&body).map_err(|error| {
            AppError::Internal(format!("unexpected GitHub release assets payload: {error}"))
        })?;
        if current.len() > PAGE_SIZE {
            return Err(AppError::ResourceLimitExceeded(
                "GitHub returned more than 100 assets in one page".to_owned(),
            ));
        }
        let count = current.len();
        for raw in current {
            if raw.id == 0 || !ids.insert(raw.id) {
                return Err(AppError::Internal(
                    "GitHub returned an invalid or duplicate release asset ID".to_owned(),
                ));
            }
            let info = ReleaseAssetInfo {
                id: raw.id,
                name: raw.name.clone(),
                size: raw.size,
                sha256: raw.digest.clone(),
            };
            let is_target = target == Some(raw.id);
            assets.push((info, raw));
            if is_target {
                return Ok((assets, false));
            }
        }
        if count < PAGE_SIZE {
            return Ok((assets, false));
        }
        if page == MAX_PAGES {
            truncated = true;
        }
    }
    Ok((assets, truncated))
}

fn collect_assets_for_target(
    client: &GitHubClient,
    owner_name: &str,
    release_id: u64,
    target: u64,
) -> Result<(Option<(ReleaseAssetInfo, RawAsset)>, bool), AppError> {
    let (assets, truncated) = collect_assets(client, owner_name, release_id, Some(target))?;
    let found = assets.iter().find(|(asset, _)| asset.id == target).cloned();
    Ok((found, truncated))
}

fn validate_asset_url(raw: &str, owner_name: &str, asset_id: u64) -> Result<(), AppError> {
    let (owner, name) = split_owner_name(owner_name)?;
    let expected =
        format!("https://api.github.com/repos/{owner}/{name}/releases/assets/{asset_id}");
    let url = url::Url::parse(raw)
        .map_err(|_| AppError::InvalidInput("invalid release asset API URL".to_owned()))?;
    if raw != expected
        || url.as_str() != expected
        || url.scheme() != "https"
        || url.host_str() != Some("api.github.com")
        || url.port_or_known_default() != Some(443)
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(AppError::InvalidInput(
            "release asset URL does not match its validated repository and ID".to_owned(),
        ));
    }
    Ok(())
}

fn split_owner_name(owner_name: &str) -> Result<(&str, &str), AppError> {
    owner_name.split_once('/').ok_or_else(|| {
        AppError::Internal("validated release source has an invalid owner/name".to_owned())
    })
}

#[cfg(test)]
mod tests {
    use std::{
        io::{BufRead, BufReader, Write},
        net::{TcpListener, TcpStream},
        sync::mpsc,
        thread,
        time::Duration,
    };

    use git2::{Repository, Signature};
    use tempfile::TempDir;

    use crate::{error::AppError, github::api::GitHubClient, repository::ActiveRepo};

    use super::{
        get_release_assets_with_client, resolve_release_asset_with_client_impl, ReleaseAssetInfo,
        MAX_PAGES, PAGE_SIZE,
    };

    struct FakeResponse {
        status: u16,
        headers: Vec<(String, String)>,
        body: Vec<u8>,
    }

    struct FakeGitHub {
        base_url: String,
        requests: mpsc::Receiver<String>,
        _server: thread::JoinHandle<()>,
    }

    impl FakeGitHub {
        fn start(responses: Vec<FakeResponse>) -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let base_url = format!("http://{}", listener.local_addr().unwrap());
            let (sender, requests) = mpsc::channel();
            let server = thread::spawn(move || {
                for response in responses {
                    let Ok((stream, _)) = listener.accept() else {
                        return;
                    };
                    serve(stream, response, &sender);
                }
            });
            Self {
                base_url,
                requests,
                _server: server,
            }
        }

        fn client(&self) -> GitHubClient {
            GitHubClient::with_base_url("test-token".to_owned(), self.base_url.clone()).unwrap()
        }

        fn next_request(&self) -> String {
            self.requests.recv_timeout(Duration::from_secs(5)).unwrap()
        }
    }

    fn serve(mut stream: TcpStream, response: FakeResponse, requests: &mpsc::Sender<String>) {
        let mut reader = BufReader::new(stream.try_clone().unwrap());
        let mut request = String::new();
        loop {
            let mut line = String::new();
            if reader.read_line(&mut line).unwrap_or(0) == 0 || line == "\r\n" {
                break;
            }
            request.push_str(&line);
        }
        let _ = requests.send(request);
        let reason = if response.status < 400 { "OK" } else { "ERR" };
        let mut headers = format!(
            "HTTP/1.1 {} {}\r\nConnection: close\r\nContent-Length: {}\r\n",
            response.status,
            reason,
            response.body.len()
        );
        for (name, value) in response.headers {
            headers.push_str(&name);
            headers.push_str(": ");
            headers.push_str(&value);
            headers.push_str("\r\n");
        }
        headers.push_str("\r\n");
        let _ = stream.write_all(headers.as_bytes());
        let _ = stream.write_all(&response.body);
        let _ = stream.flush();
    }

    fn repository() -> (TempDir, ActiveRepo) {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("repo");
        std::fs::create_dir(&path).unwrap();
        let repository = Repository::init(&path).unwrap();
        repository
            .remote("origin", "https://github.com/example/project.git")
            .unwrap();
        let tree_id = repository.treebuilder(None).unwrap().write().unwrap();
        let tree = repository.find_tree(tree_id).unwrap();
        let signature = Signature::now("test", "test@example.com").unwrap();
        repository
            .commit(Some("HEAD"), &signature, &signature, "initial", &tree, &[])
            .unwrap();
        drop(tree);
        (directory, ActiveRepo::validate(path).unwrap())
    }

    #[allow(
        clippy::needless_pass_by_value,
        reason = "fixtures consume concise JSON values"
    )]
    fn response(status: u16, body: serde_json::Value) -> FakeResponse {
        FakeResponse {
            status,
            headers: Vec::new(),
            body: body.to_string().into_bytes(),
        }
    }

    fn release(id: u64, draft: bool) -> serde_json::Value {
        serde_json::json!({ "id": id, "draft": draft })
    }

    fn asset(id: u64, url: &str) -> serde_json::Value {
        serde_json::json!({
            "id": id,
            "name": format!("asset-{id}.zip"),
            "size": 20,
            "digest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "url": url
        })
    }

    #[test]
    fn discovery_checks_release_then_returns_bounded_metadata_without_urls() {
        let (_directory, active) = repository();
        let server = FakeGitHub::start(vec![
            response(200, release(18, false)),
            response(
                200,
                serde_json::json!([asset(
                    19,
                    "https://api.github.com/repos/example/project/releases/assets/19"
                )]),
            ),
        ]);
        let assets = get_release_assets_with_client(&active, 18, &server.client()).unwrap();
        assert_eq!(
            server.next_request().lines().next().unwrap(),
            "GET /repos/example/project/releases/18 HTTP/1.1"
        );
        assert_eq!(
            server.next_request().lines().next().unwrap(),
            "GET /repos/example/project/releases/18/assets?per_page=100&page=1 HTTP/1.1"
        );
        assert_eq!(
            assets.source,
            crate::releases::ReleaseSource::Github {
                owner: "example".into(),
                name: "project".into()
            }
        );
        assert_eq!(assets.release_id, 18);
        assert_eq!(
            assets.assets,
            vec![ReleaseAssetInfo {
                id: 19,
                name: "asset-19.zip".into(),
                size: 20,
                sha256: Some(
                    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                        .into()
                ),
            }]
        );
        assert!(!assets.truncated);
    }

    #[test]
    fn resolver_rechecks_membership_and_returns_only_the_matched_rest_url() {
        let (_directory, active) = repository();
        let server = FakeGitHub::start(vec![
            response(200, release(18, false)),
            response(
                200,
                serde_json::json!([asset(
                    19,
                    "https://api.github.com/repos/example/project/releases/assets/19"
                )]),
            ),
        ]);
        let (info, request) =
            resolve_release_asset_with_client_impl(&active, 18, 19, &server.client()).unwrap();
        assert_eq!(info.id, 19);
        assert_eq!(
            request.url,
            "https://api.github.com/repos/example/project/releases/assets/19"
        );
        assert_eq!(
            server.next_request().lines().next().unwrap(),
            "GET /repos/example/project/releases/18 HTTP/1.1"
        );
        assert_eq!(
            server.next_request().lines().next().unwrap(),
            "GET /repos/example/project/releases/18/assets?per_page=100&page=1 HTTP/1.1"
        );
    }

    #[test]
    fn resolver_rejects_wrong_release_draft_missing_asset_and_hostile_url() {
        let (_directory, active) = repository();
        let mismatch = FakeGitHub::start(vec![response(200, release(17, false))]);
        assert!(matches!(
            resolve_release_asset_with_client_impl(&active, 18, 19, &mismatch.client()),
            Err(AppError::NotFound)
        ));

        let draft = FakeGitHub::start(vec![response(200, release(18, true))]);
        assert!(matches!(
            resolve_release_asset_with_client_impl(&active, 18, 19, &draft.client()),
            Err(AppError::NotFound)
        ));

        let missing = FakeGitHub::start(vec![
            response(200, release(18, false)),
            response(200, serde_json::json!([])),
        ]);
        assert!(matches!(
            resolve_release_asset_with_client_impl(&active, 18, 19, &missing.client()),
            Err(AppError::NotFound)
        ));

        let hostile = FakeGitHub::start(vec![
            response(200, release(18, false)),
            response(
                200,
                serde_json::json!([asset(
                    19,
                    "https://api.github.com.evil.example/repos/example/project/releases/assets/19"
                )]),
            ),
        ]);
        assert!(matches!(
            resolve_release_asset_with_client_impl(&active, 18, 19, &hostile.client()),
            Err(AppError::InvalidInput(_))
        ));
    }

    #[test]
    fn release_metadata_redirect_is_rejected_without_following() {
        let (_directory, active) = repository();
        let mut redirect = response(302, serde_json::json!({}));
        redirect
            .headers
            .push(("Location".into(), "https://evil.example/metadata".into()));
        let server = FakeGitHub::start(vec![redirect]);
        assert!(matches!(
            get_release_assets_with_client(&active, 18, &server.client()),
            Err(AppError::Network(_))
        ));
        assert!(server
            .next_request()
            .starts_with("GET /repos/example/project/releases/18 HTTP/1.1"));
        assert!(server
            .requests
            .recv_timeout(Duration::from_millis(100))
            .is_err());
    }

    #[test]
    fn metadata_ids_and_page_sizes_are_validated_and_capped() {
        let (_directory, active) = repository();
        assert!(matches!(
            get_release_assets_with_client(&active, 0, &GitHubClient::new("unused".into())),
            Err(AppError::InvalidInput(_))
        ));

        let mut oversized_page = vec![
            asset(
                1,
                "https://api.github.com/repos/example/project/releases/assets/1"
            );
            PAGE_SIZE + 1
        ];
        for (index, value) in oversized_page.iter_mut().enumerate() {
            *value = asset(
                (index + 1) as u64,
                &format!(
                    "https://api.github.com/repos/example/project/releases/assets/{}",
                    index + 1
                ),
            );
        }
        let page_server = FakeGitHub::start(vec![
            response(200, release(18, false)),
            response(200, serde_json::Value::Array(oversized_page)),
        ]);
        assert!(matches!(
            get_release_assets_with_client(&active, 18, &page_server.client()),
            Err(AppError::ResourceLimitExceeded(_))
        ));

        let mut responses = vec![response(200, release(18, false))];
        for page in 0..MAX_PAGES {
            let page_assets = (0..PAGE_SIZE)
                .map(|index| {
                    let id = (page * PAGE_SIZE + index + 1) as u64;
                    asset(
                        id,
                        &format!(
                            "https://api.github.com/repos/example/project/releases/assets/{id}"
                        ),
                    )
                })
                .collect::<Vec<_>>();
            responses.push(response(200, serde_json::Value::Array(page_assets)));
        }
        let cap_server = FakeGitHub::start(responses);
        let capped = get_release_assets_with_client(&active, 18, &cap_server.client()).unwrap();
        assert_eq!(capped.assets.len(), MAX_PAGES * PAGE_SIZE);
        assert!(capped.truncated);
    }
}
