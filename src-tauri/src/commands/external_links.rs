//! Safe, user-initiated links from repository supplied release notes.

use gitcanvas_core::error::AppError;
use specta::specta;
use std::sync::Arc;
use tauri::State;
use url::Url;

const MAX_EXTERNAL_URL_LENGTH: usize = 8192;

type OpenUrlCallback = dyn Fn(&str) -> Result<(), AppError> + Send + Sync;

/// Native system-browser opener injected during application setup.
#[derive(Clone)]
pub struct ExternalUrlOpener(Arc<OpenUrlCallback>);

impl ExternalUrlOpener {
    /// Creates the platform callback used after URL validation.
    pub fn new(opener: impl Fn(&str) -> Result<(), AppError> + Send + Sync + 'static) -> Self {
        Self(Arc::new(opener))
    }
}

/// Opens a validated HTTPS URL in the operating system's default browser.
///
/// The caller must be an explicit user action. The URL is untrusted release
/// content, so it is parsed and constrained again on the native side before it
/// reaches the system opener.
#[tauri::command]
#[specta]
#[allow(clippy::needless_pass_by_value)]
pub fn open_external_url(
    url: String,
    opener: State<'_, ExternalUrlOpener>,
) -> Result<(), AppError> {
    let target = validate_external_url(&url)?;
    (opener.0.as_ref())(target.as_str())
}

fn validate_external_url(value: &str) -> Result<Url, AppError> {
    if value.is_empty()
        || value.len() > MAX_EXTERNAL_URL_LENGTH
        || value.chars().any(char::is_control)
    {
        return Err(AppError::InvalidInput(
            "external URL is empty, too long, or contains control characters".to_owned(),
        ));
    }

    let url = Url::parse(value)
        .map_err(|_| AppError::InvalidInput("external URL is malformed".to_owned()))?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(AppError::InvalidInput(
            "only HTTPS URLs without embedded credentials can be opened".to_owned(),
        ));
    }

    Ok(url)
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

    use super::validate_external_url;

    #[test]
    fn accepts_https_urls_for_arbitrary_hosts_and_ports() {
        let url = validate_external_url("https://docs.example.test:8443/path?q=1#section")
            .expect("valid HTTPS link should be accepted");
        assert_eq!(
            url.as_str(),
            "https://docs.example.test:8443/path?q=1#section"
        );
    }

    #[test]
    fn rejects_non_https_schemes_and_relative_urls() {
        for value in [
            "http://example.test/path",
            "javascript:alert(1)",
            "file:///etc/passwd",
            "mailto:help@example.test",
            "/relative/path",
            "//example.test/path",
        ] {
            assert!(validate_external_url(value).is_err(), "accepted {value}");
        }
    }

    #[test]
    fn rejects_embedded_credentials_and_control_characters() {
        assert!(validate_external_url("https://user:secret@example.test/").is_err());
        assert!(validate_external_url("https://example.test/\nnext").is_err());
    }

    #[test]
    fn rejects_malformed_and_overlong_urls() {
        assert!(validate_external_url("https://").is_err());
        assert!(
            validate_external_url(&format!("https://example.test/{}", "a".repeat(8192))).is_err()
        );
    }
}
