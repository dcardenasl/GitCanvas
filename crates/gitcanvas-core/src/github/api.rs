//! The GitHub REST client.
//!
//! Used for confirming a token, listing repositories to clone, and reading
//! bounded GitHub release metadata. Release data is provider metadata; commits,
//! branches and tags shown by the graph continue to come from the local clone
//! through libgit2. [`crate::releases`] joins release metadata to local tags but
//! never uses API data as Git history or fetches tags or assets while listing.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use specta::Type;
use ureq::Agent;
use url::{Host, Url};

use crate::{error::AppError, github::credentials};

/// The GitHub REST API. Only [`GitHubClient::with_base_url`] can point a client
/// elsewhere, and only tests call it: reading the address from the environment
/// would let anything that can set a variable redirect the token.
const DEFAULT_BASE_URL: &str = "https://api.github.com";
/// GitHub requires a User-Agent and rejects requests without one.
const USER_AGENT: &str = concat!("GitCanvas/", env!("CARGO_PKG_VERSION"));
/// Repositories per page. 100 is GitHub's maximum.
const PAGE_SIZE: u8 = 100;
/// Pages to walk before stopping, so a huge account cannot hang the picker.
const MAX_PAGES: u8 = 10;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

/// The authenticated account.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct GitHubAccount {
    /// GitHub account login.
    pub login: String,
    /// Display name supplied by GitHub, if set.
    pub name: Option<String>,
}

/// A repository the token can reach.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct GitHubRepository {
    /// Owner and repository name separated by `/`.
    pub full_name: String,
    /// Whether the repository is private.
    pub private: bool,
    /// Name of the repository's default branch.
    pub default_branch: String,
    /// Repository description, if supplied.
    pub description: Option<String>,
}

/// The bounded repository listing and whether more repositories were available.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct GitHubRepositoryList {
    /// Repositories returned within the configured page limit.
    pub repositories: Vec<GitHubRepository>,
    /// Whether additional repositories were omitted by the result limit.
    pub truncated: bool,
}

#[derive(Deserialize)]
struct RawUser {
    login: String,
    name: Option<String>,
}

#[derive(Deserialize)]
struct RawRepository {
    full_name: String,
    private: bool,
    default_branch: Option<String>,
    description: Option<String>,
}

/// A GitHub REST client bound to one token.
pub struct GitHubClient {
    token: Option<String>,
    base_url: String,
    agent: Agent,
    #[cfg(feature = "e2e")]
    e2e_origin: Option<Url>,
}

impl GitHubClient {
    /// Builds a client for the given token.
    #[must_use]
    pub fn new(token: String) -> Self {
        Self {
            token: Some(token),
            base_url: DEFAULT_BASE_URL.to_owned(),
            agent: api_agent(),
            #[cfg(feature = "e2e")]
            e2e_origin: None,
        }
    }

    /// Builds a client without credentials for public release endpoints.
    pub(crate) fn anonymous() -> Self {
        Self {
            token: None,
            base_url: DEFAULT_BASE_URL.to_owned(),
            agent: api_agent(),
            #[cfg(feature = "e2e")]
            e2e_origin: None,
        }
    }

    /// Builds a client from the token in the OS keychain.
    ///
    /// The secret is read here, inside the crate, so callers never hold it.
    ///
    /// # Errors
    ///
    /// Returns [`AppError::Auth`] when no token is stored.
    pub fn from_stored_token() -> Result<Self, AppError> {
        credentials::read_token().map(Self::new)
    }

    /// Builds a client with the stored token when one exists, otherwise anonymously.
    pub(crate) fn from_optional_stored_token() -> Result<Self, AppError> {
        if credentials::has_token()? {
            Self::from_stored_token()
        } else {
            Ok(Self::anonymous())
        }
    }

    /// Builds an anonymous client pinned to an exact loopback origin for native E2E.
    ///
    /// This constructor only exists when the application explicitly enables its
    /// opt-in `e2e` feature. It never reads the environment or OS keychain.
    ///
    /// # Errors
    /// Returns [`AppError::InvalidInput`] if the origin is not a literal IPv4 or
    /// IPv6 loopback address with an explicit nonzero port and no extra URL parts.
    #[cfg(feature = "e2e")]
    pub fn for_e2e_loopback(base_url: &str) -> Result<Self, AppError> {
        let origin = validate_e2e_base_url(base_url)?;
        let normalized = origin.as_str().trim_end_matches('/').to_owned();
        Ok(Self {
            token: None,
            base_url: normalized,
            agent: Agent::new_with_config(
                Agent::config_builder()
                    .proxy(None)
                    .max_redirects(0)
                    .timeout_global(Some(REQUEST_TIMEOUT))
                    .timeout_connect(Some(CONNECT_TIMEOUT))
                    .http_status_as_error(false)
                    .build(),
            ),
            e2e_origin: Some(origin),
        })
    }

    /// Returns the pinned local origin only for an explicitly injected E2E client.
    #[cfg(feature = "e2e")]
    pub(crate) fn e2e_origin(&self) -> Option<&Url> {
        self.e2e_origin.as_ref()
    }

    /// Builds a client pointed at a specific HTTPS endpoint or loopback test server.
    ///
    /// The URL is validated before the token can be sent to it.
    #[doc(hidden)]
    pub fn with_base_url(token: String, base_url: String) -> Result<Self, AppError> {
        validate_base_url(&base_url)?;
        Ok(Self {
            token: Some(token),
            base_url,
            agent: api_agent(),
            #[cfg(feature = "e2e")]
            e2e_origin: None,
        })
    }

    /// Builds an anonymous client against a validated local test endpoint.
    #[cfg(test)]
    pub(crate) fn anonymous_with_base_url(base_url: String) -> Result<Self, AppError> {
        validate_base_url(&base_url)?;
        Ok(Self {
            token: None,
            base_url,
            agent: api_agent(),
            #[cfg(feature = "e2e")]
            e2e_origin: None,
        })
    }

    fn get(&self, path: &str) -> Result<String, AppError> {
        let url = format!("{}{path}", self.base_url);
        let mut request = self
            .agent
            .get(&url)
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .header("User-Agent", USER_AGENT);
        if let Some(token) = &self.token {
            request = request.header("Authorization", &format!("Bearer {token}"));
        }
        let response = request.call();

        match response {
            Ok(mut response) if response.status().is_success() => {
                response.body_mut().read_to_string().map_err(|error| {
                    AppError::Network(format!("could not read the GitHub response: {error}"))
                })
            }
            Ok(response) => Err(status_error(
                response.status().as_u16(),
                response
                    .headers()
                    .get("x-ratelimit-remaining")
                    .and_then(|value| value.to_str().ok()),
                response
                    .headers()
                    .get("retry-after")
                    .and_then(|value| value.to_str().ok()),
            )),
            Err(ureq::Error::StatusCode(401)) => {
                Err(AppError::Auth("the GitHub token is invalid".to_owned()))
            }
            Err(ureq::Error::StatusCode(403)) => Err(AppError::Auth(
                "the GitHub token lacks the required scopes".to_owned(),
            )),
            Err(ureq::Error::StatusCode(code)) if code >= 500 => Err(AppError::Network(format!(
                "GitHub responded with status {code}"
            ))),
            Err(ureq::Error::StatusCode(code)) => Err(AppError::Internal(format!(
                "GitHub rejected the request with status {code}"
            ))),
            Err(error) => Err(AppError::Network(format!(
                "could not reach GitHub: {error}"
            ))),
        }
    }

    /// Fetches a bounded release API response and maps release-specific errors.
    pub(crate) fn get_release_body(&self, path: &str, max_bytes: u64) -> Result<Vec<u8>, AppError> {
        let url = format!("{}{path}", self.base_url);
        let mut request = self
            .agent
            .get(&url)
            .header("Accept", "application/vnd.github+json")
            .header("Accept-Encoding", "identity")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .header("User-Agent", USER_AGENT);
        if let Some(token) = &self.token {
            request = request.header("Authorization", &format!("Bearer {token}"));
        }

        match request.call() {
            Ok(mut response) if response.status().is_success() => response
                .body_mut()
                .with_config()
                .limit(max_bytes)
                .read_to_vec()
                .map_err(|error| match error {
                    ureq::Error::BodyExceedsLimit(_) => AppError::ResourceLimitExceeded(
                        "GitHub release response exceeds 8 MiB".to_owned(),
                    ),
                    error => AppError::Network(format!(
                        "could not read the GitHub release response: {error}"
                    )),
                }),
            Ok(response) => Err(release_status_error(
                response.status().as_u16(),
                response
                    .headers()
                    .get("x-ratelimit-remaining")
                    .and_then(|value| value.to_str().ok()),
                response
                    .headers()
                    .get("retry-after")
                    .and_then(|value| value.to_str().ok()),
                response
                    .headers()
                    .get("x-ratelimit-reset")
                    .and_then(|value| value.to_str().ok()),
            )),
            Err(ureq::Error::StatusCode(status)) => {
                Err(release_status_error(status, None, None, None))
            }
            Err(_) => Err(AppError::Offline),
        }
    }

    /// Fetches a bounded release metadata response with automatic redirects disabled.
    pub(crate) fn get_release_metadata_body(
        &self,
        path: &str,
        max_bytes: u64,
    ) -> Result<Vec<u8>, AppError> {
        let url = format!("{}{path}", self.base_url);
        #[cfg(feature = "e2e")]
        let local_metadata_agent;
        #[cfg(feature = "e2e")]
        let agent = if self.e2e_origin.is_some() {
            local_metadata_agent = e2e_metadata_agent();
            &local_metadata_agent
        } else {
            &metadata_agent()
        };
        #[cfg(not(feature = "e2e"))]
        let agent = &metadata_agent();
        let mut request = agent
            .get(&url)
            .header("Accept", "application/vnd.github+json")
            .header("Accept-Encoding", "identity")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .header("User-Agent", USER_AGENT);
        if let Some(token) = &self.token {
            request = request.header("Authorization", &format!("Bearer {token}"));
        }
        match request.call() {
            Ok(mut response) if response.status().is_success() => response
                .body_mut()
                .with_config()
                .limit(max_bytes)
                .read_to_vec()
                .map_err(|error| match error {
                    ureq::Error::BodyExceedsLimit(_) => AppError::ResourceLimitExceeded(
                        "GitHub release metadata response exceeds 8 MiB".to_owned(),
                    ),
                    error => AppError::Network(format!(
                        "could not read the GitHub release metadata response: {error}"
                    )),
                }),
            Ok(response) if response.status().is_redirection() => Err(AppError::Network(
                "GitHub returned an unexpected release metadata redirect".to_owned(),
            )),
            Ok(response) => Err(release_status_error(
                response.status().as_u16(),
                response
                    .headers()
                    .get("x-ratelimit-remaining")
                    .and_then(|value| value.to_str().ok()),
                response
                    .headers()
                    .get("retry-after")
                    .and_then(|value| value.to_str().ok()),
                response
                    .headers()
                    .get("x-ratelimit-reset")
                    .and_then(|value| value.to_str().ok()),
            )),
            Err(ureq::Error::StatusCode(status)) => {
                Err(release_status_error(status, None, None, None))
            }
            Err(_) => Err(AppError::Offline),
        }
    }

    /// Confirms the token works and reports who it belongs to.
    ///
    /// # Errors
    ///
    /// Returns [`AppError`] when the token is rejected or GitHub is unreachable.
    pub fn verify(&self) -> Result<GitHubAccount, AppError> {
        let body = self.get("/user")?;
        let user: RawUser = serde_json::from_str(&body)
            .map_err(|error| AppError::Internal(format!("unexpected /user payload: {error}")))?;
        Ok(GitHubAccount {
            login: user.login,
            name: user.name,
        })
    }

    /// Lists the repositories the token can reach, newest activity first.
    ///
    /// # Errors
    ///
    /// Returns [`AppError`] when the token is rejected, GitHub is unreachable,
    /// or a page cannot be parsed.
    pub fn list_repositories(&self) -> Result<GitHubRepositoryList, AppError> {
        let (raw, truncated) = collect_pages(|page| {
            let body = self.get(&format!(
                "/user/repos?per_page={PAGE_SIZE}&page={page}&sort=pushed&affiliation=owner,collaborator,organization_member"
            ))?;
            serde_json::from_str::<Vec<RawRepository>>(&body).map_err(|error| {
                AppError::Internal(format!("unexpected /user/repos payload: {error}"))
            })
        })?;

        let repositories = raw
            .into_iter()
            .map(|repo| GitHubRepository {
                full_name: repo.full_name,
                private: repo.private,
                default_branch: repo.default_branch.unwrap_or_else(|| "main".to_owned()),
                description: repo.description,
            })
            .collect();

        Ok(GitHubRepositoryList {
            repositories,
            truncated,
        })
    }
}

fn collect_pages<T>(
    mut fetch_page: impl FnMut(u8) -> Result<Vec<T>, AppError>,
) -> Result<(Vec<T>, bool), AppError> {
    let mut all = Vec::new();
    let mut truncated = false;

    for page in 1..=MAX_PAGES {
        let current = fetch_page(page)?;
        let count = current.len();
        all.extend(current);

        if count < usize::from(PAGE_SIZE) {
            break;
        }
        if page == MAX_PAGES {
            truncated = true;
        }
    }

    Ok((all, truncated))
}

#[cfg(test)]
mod pagination_tests {
    use super::{collect_pages, AppError, MAX_PAGES, PAGE_SIZE};

    #[test]
    fn bounded_page_collection_reports_truncation_at_the_cap() {
        let mut requested_pages = Vec::new();
        let (items, truncated) = collect_pages(|page| {
            requested_pages.push(page);
            Ok((0..PAGE_SIZE)
                .map(|index| format!("{page}-{index}"))
                .collect())
        })
        .unwrap();

        assert_eq!(requested_pages, (1..=MAX_PAGES).collect::<Vec<_>>());
        assert_eq!(items.len(), usize::from(PAGE_SIZE) * usize::from(MAX_PAGES));
        assert!(truncated);
    }

    #[test]
    fn bounded_page_collection_stops_after_a_short_page() {
        let mut requested_pages = Vec::new();
        let (items, truncated) = collect_pages(|page| {
            requested_pages.push(page);
            let count = if page == 1 { PAGE_SIZE } else { PAGE_SIZE - 1 };
            Ok((0..count).map(|index| format!("{page}-{index}")).collect())
        })
        .unwrap();

        assert_eq!(requested_pages, [1, 2]);
        assert_eq!(items.len(), usize::from(PAGE_SIZE) * 2 - 1);
        assert!(!truncated);
    }

    #[test]
    fn bounded_page_collection_propagates_fetch_errors() {
        let error =
            collect_pages::<String>(|_| Err(AppError::Network("offline".to_owned()))).unwrap_err();

        assert!(matches!(error, AppError::Network(message) if message == "offline"));
    }
}

fn api_agent() -> Agent {
    Agent::new_with_config(
        Agent::config_builder()
            .timeout_global(Some(REQUEST_TIMEOUT))
            .timeout_connect(Some(CONNECT_TIMEOUT))
            .http_status_as_error(false)
            .build(),
    )
}

fn metadata_agent() -> Agent {
    Agent::new_with_config(
        Agent::config_builder()
            .max_redirects(0)
            .timeout_global(Some(REQUEST_TIMEOUT))
            .timeout_connect(Some(CONNECT_TIMEOUT))
            .http_status_as_error(false)
            .build(),
    )
}

#[cfg(feature = "e2e")]
fn e2e_metadata_agent() -> Agent {
    Agent::new_with_config(
        Agent::config_builder()
            .proxy(None)
            .max_redirects(0)
            .timeout_global(Some(REQUEST_TIMEOUT))
            .timeout_connect(Some(CONNECT_TIMEOUT))
            .http_status_as_error(false)
            .build(),
    )
}

fn validate_base_url(base_url: &str) -> Result<(), AppError> {
    let parsed = Url::parse(base_url)
        .map_err(|_| AppError::InvalidInput("invalid GitHub API base URL".to_owned()))?;
    let loopback = match parsed.host() {
        Some(Host::Domain(host)) => host.eq_ignore_ascii_case("localhost"),
        Some(Host::Ipv4(address)) => address.is_loopback(),
        Some(Host::Ipv6(address)) => address.is_loopback(),
        None => false,
    };
    let secure = parsed.scheme() == "https" || (parsed.scheme() == "http" && loopback);
    if parsed.host().is_none()
        || !secure
        || parsed.username() != ""
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return Err(AppError::InvalidInput(
            "GitHub API base URL must use HTTPS, except for loopback test servers".to_owned(),
        ));
    }
    Ok(())
}

#[cfg(feature = "e2e")]
fn validate_e2e_base_url(base_url: &str) -> Result<Url, AppError> {
    let invalid = || AppError::InvalidInput("invalid E2E loopback API origin".to_owned());
    let parsed = Url::parse(base_url).map_err(|_| invalid())?;
    let exact_loopback = match parsed.host() {
        Some(Host::Ipv4(address)) => address.octets() == [127, 0, 0, 1],
        Some(Host::Ipv6(address)) => address.segments() == [0, 0, 0, 0, 0, 0, 0, 1],
        _ => false,
    };
    if parsed.scheme() != "http"
        || !exact_loopback
        || parsed.port().is_none_or(|port| port == 0)
        || !matches!(parsed.path(), "" | "/")
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return Err(invalid());
    }
    Ok(parsed)
}

fn status_error(status: u16, rate_remaining: Option<&str>, retry_after: Option<&str>) -> AppError {
    match status {
        401 => AppError::Auth("the GitHub token is invalid".to_owned()),
        403 if rate_remaining == Some("0") || retry_after.is_some() => {
            AppError::Network("GitHub API rate limit exceeded; wait before trying again".to_owned())
        }
        403 => AppError::Auth("the GitHub token lacks the required scopes".to_owned()),
        429 => {
            AppError::Network("GitHub API rate limit exceeded; wait before trying again".to_owned())
        }
        500..=599 => AppError::Network(format!("GitHub responded with status {status}")),
        code => AppError::Internal(format!("GitHub responded with status {code}")),
    }
}

fn release_status_error(
    status: u16,
    rate_remaining: Option<&str>,
    retry_after: Option<&str>,
    reset: Option<&str>,
) -> AppError {
    match status {
        403 if rate_remaining == Some("0") || retry_after.is_some() => AppError::RateLimited {
            reset: reset.map(str::to_owned),
        },
        401 | 403 => AppError::AccessRequired,
        404 => AppError::NotFound,
        429 => AppError::RateLimited {
            reset: reset.map(str::to_owned),
        },
        500..=599 => AppError::Network(format!("GitHub responded with status {status}")),
        code => AppError::Internal(format!("GitHub responded with status {code}")),
    }
}

#[cfg(test)]
mod tests {
    use std::{
        io::{Read, Write},
        net::TcpListener,
        thread,
        time::Duration,
    };

    use ureq::Agent;

    use super::{validate_base_url, GitHubClient, CONNECT_TIMEOUT, REQUEST_TIMEOUT};
    use crate::error::AppError;

    #[test]
    fn api_agent_has_global_and_connection_timeouts() {
        let client = GitHubClient::new("test-token".to_owned());
        let timeouts = client.agent.config().timeouts();

        assert_eq!(timeouts.global, Some(REQUEST_TIMEOUT));
        assert_eq!(timeouts.connect, Some(CONNECT_TIMEOUT));
        assert_eq!(REQUEST_TIMEOUT, Duration::from_secs(30));
        assert_eq!(CONNECT_TIMEOUT, Duration::from_secs(10));
    }

    #[test]
    fn test_base_url_requires_https_or_a_loopback_http_server() {
        assert!(validate_base_url("https://api.github.com").is_ok());
        assert!(validate_base_url("http://127.0.0.1:4321").is_ok());
        assert!(validate_base_url("http://[::1]:4321").is_ok());
        assert!(matches!(
            validate_base_url("http://api.github.com"),
            Err(AppError::InvalidInput(_))
        ));
        assert!(matches!(
            validate_base_url("https://user:secret@example.com"),
            Err(AppError::InvalidInput(_))
        ));
    }

    #[cfg(feature = "e2e")]
    #[test]
    fn e2e_origin_is_an_explicit_exact_loopback_authority() {
        use super::validate_e2e_base_url;

        for accepted in ["http://127.0.0.1:4321", "http://[::1]:4321/"] {
            assert!(validate_e2e_base_url(accepted).is_ok(), "{accepted}");
        }
        let client = GitHubClient::for_e2e_loopback("http://127.0.0.1:4321").unwrap();
        assert!(client.token.is_none());
        assert!(client.agent.config().proxy().is_none());
        for rejected in [
            "http://localhost:4321",
            "http://127.0.0.2:4321",
            "http://0.0.0.0:4321",
            "https://127.0.0.1:4321",
            "http://127.0.0.1",
            "http://127.0.0.1:0",
            "http://user@127.0.0.1:4321",
            "http://127.0.0.1:4321/api",
            "http://127.0.0.1:4321/?query=1",
            "http://127.0.0.1:4321/#fragment",
        ] {
            assert!(validate_e2e_base_url(rejected).is_err(), "{rejected}");
        }
    }

    #[cfg(feature = "e2e")]
    #[test]
    fn e2e_release_listing_rejects_redirects_without_contacting_the_target() {
        let target = TcpListener::bind("127.0.0.1:0").unwrap();
        let target_address = target.local_addr().unwrap();
        drop(target);
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let source_thread = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0_u8; 2048];
            let _ = stream.read(&mut request).unwrap();
            write!(
                stream,
                "HTTP/1.1 302 Found\r\nLocation: http://{target_address}/followed\r\nConnection: close\r\nContent-Length: 0\r\n\r\n"
            )
            .unwrap();
        });
        let client = GitHubClient::for_e2e_loopback(&format!("http://{address}")).unwrap();
        let error = client
            .get_release_body("/repos/e2e/repo/releases", 1024)
            .unwrap_err();
        assert!(matches!(error, AppError::Internal(_)));
        source_thread.join().unwrap();
    }

    #[test]
    fn release_metadata_body_limit_is_enforced_before_deserialization() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = Vec::new();
            let mut chunk = [0_u8; 1024];
            loop {
                let read = stream.read(&mut chunk).unwrap();
                if read == 0 {
                    break;
                }
                request.extend_from_slice(&chunk[..read]);
                if request.windows(4).any(|window| window == b"\r\n\r\n") {
                    break;
                }
            }
            let body = b"{\"payload\":\"too large\"}";
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: {}\r\n\r\n",
                body.len()
            )
            .unwrap();
            stream.write_all(body).unwrap();
        });
        let mut client =
            GitHubClient::with_base_url("test-token".to_owned(), format!("http://{address}"))
                .unwrap();
        client.agent = Agent::new_with_config(
            Agent::config_builder()
                .proxy(None)
                .http_status_as_error(false)
                .build(),
        );
        let error = client
            .get_release_metadata_body("/metadata", 4)
            .unwrap_err();
        assert!(
            matches!(error, AppError::ResourceLimitExceeded(_)),
            "expected an oversized-response error, got {error:?}"
        );
        server.join().unwrap();
    }
}
