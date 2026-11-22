//! Authorized IPC commands for release metadata and explicit tag fetches.

use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};

use gitcanvas_core::{
    error::AppError,
    fetch::{self, FetchTagOutcome},
    refs::TagInfo,
    releases::{
        self,
        download::{DownloadOutcome, DownloadProgress},
        ReleaseAssetList, ReleaseList, ReleaseSource,
    },
    write_lock::with_repository_write_lock,
};
use serde::Serialize;
use specta::Type;

use super::{
    repo_access::{with_repo, AllowedRepos},
    runtime::{read, transfer, write},
};

/// Application data location used by the independent release metadata cache.
#[derive(Clone)]
pub struct ReleaseDataRoot(pub PathBuf);

type SaveDialogCallback = dyn Fn(&str) -> Result<Option<PathBuf>, AppError> + Send + Sync;

/// Rust-owned native save-dialog capability, injected by application setup.
pub struct SaveDialog(pub Arc<SaveDialogCallback>);

/// IPC representation of one release; provider IDs remain exact decimal strings in JavaScript.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct ReleaseInfoIpc {
    pub id: String,
    pub tag_name: String,
    pub name: Option<String>,
    pub notes: String,
    pub html_url: Option<String>,
    pub prerelease: bool,
    pub published_at: Option<String>,
}

/// One release or unmatched local tag in the IPC response.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ReleaseListEntryIpc {
    Release {
        release: ReleaseInfoIpc,
        local_tag: Option<TagInfo>,
    },
    LocalTag {
        tag: TagInfo,
    },
}

/// Typed Tauri payload for release metadata, separate from the persisted cache model.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct ReleaseListIpc {
    pub source: ReleaseSource,
    pub entries: Vec<ReleaseListEntryIpc>,
    pub truncated: bool,
    pub local_tags_available: bool,
    pub cached_at: Option<String>,
    pub rate_limit_reset: Option<String>,
}

/// Descriptor returned by the metadata-only release asset query.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct ReleaseAssetInfoIpc {
    pub id: String,
    pub name: String,
    pub size: String,
    pub sha256: Option<String>,
}

/// Bounded asset descriptors for one published release.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct ReleaseAssetListIpc {
    pub source: ReleaseSource,
    pub release_id: String,
    pub assets: Vec<ReleaseAssetInfoIpc>,
    pub truncated: bool,
}

impl From<ReleaseAssetList> for ReleaseAssetListIpc {
    fn from(list: ReleaseAssetList) -> Self {
        Self {
            source: list.source,
            release_id: list.release_id.to_string(),
            assets: list
                .assets
                .into_iter()
                .map(|asset| ReleaseAssetInfoIpc {
                    id: asset.id.to_string(),
                    name: asset.name,
                    size: asset.size.to_string(),
                    sha256: asset.sha256,
                })
                .collect(),
            truncated: list.truncated,
        }
    }
}

/// Download outcome serialized without JavaScript-unsafe integer fields.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DownloadOutcomeIpc {
    Completed { downloaded_bytes: String },
    Cancelled,
}

impl From<DownloadOutcome> for DownloadOutcomeIpc {
    fn from(outcome: DownloadOutcome) -> Self {
        match outcome {
            DownloadOutcome::Completed { downloaded_bytes } => Self::Completed {
                downloaded_bytes: downloaded_bytes.to_string(),
            },
            DownloadOutcome::Cancelled => Self::Cancelled,
        }
    }
}

/// Bounded transfer progress event delivered to the interface.
#[derive(Debug, Clone, Serialize, Type, tauri_specta::Event)]
pub struct ReleaseDownloadProgressEvent {
    pub transfer_id: String,
    pub downloaded_bytes: String,
    pub total_bytes: String,
}

#[derive(Clone)]
pub struct DownloadProgressEmitter(pub Arc<dyn Fn(ReleaseDownloadProgressEvent) + Send + Sync>);

struct TransferGuard {
    registry: ActiveTransfers,
    transfer_id: String,
}

impl Drop for TransferGuard {
    fn drop(&mut self) {
        let _removed = self.registry.finish(&self.transfer_id);
    }
}

struct ProgressThrottle {
    last: Option<Instant>,
}

impl ProgressThrottle {
    fn admit(&mut self, now: Instant, complete: bool) -> bool {
        if self
            .last
            .is_none_or(|last| now.saturating_duration_since(last) >= Duration::from_millis(100))
            || complete
        {
            self.last = Some(now);
            true
        } else {
            false
        }
    }
}

fn parse_canonical_id(value: &str, label: &str) -> Result<u64, AppError> {
    if value.is_empty()
        || value.starts_with('0')
        || !value.bytes().all(|byte| byte.is_ascii_digit())
    {
        return Err(AppError::InvalidInput(format!(
            "{label} must be a positive canonical decimal ID"
        )));
    }
    value
        .parse::<u64>()
        .map_err(|_| AppError::InvalidInput(format!("{label} exceeds the supported ID range")))
}

impl From<ReleaseList> for ReleaseListIpc {
    fn from(list: ReleaseList) -> Self {
        let entries = list
            .entries
            .into_iter()
            .map(|entry| match entry {
                gitcanvas_core::releases::ReleaseListEntry::Release { release, local_tag } => {
                    ReleaseListEntryIpc::Release {
                        release: ReleaseInfoIpc {
                            id: release.id.to_string(),
                            tag_name: release.tag_name,
                            name: release.name,
                            notes: release.notes,
                            html_url: release.html_url,
                            prerelease: release.prerelease,
                            published_at: release.published_at,
                        },
                        local_tag,
                    }
                }
                gitcanvas_core::releases::ReleaseListEntry::LocalTag { tag } => {
                    ReleaseListEntryIpc::LocalTag { tag }
                }
            })
            .collect();
        Self {
            source: list.source,
            entries,
            truncated: list.truncated,
            local_tags_available: list.local_tags_available,
            cached_at: list.cached_at,
            rate_limit_reset: list.rate_limit_reset,
        }
    }
}

#[derive(Default, Clone)]
pub struct ActiveTransfers(Arc<Mutex<HashMap<String, ActiveTransfer>>>);

#[derive(Clone)]
struct ActiveTransfer {
    repository: PathBuf,
    cancelled: Arc<AtomicBool>,
}

impl ActiveTransfers {
    pub(crate) fn register(
        &self,
        repository: &std::path::Path,
        transfer_id: String,
    ) -> Result<Arc<AtomicBool>, AppError> {
        validate_transfer_id(&transfer_id)?;
        let mut transfers = self
            .0
            .lock()
            .map_err(|_| AppError::Internal("release transfer registry was poisoned".into()))?;
        if transfers.contains_key(&transfer_id) {
            return Err(AppError::Conflict(
                "a release transfer with this identifier is already active".into(),
            ));
        }
        let cancelled = Arc::new(AtomicBool::new(false));
        transfers.insert(
            transfer_id,
            ActiveTransfer {
                repository: repository.to_path_buf(),
                cancelled: Arc::clone(&cancelled),
            },
        );
        Ok(cancelled)
    }

    pub(crate) fn finish(&self, transfer_id: &str) -> Result<(), AppError> {
        self.0
            .lock()
            .map_err(|_| AppError::Internal("release transfer registry was poisoned".into()))?
            .remove(transfer_id);
        Ok(())
    }

    fn cancel(&self, repository: &PathBuf, transfer_id: &str) -> Result<bool, AppError> {
        let transfers = self
            .0
            .lock()
            .map_err(|_| AppError::Internal("release transfer registry was poisoned".into()))?;
        let Some(transfer) = transfers.get(transfer_id) else {
            return Ok(false);
        };
        if transfer.repository != *repository {
            return Ok(false);
        }
        transfer.cancelled.store(true, Ordering::Release);
        Ok(true)
    }
}

fn validate_transfer_id(transfer_id: &str) -> Result<(), AppError> {
    if transfer_id.is_empty()
        || transfer_id.len() > 128
        || !transfer_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err(AppError::InvalidInput(
            "release transfer identifier is invalid".into(),
        ));
    }
    Ok(())
}

/// Queries release metadata through the independent network-transfer gate.
#[tauri::command]
#[specta::specta]
pub async fn get_releases(
    path: String,
    allowed: tauri::State<'_, AllowedRepos>,
    data_root: tauri::State<'_, ReleaseDataRoot>,
) -> Result<ReleaseListIpc, AppError> {
    let allowed = allowed.inner().clone();
    let data_root = data_root.0.clone();
    let active = with_repo(&allowed, &path, |active| Ok(active.clone()))?;
    transfer("get_releases", move || {
        releases::get_releases(&active, &data_root).map(ReleaseListIpc::from)
    })
    .await
}

/// Reads the release cache on the normal, retryable read gate without network access.
#[tauri::command]
#[specta::specta]
pub async fn get_cached_releases(
    path: String,
    allowed: tauri::State<'_, AllowedRepos>,
    data_root: tauri::State<'_, ReleaseDataRoot>,
) -> Result<Option<ReleaseListIpc>, AppError> {
    let allowed = allowed.inner().clone();
    let data_root = data_root.0.clone();
    read("get_cached_releases", move || {
        with_repo(&allowed, &path, |active| {
            releases::get_cached_releases(active, &data_root)
                .map(|list| list.map(ReleaseListIpc::from))
        })
    })
    .await
}

/// Discovers fresh metadata for assets belonging to one published release.
#[tauri::command]
#[specta::specta]
pub async fn get_release_assets(
    path: String,
    release_id: String,
    allowed: tauri::State<'_, AllowedRepos>,
) -> Result<ReleaseAssetListIpc, AppError> {
    let release_id = parse_canonical_id(&release_id, "release ID")?;
    let allowed = allowed.inner().clone();
    let active = with_repo(&allowed, &path, |active| Ok(active.clone()))?;
    transfer("get_release_assets", move || {
        releases::get_release_assets(&active, release_id).map(ReleaseAssetListIpc::from)
    })
    .await
}

/// Fetches one selected tag under the write gate and common-directory lock.
#[tauri::command]
#[specta::specta]
pub async fn fetch_tag(
    path: String,
    tag_name: String,
    allowed: tauri::State<'_, AllowedRepos>,
) -> Result<FetchTagOutcome, AppError> {
    let allowed = allowed.inner().clone();
    write("fetch_tag", move || {
        with_repo(&allowed, &path, |active| {
            with_repository_write_lock(active, || fetch::fetch_tag(active, &tag_name))
        })
    })
    .await
}

/// Resolves fresh asset metadata, prompts in Rust, then downloads under one transfer permit.
#[tauri::command]
#[specta::specta]
#[allow(
    clippy::too_many_arguments,
    reason = "Tauri injects the IPC command capabilities separately"
)]
pub async fn download_release_asset(
    path: String,
    release_id: String,
    asset_id: String,
    transfer_id: String,
    allowed: tauri::State<'_, AllowedRepos>,
    transfers: tauri::State<'_, ActiveTransfers>,
    emitter: tauri::State<'_, DownloadProgressEmitter>,
    dialog: tauri::State<'_, SaveDialog>,
) -> Result<DownloadOutcomeIpc, AppError> {
    let release_id = parse_canonical_id(&release_id, "release ID")?;
    let asset_id = parse_canonical_id(&asset_id, "asset ID")?;
    validate_transfer_id(&transfer_id)?;
    let allowed = allowed.inner().clone();
    let active = with_repo(&allowed, &path, |active| Ok(active.clone()))?;
    let transfers = transfers.inner().clone();
    let choose_destination = Arc::clone(&dialog.0);
    let cancelled = transfers.register(active.path(), transfer_id.clone())?;
    let _guard = TransferGuard {
        registry: transfers,
        transfer_id: transfer_id.clone(),
    };
    let publish = Arc::clone(&emitter.0);
    transfer("download_release_asset", move || {
        if cancelled.load(Ordering::Acquire) {
            return Ok(DownloadOutcomeIpc::Cancelled);
        }
        let (_asset, request) = releases::resolve_release_asset(&active, release_id, asset_id)?;
        if cancelled.load(Ordering::Acquire) {
            return Ok(DownloadOutcomeIpc::Cancelled);
        }
        let suggested_name =
            gitcanvas_core::releases::download::sanitize_suggested_filename(&request.file_name);
        let Some(destination) = choose_destination(&suggested_name)? else {
            return Ok(DownloadOutcomeIpc::Cancelled);
        };
        if cancelled.load(Ordering::Acquire) {
            return Ok(DownloadOutcomeIpc::Cancelled);
        }
        let mut throttle = ProgressThrottle { last: None };
        let outcome = gitcanvas_core::releases::download::download_asset_from_stored_token(
            &request,
            &destination,
            true,
            &cancelled,
            |update: DownloadProgress| {
                if throttle.admit(
                    Instant::now(),
                    update.downloaded_bytes >= update.total_bytes,
                ) {
                    publish(ReleaseDownloadProgressEvent {
                        transfer_id: transfer_id.clone(),
                        downloaded_bytes: update.downloaded_bytes.to_string(),
                        total_bytes: update.total_bytes.to_string(),
                    });
                }
            },
        )?;
        Ok(DownloadOutcomeIpc::from(outcome))
    })
    .await
}

/// Requests cancellation without waiting for any runtime gate.
#[tauri::command]
#[specta::specta]
pub async fn cancel_transfer(
    path: String,
    transfer_id: String,
    allowed: tauri::State<'_, AllowedRepos>,
    transfers: tauri::State<'_, ActiveTransfers>,
) -> Result<bool, AppError> {
    with_repo(allowed.inner(), &path, |active| {
        validate_transfer_id(&transfer_id)?;
        transfers.cancel(&active.path().to_path_buf(), &transfer_id)
    })
}

#[cfg(test)]
mod tests {
    use std::time::{Duration, Instant};

    use std::sync::atomic::Ordering;

    use super::{
        parse_canonical_id, ActiveTransfers, ProgressThrottle, ReleaseAssetInfoIpc, ReleaseInfoIpc,
    };

    #[test]
    fn canonical_ids_preserve_u64_and_reject_noncanonical_values() {
        for value in [
            "0",
            "00",
            "01",
            "+1",
            "-1",
            " 1",
            "1 ",
            "18446744073709551616",
        ] {
            assert!(
                parse_canonical_id(value, "ID").is_err(),
                "accepted {value:?}"
            );
        }
        assert_eq!(
            parse_canonical_id("9007199254740993", "ID").unwrap(),
            9_007_199_254_740_993
        );
        assert_eq!(
            parse_canonical_id("18446744073709551615", "ID").unwrap(),
            u64::MAX
        );
    }

    #[test]
    fn ipc_release_and_asset_ids_serialize_as_exact_decimal_strings() {
        let release = ReleaseInfoIpc {
            id: u64::MAX.to_string(),
            tag_name: "v1".into(),
            name: None,
            notes: String::new(),
            html_url: None,
            prerelease: false,
            published_at: None,
        };
        let asset = ReleaseAssetInfoIpc {
            id: "9007199254740993".into(),
            name: "archive.zip".into(),
            size: u64::MAX.to_string(),
            sha256: None,
        };
        assert_eq!(
            serde_json::to_value(release).unwrap()["id"],
            u64::MAX.to_string()
        );
        let asset_json = serde_json::to_value(asset).unwrap();
        assert_eq!(asset_json["id"], "9007199254740993");
        assert_eq!(asset_json["size"], u64::MAX.to_string());
    }

    #[test]
    fn progress_events_are_throttled_but_completion_is_always_published() {
        let start = Instant::now();
        let mut throttle = ProgressThrottle { last: None };
        assert!(throttle.admit(start, false));
        assert!(!throttle.admit(start + Duration::from_millis(99), false));
        assert!(throttle.admit(start + Duration::from_millis(100), false));
        assert!(throttle.admit(start + Duration::from_millis(101), true));
    }

    #[test]
    fn cancellation_is_repository_scoped_and_does_not_wait_for_transfer_work() {
        let transfers = ActiveTransfers::default();
        let first_repo = std::path::PathBuf::from("/repo/one");
        let other_repo = std::path::PathBuf::from("/repo/two");
        let cancelled = transfers
            .register(&first_repo, "download-1".to_owned())
            .unwrap();

        assert!(!transfers.cancel(&other_repo, "download-1").unwrap());
        assert!(!cancelled.load(Ordering::Acquire));
        assert!(transfers.cancel(&first_repo, "download-1").unwrap());
        assert!(cancelled.load(Ordering::Acquire));
        transfers.finish("download-1").unwrap();
        assert!(!transfers.cancel(&first_repo, "download-1").unwrap());
    }
}
