//! Bounded, cancellable release-asset downloads to a Rust-selected destination.

use std::{
    fs,
    io::{Read, Write},
    path::Path,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

use fs2::available_space;
use serde::{Deserialize, Serialize};
use specta::Type;
use tempfile::NamedTempFile;
use ureq::{http::StatusCode, Agent};
use url::Url;

use crate::error::AppError;

/// Maximum release-asset size accepted by the downloader.
pub const MAX_DOWNLOAD_BYTES: u64 = 1024 * 1024 * 1024;
const CHUNK_BYTES: usize = 64 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

struct DownloadEnvironment<'a> {
    max_bytes: u64,
    space_available: &'a dyn Fn(&Path) -> Result<u64, AppError>,
    agent: &'a Agent,
    allow_loopback_http: bool,
}

/// A release asset supplied by the validated GitHub release response.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DownloadRequest {
    /// URL returned for the release asset.
    pub url: String,
    /// Suggested filename returned by GitHub.
    pub file_name: String,
    /// API-reported size, checked before making a request.
    pub size: u64,
}

/// Transfer progress in bytes. The API size remains the stable total.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct DownloadProgress {
    /// Number of bytes written to the temporary file.
    pub downloaded_bytes: u64,
    /// API-reported total size.
    pub total_bytes: u64,
}

/// The result of a completed or cancelled transfer.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DownloadOutcome {
    /// The asset was atomically moved to the chosen destination.
    Completed {
        /// Number of bytes written to the completed file.
        downloaded_bytes: u64,
    },
    /// Cancellation removed the temporary file and left the destination alone.
    Cancelled,
}

/// Downloads one asset to a path selected by a Rust-owned native dialog.
///
/// `overwrite_confirmed` must be true only when the native dialog returned an
/// existing regular file after its overwrite confirmation. The destination
/// parent must already exist. No transfer or repository gate is acquired here.
///
/// # Errors
///
/// Returns a typed error for invalid URLs, oversized assets, insufficient
/// space, network failures, filesystem errors, or an unconfirmed destination.
pub fn download_asset(
    request: &DownloadRequest,
    destination: &Path,
    overwrite_confirmed: bool,
    cancelled: &AtomicBool,
    mut progress: impl FnMut(DownloadProgress),
) -> Result<DownloadOutcome, AppError> {
    let space_available = |path: &Path| {
        available_space(path)
            .map_err(|error| AppError::Io(format!("could not inspect free space: {error}")))
    };
    let agent = download_agent();
    let environment = DownloadEnvironment {
        max_bytes: MAX_DOWNLOAD_BYTES,
        space_available: &space_available,
        agent: &agent,
        allow_loopback_http: false,
    };
    download_asset_with(
        request,
        destination,
        overwrite_confirmed,
        cancelled,
        &mut progress,
        &environment,
    )
}

fn download_asset_with(
    request: &DownloadRequest,
    destination: &Path,
    overwrite_confirmed: bool,
    cancelled: &AtomicBool,
    progress: &mut impl FnMut(DownloadProgress),
    environment: &DownloadEnvironment<'_>,
) -> Result<DownloadOutcome, AppError> {
    if request.size > environment.max_bytes {
        return Err(AppError::ResourceLimitExceeded(
            "release asset exceeds the 1 GiB download limit".to_owned(),
        ));
    }
    if cancelled.load(Ordering::Acquire) {
        return Ok(DownloadOutcome::Cancelled);
    }

    let url = validate_download_url(&request.url, environment.allow_loopback_http)?;
    let parent = prepare_destination(destination, overwrite_confirmed)?;
    let available = (environment.space_available)(parent)?;
    if available < request.size {
        return Err(AppError::ResourceLimitExceeded(format!(
            "insufficient free space: need {} bytes, have {available}",
            request.size
        )));
    }

    progress(DownloadProgress {
        downloaded_bytes: 0,
        total_bytes: request.size,
    });
    if cancelled.load(Ordering::Acquire) {
        return Ok(DownloadOutcome::Cancelled);
    }

    let mut response = environment
        .agent
        .get(url.as_str())
        .header("Accept-Encoding", "identity")
        .call()
        .map_err(map_request_error)?;
    let content_length = response
        .headers()
        .get("content-length")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok());
    if content_length.is_some_and(|length| length > environment.max_bytes) {
        return Err(AppError::ResourceLimitExceeded(
            "release asset Content-Length exceeds the 1 GiB download limit".to_owned(),
        ));
    }

    let mut temporary = NamedTempFile::new_in(parent).map_err(|error| {
        AppError::Io(format!(
            "could not create a temporary download file: {error}"
        ))
    })?;
    let mut reader = response.body_mut().as_reader();
    let Some(downloaded) = copy_body(
        &mut reader,
        &mut temporary,
        request.size,
        environment.max_bytes,
        cancelled,
        progress,
    )?
    else {
        return Ok(DownloadOutcome::Cancelled);
    };
    if downloaded != request.size {
        return Err(AppError::Network(format!(
            "release asset size changed: expected {} bytes, received {downloaded}",
            request.size
        )));
    }
    if cancelled.load(Ordering::Acquire) {
        return Ok(DownloadOutcome::Cancelled);
    }

    commit_destination(temporary, destination, overwrite_confirmed)?;

    Ok(DownloadOutcome::Completed {
        downloaded_bytes: downloaded,
    })
}

fn prepare_destination(destination: &Path, overwrite_confirmed: bool) -> Result<&Path, AppError> {
    let parent = destination.parent().ok_or_else(|| {
        AppError::InvalidInput("download destination has no parent directory".to_owned())
    })?;
    let parent_metadata = fs::metadata(parent).map_err(|error| {
        AppError::Io(format!("could not inspect the download directory: {error}"))
    })?;
    if !parent_metadata.is_dir() {
        return Err(AppError::InvalidInput(
            "download destination parent is not a directory".to_owned(),
        ));
    }

    match inspect_destination(destination)? {
        Some(metadata) if metadata.file_type().is_symlink() => Err(AppError::Conflict(
            "download destination is a symbolic link".to_owned(),
        )),
        Some(metadata) if !metadata.is_file() => Err(AppError::Conflict(
            "download destination is not a regular file".to_owned(),
        )),
        Some(_) if !overwrite_confirmed => Err(AppError::Conflict(
            "download destination already exists".to_owned(),
        )),
        _ => Ok(parent),
    }
}

fn commit_destination(
    temporary: NamedTempFile,
    destination: &Path,
    overwrite_confirmed: bool,
) -> Result<(), AppError> {
    // Recheck the final component after the network transfer. When the native
    // dialog selected a new path, persist_noclobber prevents replacing a file
    // created while the request was in flight.
    let current = inspect_destination(destination)?;
    if current
        .as_ref()
        .is_some_and(|metadata| metadata.file_type().is_symlink())
    {
        return Err(AppError::Conflict(
            "download destination became a symbolic link".to_owned(),
        ));
    }
    match (current, overwrite_confirmed) {
        (Some(metadata), true) if metadata.is_file() => {
            temporary.persist(destination).map_err(|error| {
                AppError::Io(format!(
                    "could not replace the confirmed destination: {}",
                    error.error
                ))
            })?;
        }
        (Some(_), _) => {
            return Err(AppError::Conflict(
                "download destination appeared or changed while downloading".to_owned(),
            ));
        }
        (None, _) => {
            temporary.persist_noclobber(destination).map_err(|error| {
                AppError::Conflict(format!(
                    "download destination appeared before completion: {}",
                    error.error
                ))
            })?;
        }
    }
    Ok(())
}

fn copy_body(
    reader: &mut impl Read,
    temporary: &mut NamedTempFile,
    expected_size: u64,
    max_bytes: u64,
    cancelled: &AtomicBool,
    progress: &mut impl FnMut(DownloadProgress),
) -> Result<Option<u64>, AppError> {
    let mut buffer = vec![0_u8; CHUNK_BYTES].into_boxed_slice();
    let mut downloaded = 0_u64;
    loop {
        if cancelled.load(Ordering::Acquire) {
            return Ok(None);
        }
        let read = reader.read(&mut buffer).map_err(|error| {
            AppError::Network(format!("could not read the release asset: {error}"))
        })?;
        if read == 0 {
            break;
        }
        let next = downloaded.saturating_add(read as u64);
        if next > max_bytes {
            return Err(AppError::ResourceLimitExceeded(
                "release asset exceeds the 1 GiB download limit".to_owned(),
            ));
        }
        let chunk = buffer.get(..read).ok_or_else(|| {
            AppError::Internal("download reader returned an invalid byte count".to_owned())
        })?;
        temporary.write_all(chunk).map_err(|error| {
            AppError::Io(format!(
                "could not write the temporary download file: {error}"
            ))
        })?;
        downloaded = next;
        progress(DownloadProgress {
            downloaded_bytes: downloaded,
            total_bytes: expected_size,
        });
    }
    Ok(Some(downloaded))
}

/// Sanitizes a provider filename for use as a native save-dialog suggestion.
#[must_use]
pub fn sanitize_suggested_filename(value: &str) -> String {
    let mut sanitized = String::with_capacity(value.len().min(180));
    let mut previous_was_dot = false;
    for character in value.chars().take(180) {
        let safe = if character.is_control()
            || matches!(
                character,
                '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
            ) {
            '_'
        } else {
            character
        };
        if safe == '.' && previous_was_dot {
            sanitized.push('_');
            previous_was_dot = false;
        } else {
            sanitized.push(safe);
            previous_was_dot = safe == '.';
        }
    }
    let sanitized = sanitized.trim_matches([' ', '.']).to_owned();
    if sanitized.is_empty() {
        return "release-asset".to_owned();
    }

    let stem = sanitized
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && matches!(stem.as_bytes().get(3), Some(b'1'..=b'9')));
    if reserved {
        format!("_{sanitized}")
    } else {
        sanitized
    }
}

fn inspect_destination(path: &Path) -> Result<Option<fs::Metadata>, AppError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => Ok(Some(metadata)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(AppError::Io(format!(
            "could not inspect the download destination: {error}"
        ))),
    }
}

fn validate_download_url(raw: &str, allow_loopback_http: bool) -> Result<Url, AppError> {
    let url = Url::parse(raw)
        .map_err(|error| AppError::InvalidInput(format!("invalid asset URL: {error}")))?;
    let is_loopback_http = allow_loopback_http
        && url.scheme() == "http"
        && url.host().is_some_and(|host| match host {
            url::Host::Ipv4(address) => address.is_loopback(),
            url::Host::Ipv6(address) => address.is_loopback(),
            url::Host::Domain(domain) => domain.eq_ignore_ascii_case("localhost"),
        });
    if (url.scheme() != "https" && !is_loopback_http)
        || !url.username().is_empty()
        || url.password().is_some()
        || url.host_str().is_none()
    {
        return Err(AppError::InvalidInput(
            "asset URL must use HTTPS without embedded credentials".to_owned(),
        ));
    }
    Ok(url)
}

fn download_agent() -> Agent {
    Agent::config_builder()
        .max_redirects(0)
        .timeout_global(Some(REQUEST_TIMEOUT))
        .timeout_connect(Some(CONNECT_TIMEOUT))
        .build()
        .into()
}

fn map_request_error(error: ureq::Error) -> AppError {
    match error {
        ureq::Error::StatusCode(status) if status == StatusCode::NOT_FOUND.as_u16() => {
            AppError::NotFound
        }
        ureq::Error::StatusCode(status) => {
            AppError::Network(format!("release asset request failed with status {status}"))
        }
        error => AppError::Network(format!("could not download the release asset: {error}")),
    }
}

#[cfg(test)]
mod tests {
    use std::{
        io::{Read, Write},
        net::TcpListener,
        sync::atomic::{AtomicBool, Ordering},
        thread,
    };

    use super::{
        download_agent, download_asset_with, sanitize_suggested_filename, DownloadEnvironment,
        DownloadOutcome, DownloadProgress, DownloadRequest, MAX_DOWNLOAD_BYTES,
    };
    use crate::error::AppError;

    fn request(url: String, body_size: usize) -> DownloadRequest {
        DownloadRequest {
            url,
            file_name: "release.zip".to_owned(),
            size: body_size as u64,
        }
    }

    fn serve(
        status: &str,
        headers: &[(&str, &str)],
        body: &[u8],
    ) -> (String, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let status = status.to_owned();
        let headers = headers
            .iter()
            .map(|(name, value)| ((*name).to_owned(), (*value).to_owned()))
            .collect::<Vec<_>>();
        let body = body.to_vec();
        let thread = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request_bytes = [0_u8; 4096];
            let _ = stream.read(&mut request_bytes).unwrap();
            let mut response = format!("HTTP/1.1 {status}\r\nConnection: close\r\n");
            for (name, value) in &headers {
                response.push_str(name);
                response.push_str(": ");
                response.push_str(value);
                response.push_str("\r\n");
            }
            response.push_str("Content-Length: ");
            response.push_str(&body.len().to_string());
            response.push_str("\r\n\r\n");
            stream.write_all(response.as_bytes()).unwrap();
            stream.write_all(&body).unwrap();
            stream.flush().unwrap();
        });
        let url = format!("http://{address}/asset.zip");
        (url, thread)
    }

    fn run_test_download(
        request: &DownloadRequest,
        destination: &std::path::Path,
        overwrite_confirmed: bool,
        cancelled: &AtomicBool,
        progress: &mut impl FnMut(DownloadProgress),
        max_bytes: u64,
        available: u64,
    ) -> Result<DownloadOutcome, AppError> {
        let space_available = move |_path: &std::path::Path| Ok::<u64, AppError>(available);
        let agent = download_agent();
        let environment = DownloadEnvironment {
            max_bytes,
            space_available: &space_available,
            agent: &agent,
            allow_loopback_http: true,
        };
        download_asset_with(
            request,
            destination,
            overwrite_confirmed,
            cancelled,
            progress,
            &environment,
        )
    }

    fn temporary_files(directory: &std::path::Path) -> Vec<std::path::PathBuf> {
        std::fs::read_dir(directory)
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .filter(|path| {
                path.file_name()
                    .unwrap()
                    .to_string_lossy()
                    .starts_with(".tmp")
            })
            .collect()
    }

    #[test]
    fn normal_download_reports_progress_and_atomically_writes_exact_bytes() {
        let directory = tempfile::tempdir().unwrap();
        let body = b"asset bytes";
        let (url, server_thread) = serve("200 OK", &[], body);
        let destination = directory.path().join("release.zip");
        let mut updates = Vec::new();
        let outcome = run_test_download(
            &request(url, body.len()),
            &destination,
            false,
            &AtomicBool::new(false),
            &mut |update| updates.push(update),
            MAX_DOWNLOAD_BYTES,
            u64::MAX,
        )
        .unwrap();

        assert_eq!(
            outcome,
            DownloadOutcome::Completed {
                downloaded_bytes: 11
            }
        );
        assert_eq!(std::fs::read(destination).unwrap(), body);
        assert_eq!(updates.first().unwrap().downloaded_bytes, 0);
        assert_eq!(updates.last().unwrap().downloaded_bytes, body.len() as u64);
        assert!(temporary_files(directory.path()).is_empty());
        server_thread.join().unwrap();
    }

    #[test]
    fn api_size_content_length_and_received_bytes_each_enforce_the_cap() {
        let directory = tempfile::tempdir().unwrap();
        let destination = directory.path().join("release.zip");
        let oversized = DownloadRequest {
            url: "https://api.github.com/asset".to_owned(),
            file_name: "release.zip".to_owned(),
            size: 5,
        };
        let error = run_test_download(
            &oversized,
            &destination,
            false,
            &AtomicBool::new(false),
            &mut |_| {},
            4,
            u64::MAX,
        )
        .unwrap_err();
        assert!(matches!(error, AppError::ResourceLimitExceeded(_)));

        let (url, server_thread) = serve("200 OK", &[], b"12345");
        let over_length = request(url, 3);
        // The server helper supplies Content-Length from its body.
        let error = run_test_download(
            &over_length,
            &destination,
            false,
            &AtomicBool::new(false),
            &mut |_| {},
            4,
            u64::MAX,
        )
        .unwrap_err();
        assert!(matches!(error, AppError::ResourceLimitExceeded(_)));
        assert!(!destination.exists());
        server_thread.join().unwrap();

        let mut temporary = tempfile::NamedTempFile::new_in(directory.path()).unwrap();
        let mut body = std::io::Cursor::new(b"12345");
        let error = super::copy_body(
            &mut body,
            &mut temporary,
            3,
            4,
            &AtomicBool::new(false),
            &mut |_| {},
        )
        .unwrap_err();
        assert!(matches!(error, AppError::ResourceLimitExceeded(_)));
        assert!(!destination.exists());
        drop(temporary);
        assert!(temporary_files(directory.path()).is_empty());
    }

    #[test]
    fn insufficient_space_and_unconfirmed_existing_destination_do_not_request_or_write() {
        let directory = tempfile::tempdir().unwrap();
        let destination = directory.path().join("release.zip");
        let error = run_test_download(
            &request("http://127.0.0.1:1/asset".to_owned(), 5),
            &destination,
            false,
            &AtomicBool::new(false),
            &mut |_| {},
            MAX_DOWNLOAD_BYTES,
            4,
        )
        .unwrap_err();
        assert!(matches!(error, AppError::ResourceLimitExceeded(_)));
        assert!(!destination.exists());

        std::fs::write(&destination, b"keep me").unwrap();
        let error = run_test_download(
            &request("http://127.0.0.1:1/asset".to_owned(), 5),
            &destination,
            false,
            &AtomicBool::new(false),
            &mut |_| {},
            MAX_DOWNLOAD_BYTES,
            u64::MAX,
        )
        .unwrap_err();
        assert!(matches!(error, AppError::Conflict(_)));
        assert_eq!(std::fs::read(&destination).unwrap(), b"keep me");
    }

    #[test]
    fn cancellation_and_a_path_appearing_during_download_leave_no_partial_file() {
        let directory = tempfile::tempdir().unwrap();
        let destination = directory.path().join("release.zip");
        let (url, server_thread) = serve("200 OK", &[], b"asset");
        let cancellation = AtomicBool::new(false);
        let outcome = run_test_download(
            &request(url, 5),
            &destination,
            false,
            &cancellation,
            &mut |update| {
                if update.downloaded_bytes > 0 {
                    cancellation.store(true, Ordering::Release);
                }
            },
            MAX_DOWNLOAD_BYTES,
            u64::MAX,
        )
        .unwrap();
        assert_eq!(outcome, DownloadOutcome::Cancelled);
        assert!(!destination.exists());
        assert!(temporary_files(directory.path()).is_empty());
        server_thread.join().unwrap();

        let (url, server_thread) = serve("200 OK", &[], b"asset");
        let appeared = destination.clone();
        let error = run_test_download(
            &request(url, 5),
            &destination,
            false,
            &AtomicBool::new(false),
            &mut |update| {
                if update.downloaded_bytes > 0 {
                    std::fs::write(&appeared, b"created after selection").unwrap();
                }
            },
            MAX_DOWNLOAD_BYTES,
            u64::MAX,
        )
        .unwrap_err();
        assert!(matches!(error, AppError::Conflict(_)));
        assert_eq!(
            std::fs::read(&destination).unwrap(),
            b"created after selection"
        );
        assert!(temporary_files(directory.path()).is_empty());
        server_thread.join().unwrap();
    }

    #[test]
    fn confirmed_regular_destinations_can_be_replaced_but_symlinks_are_refused() {
        let directory = tempfile::tempdir().unwrap();
        let destination = directory.path().join("release.zip");
        std::fs::write(&destination, b"old").unwrap();
        let (url, server_thread) = serve("200 OK", &[], b"new");
        let outcome = run_test_download(
            &request(url, 3),
            &destination,
            true,
            &AtomicBool::new(false),
            &mut |_| {},
            MAX_DOWNLOAD_BYTES,
            u64::MAX,
        )
        .unwrap();
        assert_eq!(
            outcome,
            DownloadOutcome::Completed {
                downloaded_bytes: 3
            }
        );
        assert_eq!(std::fs::read(&destination).unwrap(), b"new");
        server_thread.join().unwrap();

        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            let target = directory.path().join("target");
            std::fs::write(&target, b"target").unwrap();
            let link = directory.path().join("link");
            symlink(&target, &link).unwrap();
            let error = run_test_download(
                &request("http://127.0.0.1:1/asset".to_owned(), 4),
                &link,
                true,
                &AtomicBool::new(false),
                &mut |_| {},
                MAX_DOWNLOAD_BYTES,
                u64::MAX,
            )
            .unwrap_err();
            assert!(matches!(error, AppError::Conflict(_)));
            assert_eq!(std::fs::read(&target).unwrap(), b"target");
        }
    }

    #[test]
    fn filename_sanitization_handles_traversal_windows_names_and_length() {
        assert_eq!(
            sanitize_suggested_filename("../folder\\x.zip"),
            "__folder_x.zip"
        );
        assert_eq!(sanitize_suggested_filename("CON.txt"), "_CON.txt");
        assert_eq!(sanitize_suggested_filename("   "), "release-asset");
        assert!(sanitize_suggested_filename(&"a".repeat(500)).len() <= 180);
    }
}
