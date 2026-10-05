//! The GitHub REST client.
//!
//! Used for exactly two things: confirming a token works and listing the
//! repositories it can reach, so the user can pick one to clone. Nothing the
//! graph displays comes from here — commits, branches and tags are always read
//! from the local clone through libgit2. One data path, not two.

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
    /// HTTPS URL used to clone this repository.
    pub clone_url: String,
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
    clone_url: String,
    private: bool,
    default_branch: Option<String>,
    description: Option<String>,
}

/// A GitHub REST client bound to one token.
pub struct GitHubClient {
    token: String,
    base_url: String,
    agent: Agent,
}

impl GitHubClient {
    /// Builds a client for the given token.
    #[must_use]
    pub fn new(token: String) -> Self {
        Self {
            token,
            base_url: DEFAULT_BASE_URL.to_owned(),
            agent: api_agent(),
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

    /// Builds a client pointed at a specific HTTPS endpoint or loopback test server.
    ///
    /// The URL is validated before the token can be sent to it.
    #[doc(hidden)]
    pub fn with_base_url(token: String, base_url: String) -> Result<Self, AppError> {
        validate_base_url(&base_url)?;
        Ok(Self {
            token,
            base_url,
            agent: api_agent(),
        })
    }

    fn get(&self, path: &str) -> Result<String, AppError> {
        let url = format!("{}{path}", self.base_url);
        let response = self
            .agent
            .get(&url)
            .header("Authorization", &format!("Bearer {}", self.token))
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .header("User-Agent", USER_AGENT)
            .call();

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
        let mut all = Vec::new();
        let mut truncated = false;

        for page in 1..=MAX_PAGES {
            let body = self.get(&format!(
                "/user/repos?per_page={PAGE_SIZE}&page={page}&sort=pushed&affiliation=owner,collaborator,organization_member"
            ))?;
            let raw: Vec<RawRepository> = serde_json::from_str(&body).map_err(|error| {
                AppError::Internal(format!("unexpected /user/repos payload: {error}"))
            })?;

            let count = raw.len();
            all.extend(raw.into_iter().map(|repo| GitHubRepository {
                full_name: repo.full_name,
                clone_url: repo.clone_url,
                private: repo.private,
                default_branch: repo.default_branch.unwrap_or_else(|| "main".to_owned()),
                description: repo.description,
            }));

            if count < usize::from(PAGE_SIZE) {
                break;
            }
            if page == MAX_PAGES {
                truncated = true;
            }
        }

        Ok(GitHubRepositoryList {
            repositories: all,
            truncated,
        })
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

#[cfg(test)]
mod tests {
    use std::time::Duration;

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
}
