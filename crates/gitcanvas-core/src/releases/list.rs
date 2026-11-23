//! Bounded GitHub release listing joined with tags from the local repository.

use std::{collections::BTreeMap, path::Path};

use git2::{ErrorCode, Repository};
use serde::{Deserialize, Serialize};
use specta::Type;
use url::Url;

use crate::{
    error::AppError,
    github::api::GitHubClient,
    refs::TagInfo,
    releases::{cache, select_source_remote, ReleaseSource},
    repository::ActiveRepo,
};

const PAGE_SIZE: usize = 100;
const MAX_PAGES: usize = 10;
const MAX_RESPONSE_BYTES: u64 = 8 * 1024 * 1024;
const MAX_TAGS: usize = 10_000;
const MAX_NOTES_BYTES: usize = 256 * 1024;
const NOTES_TRUNCATION_MARKER: &str = "\n\n[Release notes truncated at 256 KiB]";

/// One published release returned by GitHub.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ReleaseInfo {
    /// GitHub's stable release identifier.
    pub id: u64,
    /// Git tag name selected for the release.
    pub tag_name: String,
    /// Human-readable release title, if supplied.
    pub name: Option<String>,
    /// Plain-text notes, visibly marked if they exceed the published bound.
    pub notes: String,
    /// HTTPS page for the release, omitted if the API supplied an invalid URL.
    pub html_url: Option<String>,
    /// Whether this is a prerelease.
    pub prerelease: bool,
    /// UTC publication timestamp, absent for a release not yet published.
    pub published_at: Option<String>,
}

/// A release or a local tag with no corresponding published release.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ReleaseListEntry {
    /// Release metadata joined to an exact-name local tag when one exists.
    Release {
        /// The release metadata from GitHub.
        release: ReleaseInfo,
        /// Matching local tag, absent if the tag is not present locally.
        local_tag: Option<TagInfo>,
    },
    /// A local tag that has no matching published GitHub release.
    LocalTag {
        /// The local tag metadata.
        tag: TagInfo,
    },
}

/// Bounded release metadata and the local tag comparison for one source.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ReleaseList {
    /// Validated source that supplied the release metadata.
    pub source: ReleaseSource,
    /// Releases first in GitHub's newest-first order, then unmatched local tags.
    pub entries: Vec<ReleaseListEntry>,
    /// Whether GitHub had more releases after the 1,000-item cap.
    pub truncated: bool,
    /// False when the local repository exceeded the 10,000-tag read limit.
    pub local_tags_available: bool,
    /// Capture time when this result came from cache; absent for a live response.
    pub cached_at: Option<String>,
    /// Rate-limit reset time when a cached result is serving a rate-limited request.
    pub rate_limit_reset: Option<String>,
}

#[derive(Deserialize)]
struct RawRelease {
    id: u64,
    tag_name: String,
    name: Option<String>,
    body: Option<String>,
    html_url: String,
    draft: bool,
    prerelease: bool,
    published_at: Option<String>,
}

/// Lists at most 1,000 published releases and joins them with local tags.
///
/// Public repositories are queried anonymously when no token is stored. Notes
/// are text only, truncated at 256 KiB, and no tag or asset is fetched.
///
/// # Errors
///
/// Returns a typed API, source-selection, local-reference, or size-limit error.
pub fn get_releases(active: &ActiveRepo, data_dir: &Path) -> Result<ReleaseList, AppError> {
    let client = GitHubClient::from_optional_stored_token()?;
    get_releases_with_client_and_data_dir(active, &client, data_dir)
}

/// Returns cached release data joined with current local tags, without network access.
///
/// # Errors
/// Returns repository, source-selection, or local-reference errors.
pub fn get_cached_releases(
    active: &ActiveRepo,
    data_dir: &Path,
) -> Result<Option<ReleaseList>, AppError> {
    let repository = active.open()?;
    let (source, _) = select_source_remote(&repository)?;
    let Some(cached) = cache::load(data_dir, &source)? else {
        return Ok(None);
    };
    let local_tags = read_local_tags(&repository)?;
    let (entries, local_tags_available) = match local_tags {
        Some(mut local_tags) => {
            let mut entries =
                Vec::with_capacity(cached.releases.len().saturating_add(local_tags.len()));
            for release in cached.releases {
                let local_tag = local_tags.remove(&release.tag_name);
                entries.push(ReleaseListEntry::Release { release, local_tag });
            }
            entries.extend(
                local_tags
                    .into_values()
                    .map(|tag| ReleaseListEntry::LocalTag { tag }),
            );
            (entries, true)
        }
        None => (
            cached
                .releases
                .into_iter()
                .map(|release| ReleaseListEntry::Release {
                    release,
                    local_tag: None,
                })
                .collect(),
            false,
        ),
    };
    Ok(Some(ReleaseList {
        source,
        entries,
        truncated: cached.truncated,
        local_tags_available,
        cached_at: Some(cached.captured_at),
        rate_limit_reset: None,
    }))
}

#[cfg(test)]
fn get_releases_with_client(
    active: &ActiveRepo,
    client: &GitHubClient,
) -> Result<ReleaseList, AppError> {
    let data_dir = active
        .path()
        .parent()
        .ok_or_else(|| AppError::InvalidRepository("repository has no parent directory".into()))?
        .join("app-data");
    get_releases_with_client_and_data_dir(active, client, &data_dir)
}

fn get_releases_with_client_and_data_dir(
    active: &ActiveRepo,
    client: &GitHubClient,
    data_dir: &Path,
) -> Result<ReleaseList, AppError> {
    let repository = active.open()?;
    let (source, _) = select_source_remote(&repository)?;
    let (owner, name) = match &source {
        ReleaseSource::Github { owner, name } => (owner, name),
    };

    let (releases, truncated, cached_at, rate_limit_reset) =
        match collect_releases(client, owner, name) {
            Ok((releases, truncated)) => {
                // A cache failure must not hide a fresh response from GitHub.
                let _cache_write = cache::store(data_dir, &source, &releases, truncated);
                (releases, truncated, None, None)
            }
            Err(error @ (AppError::Offline | AppError::RateLimited { .. })) => {
                let rate_limit_reset = match &error {
                    AppError::RateLimited { reset } => reset.clone(),
                    AppError::Offline => None,
                    _ => unreachable!("the match arm only accepts offline and rate-limit errors"),
                };
                let Some(cached) = cache::load(data_dir, &source)? else {
                    return Err(error);
                };
                (
                    cached.releases,
                    cached.truncated,
                    Some(cached.captured_at),
                    rate_limit_reset,
                )
            }
            Err(error) => return Err(error),
        };
    let local_tags = read_local_tags(&repository)?;
    let Some(mut local_tags) = local_tags else {
        return Ok(ReleaseList {
            source,
            entries: releases
                .into_iter()
                .map(|release| ReleaseListEntry::Release {
                    release,
                    local_tag: None,
                })
                .collect(),
            truncated,
            local_tags_available: false,
            cached_at,
            rate_limit_reset,
        });
    };

    let mut entries = Vec::with_capacity(releases.len().saturating_add(local_tags.len()));
    for release in releases {
        let local_tag = local_tags.remove(&release.tag_name);
        entries.push(ReleaseListEntry::Release { release, local_tag });
    }
    entries.extend(
        local_tags
            .into_values()
            .map(|tag| ReleaseListEntry::LocalTag { tag }),
    );

    Ok(ReleaseList {
        source,
        entries,
        truncated,
        local_tags_available: true,
        cached_at,
        rate_limit_reset,
    })
}

/// Lists releases with an explicitly injected anonymous E2E client.
///
/// Available only in opt-in native E2E builds; no environment or keychain is read.
///
/// # Errors
/// Returns source-selection, provider, pagination, or local-reference errors.
#[cfg(feature = "e2e")]
pub fn get_releases_with_e2e_client(
    active: &ActiveRepo,
    client: &GitHubClient,
    data_dir: &Path,
) -> Result<ReleaseList, AppError> {
    get_releases_with_client_and_data_dir(active, client, data_dir)
}

fn collect_releases(
    client: &GitHubClient,
    owner: &str,
    name: &str,
) -> Result<(Vec<ReleaseInfo>, bool), AppError> {
    let mut releases = Vec::new();
    let mut truncated = false;
    for page in 1..=MAX_PAGES {
        let path = format!("/repos/{owner}/{name}/releases?per_page={PAGE_SIZE}&page={page}");
        let body = client.get_release_body(&path, MAX_RESPONSE_BYTES)?;
        let current: Vec<RawRelease> = serde_json::from_slice(&body).map_err(|error| {
            AppError::Internal(format!("unexpected GitHub releases payload: {error}"))
        })?;
        let count = current.len();
        releases.extend(current.into_iter().filter_map(release_from_raw));
        if count < PAGE_SIZE {
            break;
        }
        if page == MAX_PAGES {
            truncated = true;
        }
    }
    Ok((releases, truncated))
}

fn release_from_raw(raw: RawRelease) -> Option<ReleaseInfo> {
    if raw.draft {
        return None;
    }
    let notes = truncate_notes(raw.body.unwrap_or_default());
    let html_url = Url::parse(&raw.html_url)
        .ok()
        .filter(|url| url.scheme() == "https")
        .map(|url| url.to_string());
    Some(ReleaseInfo {
        id: raw.id,
        tag_name: raw.tag_name,
        name: raw.name,
        notes,
        html_url,
        prerelease: raw.prerelease,
        published_at: raw.published_at,
    })
}

fn truncate_notes(notes: String) -> String {
    if notes.len() <= MAX_NOTES_BYTES {
        return notes;
    }
    let end = notes
        .char_indices()
        .take_while(|(index, _)| *index < MAX_NOTES_BYTES)
        .map(|(index, character)| index.saturating_add(character.len_utf8()))
        .take_while(|end| *end <= MAX_NOTES_BYTES)
        .last()
        .unwrap_or_default();
    let mut truncated = notes.get(..end).unwrap_or_default().to_owned();
    truncated.push_str(NOTES_TRUNCATION_MARKER);
    truncated
}

fn read_local_tags(repository: &Repository) -> Result<Option<BTreeMap<String, TagInfo>>, AppError> {
    let mut tags = BTreeMap::new();
    for reference in repository.references_glob("refs/tags/*")? {
        let reference = reference?;
        if tags.len() == MAX_TAGS {
            return Ok(None);
        }
        let full_name = reference
            .name()
            .map_err(|_| AppError::Git("tag reference name must be valid Unicode".to_owned()))?;
        let name = full_name
            .strip_prefix("refs/tags/")
            .ok_or_else(|| AppError::Git("invalid tag reference name".to_owned()))?;
        let target = reference
            .resolve()?
            .target()
            .ok_or_else(|| AppError::Git("tag has no target".to_owned()))?;
        let commit = match reference.peel_to_commit() {
            Ok(commit) => Some(commit),
            Err(error) if error.code() == ErrorCode::InvalidSpec => None,
            Err(error) => return Err(error.into()),
        };
        let is_annotated =
            repository.find_object(target, None)?.kind() == Some(git2::ObjectType::Tag);
        tags.insert(
            name.to_owned(),
            TagInfo {
                name: name.to_owned(),
                target: target.to_string(),
                commit_id: commit.as_ref().map(|commit| commit.id().to_string()),
                is_annotated,
                commit_time: commit.map(|commit| commit.time().seconds().to_string()),
            },
        );
    }
    Ok(Some(tags))
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

    use git2::{Repository, Signature, Time};
    use tempfile::TempDir;

    use crate::{
        error::AppError,
        github::api::GitHubClient,
        releases::{cache, ReleaseInfo, ReleaseListEntry, ReleaseSource},
        repository::ActiveRepo,
    };

    use super::{
        get_cached_releases, get_releases_with_client, get_releases_with_client_and_data_dir,
        MAX_NOTES_BYTES, MAX_PAGES, MAX_RESPONSE_BYTES, PAGE_SIZE,
    };

    type FakeResponse = (u16, Vec<(String, String)>, Vec<u8>);

    struct FakeGitHub {
        base_url: String,
        requests: mpsc::Receiver<String>,
        _thread: thread::JoinHandle<()>,
    }

    impl FakeGitHub {
        fn start(responses: Vec<FakeResponse>) -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let base_url = format!("http://{}", listener.local_addr().unwrap());
            let (sender, requests) = mpsc::channel();
            let server = thread::spawn(move || {
                for (status, headers, body) in responses {
                    let Ok((stream, _)) = listener.accept() else {
                        return;
                    };
                    serve(stream, status, &headers, &body, &sender);
                }
            });
            Self {
                base_url,
                requests,
                _thread: server,
            }
        }

        fn client(&self) -> GitHubClient {
            GitHubClient::with_base_url("test-token".to_owned(), self.base_url.clone()).unwrap()
        }

        fn anonymous_client(&self) -> GitHubClient {
            GitHubClient::anonymous_with_base_url(self.base_url.clone()).unwrap()
        }

        fn next_request(&self) -> String {
            self.requests
                .recv_timeout(Duration::from_secs(5))
                .expect("client should make the expected request")
        }

        fn finish(self) -> String {
            let Self {
                base_url,
                requests,
                _thread: thread,
            } = self;
            drop(requests);
            thread.join().unwrap();
            base_url
        }
    }

    fn serve(
        mut stream: TcpStream,
        status: u16,
        headers: &[(String, String)],
        body: &[u8],
        requests: &mpsc::Sender<String>,
    ) {
        let mut reader = BufReader::new(stream.try_clone().unwrap());
        let mut request = String::new();
        loop {
            let mut line = String::new();
            if reader.read_line(&mut line).unwrap_or(0) == 0 {
                break;
            }
            if line == "\r\n" {
                break;
            }
            request.push_str(&line);
        }
        let _ = requests.send(request);

        let reason = if status < 400 { "OK" } else { "ERR" };
        let mut response = format!(
            "HTTP/1.1 {status} {reason}\r\nContent-Length: {}\r\nConnection: close\r\n",
            body.len()
        );
        for (name, value) in headers {
            response.push_str(name);
            response.push_str(": ");
            response.push_str(value);
            response.push_str("\r\n");
        }
        response.push_str("\r\n");
        let _ = stream.write_all(response.as_bytes());
        let _ = stream.write_all(body);
        let _ = stream.flush();
    }

    fn repository() -> (TempDir, ActiveRepo, Repository) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("worktree");
        std::fs::create_dir(&path).unwrap();
        let repository = Repository::init(&path).unwrap();
        repository
            .remote("origin", "https://github.com/Example/Project.git")
            .unwrap();
        let tree = repository.treebuilder(None).unwrap().write().unwrap();
        let tree = repository.find_tree(tree).unwrap();
        let signature =
            Signature::new("Release", "release@example.com", &Time::new(1_000, 0)).unwrap();
        let commit = repository
            .commit(Some("HEAD"), &signature, &signature, "initial", &tree, &[])
            .unwrap();
        repository
            .tag_lightweight(
                "v1.0",
                repository.find_commit(commit).unwrap().as_object(),
                false,
            )
            .unwrap();
        drop(tree);
        let active = ActiveRepo::validate(&path).unwrap();
        (dir, active, repository)
    }

    fn release_json(id: u64, tag: &str, body: &str, draft: bool, prerelease: bool) -> Vec<u8> {
        serde_json::json!([{
            "id": id,
            "tag_name": tag,
            "name": format!("Release {tag}"),
            "body": body,
            "html_url": format!("https://github.com/Example/Project/releases/tag/{tag}"),
            "draft": draft,
            "prerelease": prerelease,
            "published_at": "2026-11-22T00:00:00Z",
            "assets": [{"id": 1, "name": "never-download.zip", "browser_download_url": "https://example.test/file"}]
        }])
        .to_string()
        .into_bytes()
    }

    #[test]
    fn listing_is_paged_and_joins_local_tags_without_fetching_assets() {
        let (_dir, active, repo) = repository();
        let mut first_page = vec![serde_json::json!({
            "id": 1,
            "tag_name": "v1.0",
            "name": "Release v1.0",
            "body": "notes",
            "html_url": "https://github.com/Example/Project/releases/tag/v1.0",
            "draft": false,
            "prerelease": true,
            "published_at": "2026-11-22T00:00:00Z"
        })];
        first_page.extend((1..PAGE_SIZE).map(|index| {
            serde_json::json!({
                "id": index + 1,
                "tag_name": format!("page-one-{index}"),
                "name": null,
                "body": "",
                "html_url": "https://github.com/Example/Project/releases/tag/other",
                "draft": false,
                "prerelease": false,
                "published_at": null
            })
        }));
        let server = FakeGitHub::start(vec![
            (
                200,
                Vec::new(),
                serde_json::Value::Array(first_page)
                    .to_string()
                    .into_bytes(),
            ),
            (
                200,
                Vec::new(),
                serde_json::json!([{
                    "id": 2,
                    "tag_name": "v2.0",
                    "name": "Release v2.0",
                    "body": "",
                    "html_url": "https://github.com/Example/Project/releases/tag/v2.0",
                    "draft": false,
                    "prerelease": false,
                    "published_at": "2026-11-22T00:00:00Z"
                }])
                .to_string()
                .into_bytes(),
            ),
        ]);
        let client = server.client();

        let result = get_releases_with_client(&active, &client).unwrap();

        assert_eq!(
            server.next_request().lines().next().unwrap(),
            "GET /repos/example/project/releases?per_page=100&page=1 HTTP/1.1"
        );
        let second = server.next_request();
        assert_eq!(
            second.lines().next().unwrap(),
            "GET /repos/example/project/releases?per_page=100&page=2 HTTP/1.1"
        );
        assert!(second
            .to_ascii_lowercase()
            .contains("authorization: bearer test-token"));
        assert_eq!(
            result.source,
            ReleaseSource::Github {
                owner: "example".to_owned(),
                name: "project".to_owned(),
            }
        );
        assert!(result.local_tags_available);
        assert!(!result.truncated);
        assert_eq!(result.entries.len(), PAGE_SIZE + 1);
        assert!(matches!(
            &result.entries[0],
            ReleaseListEntry::Release { release, local_tag: Some(tag) }
                if release.prerelease && tag.name == "v1.0"
        ));
        assert!(matches!(
            result.entries.iter().find(|entry| matches!(entry,
                ReleaseListEntry::Release { release, .. } if release.tag_name == "v2.0"
            )).unwrap(),
            ReleaseListEntry::Release { release, local_tag: None }
                if release.tag_name == "v2.0"
        ));
        assert!(repo.find_reference("refs/tags/v2.0").is_err());
    }

    #[test]
    fn cached_listing_uses_current_tags_without_network_access() {
        let (directory, active, _repository) = repository();
        let data_dir = directory.path().join("app-data");
        let source = ReleaseSource::Github {
            owner: "example".to_owned(),
            name: "project".to_owned(),
        };
        cache::store(
            &data_dir,
            &source,
            &[ReleaseInfo {
                id: 1,
                tag_name: "v1.0".to_owned(),
                name: Some("Release v1.0".to_owned()),
                notes: "cached".to_owned(),
                html_url: None,
                prerelease: false,
                published_at: None,
            }],
            false,
        )
        .unwrap();

        let cached = get_cached_releases(&active, &data_dir).unwrap().unwrap();

        assert_eq!(cached.source, source);
        assert!(cached.cached_at.is_some());
        assert!(cached.local_tags_available);
        assert!(matches!(
            cached.entries.as_slice(),
            [ReleaseListEntry::Release { local_tag: Some(tag), .. }] if tag.name == "v1.0"
        ));
    }

    #[test]
    fn listing_stops_after_short_page_and_filters_drafts() {
        let (_dir, active, _repo) = repository();
        let server = FakeGitHub::start(vec![(
            200,
            Vec::new(),
            serde_json::json!([
                {"id": 1, "tag_name": "v1.0", "name": "published", "body": "", "html_url": "https://github.com/e/p/releases/tag/v1.0", "draft": false, "prerelease": false, "published_at": null},
                {"id": 2, "tag_name": "draft", "name": "draft", "body": "", "html_url": "https://github.com/e/p/releases/tag/draft", "draft": true, "prerelease": false, "published_at": null}
            ])
            .to_string()
            .into_bytes(),
        )]);
        let client = server.client();

        let result = get_releases_with_client(&active, &client).unwrap();
        let request = server.next_request();

        assert_eq!(
            request.lines().next().unwrap(),
            "GET /repos/example/project/releases?per_page=100&page=1 HTTP/1.1"
        );
        assert_eq!(result.entries.len(), 1);
    }

    #[test]
    fn empty_release_page_returns_an_empty_complete_list() {
        let (_dir, active, _repo) = repository();
        let server = FakeGitHub::start(vec![(200, Vec::new(), b"[]".to_vec())]);

        let result = get_releases_with_client(&active, &server.client()).unwrap();
        let request = server.next_request();

        assert!(request.starts_with("GET /repos/example/project/releases?"));
        assert!(matches!(
            result.entries.as_slice(),
            [ReleaseListEntry::LocalTag { tag }] if tag.name == "v1.0"
        ));
        assert!(!result.truncated);
        assert!(result.local_tags_available);
    }

    #[test]
    fn public_repository_listing_works_without_an_authorization_header() {
        let (_dir, active, _repo) = repository();
        let server = FakeGitHub::start(vec![(
            200,
            Vec::new(),
            release_json(1, "v1.0", "public notes", false, false),
        )]);

        let result = get_releases_with_client(&active, &server.anonymous_client()).unwrap();
        let request = server.next_request();

        assert!(request.starts_with("GET /repos/example/project/releases?"));
        assert!(!request.to_ascii_lowercase().contains("authorization:"));
        assert_eq!(result.entries.len(), 1);
    }

    #[test]
    fn offline_and_rate_limited_queries_serve_cache_with_current_local_tags() {
        let (dir, active, repo) = repository();
        let data_dir = dir.path().join("app-data");
        let server = FakeGitHub::start(vec![(
            200,
            Vec::new(),
            release_json(2, "v2.0", "cached notes", false, false),
        )]);
        let live =
            get_releases_with_client_and_data_dir(&active, &server.client(), &data_dir).unwrap();
        let _request = server.next_request();
        let offline_url = server.finish();
        assert!(live.cached_at.is_none());

        repo.tag_lightweight(
            "v2.0",
            repo.head().unwrap().peel_to_commit().unwrap().as_object(),
            false,
        )
        .unwrap();
        let offline_client =
            GitHubClient::with_base_url("test-token".to_owned(), offline_url).unwrap();
        let offline =
            get_releases_with_client_and_data_dir(&active, &offline_client, &data_dir).unwrap();
        assert!(offline.cached_at.is_some());
        assert!(offline.rate_limit_reset.is_none());
        assert!(offline.entries.iter().any(|entry| matches!(
            entry,
            ReleaseListEntry::Release {
                release,
                local_tag: Some(tag)
            } if release.tag_name == "v2.0" && tag.name == "v2.0"
        )));
        assert!(offline.entries.iter().any(|entry| matches!(
            entry,
            ReleaseListEntry::LocalTag { tag } if tag.name == "v1.0"
        )));

        let limited = FakeGitHub::start(vec![(
            429,
            vec![("X-RateLimit-Reset".to_owned(), "12345".to_owned())],
            Vec::new(),
        )]);
        let cached =
            get_releases_with_client_and_data_dir(&active, &limited.client(), &data_dir).unwrap();
        let _request = limited.next_request();
        assert!(cached.cached_at.is_some());
        assert_eq!(cached.rate_limit_reset.as_deref(), Some("12345"));
        assert!(cached.entries.iter().any(|entry| matches!(
            entry,
            ReleaseListEntry::Release { local_tag: Some(tag), .. } if tag.name == "v2.0"
        )));
    }

    #[test]
    fn offline_without_a_cache_preserves_the_offline_error() {
        let (dir, active, _repo) = repository();
        let server = FakeGitHub::start(vec![]);
        let offline_url = server.finish();
        let client = GitHubClient::with_base_url("test-token".to_owned(), offline_url).unwrap();
        let error = get_releases_with_client_and_data_dir(
            &active,
            &client,
            &dir.path().join("empty-app-data"),
        )
        .unwrap_err();

        assert_eq!(error, AppError::Offline);
    }

    #[test]
    fn listing_marks_the_thousand_item_cap_and_ignores_unrelated_local_tags() {
        let (_dir, active, repo) = repository();
        for index in 0..MAX_PAGES * PAGE_SIZE {
            let tag_name = format!("v{index}");
            repo.tag_lightweight(
                &tag_name,
                repo.head().unwrap().peel_to_commit().unwrap().as_object(),
                false,
            )
            .unwrap();
        }
        let full_page = serde_json::Value::Array(
            (0..PAGE_SIZE)
                .map(|index| {
                    serde_json::json!({
                        "id": index,
                        "tag_name": format!("remote-{index}"),
                        "name": null,
                        "body": "",
                        "html_url": "https://github.com/example/project/releases/tag/remote",
                        "draft": false,
                        "prerelease": false,
                        "published_at": null
                    })
                })
                .collect(),
        );
        let page = full_page.to_string().into_bytes();
        let server = FakeGitHub::start(
            (0..MAX_PAGES)
                .map(|_| (200, Vec::new(), page.clone()))
                .collect(),
        );
        let client = server.client();

        let result = get_releases_with_client(&active, &client).unwrap();

        for page_number in 1..=MAX_PAGES {
            let request = server.next_request();
            assert!(request
                .lines()
                .next()
                .unwrap()
                .contains(&format!("page={page_number} ")));
        }
        assert!(result.truncated);
        assert_eq!(result.entries.len(), MAX_PAGES * PAGE_SIZE * 2 + 1);
    }

    #[test]
    fn excessive_local_tags_leave_releases_visible_with_local_status_unavailable() {
        let (_dir, active, repo) = repository();
        let target = repo.head().unwrap().peel_to_commit().unwrap().id();
        for index in 0..=10_000 {
            repo.reference(
                &format!("refs/tags/overflow-{index}"),
                target,
                false,
                "test",
            )
            .unwrap();
        }
        let server = FakeGitHub::start(vec![(
            200,
            Vec::new(),
            release_json(1, "v1.0", "notes", false, false),
        )]);
        let client = server.client();

        let result = get_releases_with_client(&active, &client).unwrap();
        let _request = server.next_request();

        assert!(!result.local_tags_available);
        assert!(matches!(
            result.entries.as_slice(),
            [ReleaseListEntry::Release { release, local_tag: None }]
                if release.tag_name == "v1.0"
        ));
    }

    #[test]
    fn response_over_eight_mib_is_rejected_and_notes_are_truncated() {
        let (_dir, active, _repo) = repository();
        let oversized = FakeGitHub::start(vec![(
            200,
            Vec::new(),
            vec![b' '; usize::try_from(MAX_RESPONSE_BYTES).unwrap() + 1],
        )]);
        let error = get_releases_with_client(&active, &oversized.client()).unwrap_err();
        let _request = oversized.next_request();
        assert!(matches!(error, AppError::ResourceLimitExceeded(_)));

        let notes = "é".repeat(MAX_NOTES_BYTES);
        let response = release_json(1, "v1.0", &notes, false, false);
        let server = FakeGitHub::start(vec![(200, Vec::new(), response)]);
        let result = get_releases_with_client(&active, &server.client()).unwrap();
        let _request = server.next_request();
        let ReleaseListEntry::Release { release, .. } = &result.entries[0] else {
            panic!("expected release entry");
        };
        assert!(release
            .notes
            .ends_with("[Release notes truncated at 256 KiB]"));
        assert!(release.notes.len() <= MAX_NOTES_BYTES + super::NOTES_TRUNCATION_MARKER.len());
    }

    #[test]
    fn rate_limit_and_access_errors_are_typed_for_release_requests() {
        let (_dir, active, _repo) = repository();
        let server = FakeGitHub::start(vec![(
            403,
            vec![
                ("X-RateLimit-Remaining".to_owned(), "0".to_owned()),
                ("X-RateLimit-Reset".to_owned(), "12345".to_owned()),
            ],
            Vec::new(),
        )]);
        let error = get_releases_with_client(&active, &server.client()).unwrap_err();
        let _request = server.next_request();
        assert_eq!(
            error,
            AppError::RateLimited {
                reset: Some("12345".to_owned())
            }
        );

        let server = FakeGitHub::start(vec![(401, Vec::new(), Vec::new())]);
        let error = get_releases_with_client(&active, &server.client()).unwrap_err();
        let _request = server.next_request();
        assert_eq!(error, AppError::AccessRequired);

        let server = FakeGitHub::start(vec![(403, Vec::new(), Vec::new())]);
        let error = get_releases_with_client(&active, &server.client()).unwrap_err();
        let _request = server.next_request();
        assert_eq!(error, AppError::AccessRequired);
    }
}
