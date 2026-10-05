//! GitHub token storage, backed by the operating system keychain.
//!
//! The token never leaves this crate. It is written here, read here, and handed
//! straight to libgit2's credential callback or to an HTTP header — it is never
//! returned across the IPC boundary, not even masked. The interface asks
//! whether a token exists, never what it is.
//!
//! This replaces the Stronghold plugin named in the original design: Stronghold
//! is deprecated and slated for removal in Tauri v3, and it would additionally
//! require either a user password or somewhere to keep its own encryption key.

use git2::{Cred, CredentialType, Error as GitError, ErrorClass, ErrorCode};
use keyring::Entry;

use crate::error::AppError;

/// Keychain service name. Stable across versions; changing it strands tokens.
const SERVICE: &str = "dev.gitcanvas.github";
/// One account per service, since the app authenticates as a single user.
const ACCOUNT: &str = "personal-access-token";

fn entry() -> Result<Entry, AppError> {
    Entry::new(SERVICE, ACCOUNT).map_err(AppError::from)
}

/// Stores a personal access token in the OS keychain, replacing any previous one.
///
/// # Errors
///
/// Returns [`AppError`] when the token is blank or the keychain rejects the write.
pub fn store_token(token: &str) -> Result<(), AppError> {
    let token = token.trim();
    if token.is_empty() {
        return Err(AppError::InvalidInput(
            "the token cannot be empty".to_owned(),
        ));
    }
    entry()?.set_password(token).map_err(AppError::from)
}

/// Reads the stored token.
///
/// Crate-internal on purpose: nothing outside this crate has a legitimate
/// reason to hold the secret.
///
/// # Errors
///
/// Returns [`AppError`] when no token is stored or the keychain read fails.
pub(crate) fn read_token() -> Result<String, AppError> {
    entry()?.get_password().map_err(AppError::from)
}

/// Reports whether a token is stored, without revealing it.
#[must_use]
pub fn has_token() -> bool {
    read_token().is_ok()
}

/// Removes the stored token.
///
/// Signing out when nothing is stored is not an error: the desired end state
/// is already true.
///
/// # Errors
///
/// Returns [`AppError`] when the keychain refuses the deletion.
pub fn delete_token() -> Result<(), AppError> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(AppError::from(error)),
    }
}

/// Whether `url` is an HTTPS URL served by `github.com` itself.
///
/// The stored token is a GitHub credential. Handing it to any other host — a
/// GitLab remote, a self-hosted server, a look-alike domain — would leak it, so
/// this is the only test that gates its use. It is deliberately strict: a
/// userinfo section (`https://github.com@evil.example/`), a port, or any
/// subdomain makes the URL fail rather than be interpreted charitably.
#[must_use]
pub fn is_github_https(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://") else {
        return false;
    };
    let authority = rest.split(['/', '?', '#']).next().unwrap_or_default();
    authority.eq_ignore_ascii_case("github.com")
}

/// Builds the credential callback shared by every network operation.
///
/// libgit2 asks again whenever the credentials it was given are refused, so a
/// callback that always answers the same way loops forever against a bad
/// token. Each credential kind is therefore offered at most once; after that
/// the callback fails and the operation reports an authentication error.
///
/// The token is only offered to `github.com` over HTTPS, and it never leaves
/// this function except into libgit2.
pub(crate) fn callback() -> impl FnMut(&str, Option<&str>, CredentialType) -> Result<Cred, GitError>
{
    let mut offered_token = false;
    let mut offered_ssh = false;
    move |url, username, allowed| {
        if allowed.contains(CredentialType::USER_PASS_PLAINTEXT)
            && is_github_https(url)
            && !offered_token
        {
            offered_token = true;
            if let Ok(token) = read_token() {
                return Cred::userpass_plaintext(&token, "");
            }
        }
        if allowed.contains(CredentialType::SSH_KEY) && !offered_ssh {
            offered_ssh = true;
            if let Some(username) = username {
                return Cred::ssh_key_from_agent(username);
            }
        }
        Err(GitError::new(
            ErrorCode::Auth,
            ErrorClass::Http,
            "no usable credentials for this remote",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::is_github_https;

    #[test]
    fn only_github_over_https_receives_the_token() {
        for accepted in [
            "https://github.com/owner/repo.git",
            "https://GitHub.com/owner/repo",
            "https://github.com",
        ] {
            assert!(is_github_https(accepted), "rejected {accepted}");
        }
        for rejected in [
            "http://github.com/owner/repo.git",
            "git@github.com:owner/repo.git",
            "ssh://git@github.com/owner/repo.git",
            "https://gitlab.com/owner/repo.git",
            "https://github.com.evil.example/owner/repo.git",
            "https://github.com@evil.example/owner/repo.git",
            "https://user:pass@github.com/owner/repo.git",
            "https://github.com:8443/owner/repo.git",
            "https://api.github.com/owner/repo.git",
            "https://evilgithub.com/owner/repo.git",
            "file:///tmp/repo",
            "",
        ] {
            assert!(!is_github_https(rejected), "accepted {rejected}");
        }
    }
}
