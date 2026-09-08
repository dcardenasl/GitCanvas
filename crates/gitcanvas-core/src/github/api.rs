//! The GitHub REST client.
//!
//! Used for exactly two things: confirming a token works and listing the
//! repositories it can reach, so the user can pick one to clone. Nothing the
//! graph displays comes from here — commits, branches and tags are always read
//! from the local clone through libgit2. One data path, not two.

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::error::AppError;

/// Base URL, overridable so tests can point at a local server.
const DEFAULT_BASE_URL: &str = "https://api.github.com";
/// GitHub requires a User-Agent and rejects requests without one.
const USER_AGENT: &str = concat!("GitCanvas/", env!("CARGO_PKG_VERSION"));
/// Repositories per page. 100 is GitHub's maximum.
const PAGE_SIZE: u8 = 100;
/// Pages to walk before stopping, so a huge account cannot hang the picker.
const MAX_PAGES: u8 = 10;

/// The authenticated account.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct GitHubAccount {
    pub login: String,
    pub name: Option<String>,
}

/// A repository the token can reach.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct GitHubRepository {
    pub full_name: String,
    pub clone_url: String,
    pub private: bool,
    pub default_branch: String,
    pub description: Option<String>,
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
}

impl GitHubClient {
    /// Builds a client for the given token.
    #[must_use]
    pub fn new(token: String) -> Self {
        Self {
            token,
            base_url: std::env::var("GITCANVAS_GITHUB_API")
                .unwrap_or_else(|_| DEFAULT_BASE_URL.to_owned()),
        }
    }

    /// Builds a client pointed at a specific base URL, for tests.
    #[must_use]
    pub fn with_base_url(token: String, base_url: String) -> Self {
        Self { token, base_url }
    }

    fn get(&self, path: &str) -> Result<String, AppError> {
        let url = format!("{}{path}", self.base_url);
        let response = ureq::get(&url)
            .header("Authorization", &format!("Bearer {}", self.token))
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .header("User-Agent", USER_AGENT)
            .call();

        match response {
            Ok(mut response) => response.body_mut().read_to_string().map_err(|error| {
                AppError::Internal(format!("could not read the response: {error}"))
            }),
            Err(ureq::Error::StatusCode(401 | 403)) => Err(AppError::InvalidInput(
                "the GitHub token is invalid or lacks the required scopes".to_owned(),
            )),
            Err(ureq::Error::StatusCode(code)) => Err(AppError::Internal(format!(
                "GitHub responded with status {code}"
            ))),
            Err(error) => Err(AppError::Internal(format!(
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
    pub fn list_repositories(&self) -> Result<Vec<GitHubRepository>, AppError> {
        let mut all = Vec::new();

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
        }

        Ok(all)
    }
}
