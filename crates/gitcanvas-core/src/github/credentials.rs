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

use keyring::Entry;

use crate::error::AppError;

/// Keychain service name. Stable across versions; changing it strands tokens.
const SERVICE: &str = "dev.gitcanvas.github";
/// One account per service, since the app authenticates as a single user.
const ACCOUNT: &str = "personal-access-token";

impl From<keyring::Error> for AppError {
    fn from(error: keyring::Error) -> Self {
        match error {
            keyring::Error::NoEntry => Self::InvalidInput("no GitHub token is stored".to_owned()),
            other => Self::Internal(format!("keychain error: {other}")),
        }
    }
}

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
