//! Repository commands. Each request carries its repository identity so an older
//! in-flight request cannot accidentally read a newly selected repository.

use std::sync::{Condvar, Mutex, OnceLock};

use gitcanvas_core::{
    error::AppError,
    history::{HistoryPage, HistoryReader, HistoryRequest},
    refs::{self, BranchInfo, TagInfo},
    repository::{ActiveRepo, RepositoryInfo},
};

const MAX_CONCURRENT_GIT_OPERATIONS: usize = 2;

struct GitOperationGate {
    available: Mutex<usize>,
    changed: Condvar,
}

impl GitOperationGate {
    fn acquire(&self) -> Result<GitOperationPermit<'_>, AppError> {
        let mut available = self
            .available
            .lock()
            .map_err(|_| AppError::Internal("git operation gate was poisoned".to_owned()))?;
        while *available == 0 {
            available = self
                .changed
                .wait(available)
                .map_err(|_| AppError::Internal("git operation gate was poisoned".to_owned()))?;
        }
        *available -= 1;
        Ok(GitOperationPermit { gate: self })
    }
}

struct GitOperationPermit<'a> {
    gate: &'a GitOperationGate,
}

impl Drop for GitOperationPermit<'_> {
    fn drop(&mut self) {
        if let Ok(mut available) = self.gate.available.lock() {
            *available += 1;
            self.gate.changed.notify_one();
        }
    }
}

static GIT_OPERATION_GATE: OnceLock<GitOperationGate> = OnceLock::new();

fn git_operation_gate() -> &'static GitOperationGate {
    GIT_OPERATION_GATE.get_or_init(|| GitOperationGate {
        available: Mutex::new(MAX_CONCURRENT_GIT_OPERATIONS),
        changed: Condvar::new(),
    })
}

fn is_emfile(error: &AppError) -> bool {
    let msg = error.to_string();
    msg.contains("Too many open files") || msg.contains("os error 24") || msg.contains("EMFILE")
}

/// Runs blocking domain work away from the event loop and translates join errors.
pub(crate) async fn blocking<T: Send + 'static>(
    operation: &'static str,
    mut work: impl FnMut() -> Result<T, AppError> + Send + 'static,
) -> Result<T, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        // libgit2 can retain object and pack descriptors for the lifetime of a
        // Repository handle. Bound simultaneous Git work so a burst of IPC
        // queries cannot exhaust the process-wide descriptor budget.
        let _permit = git_operation_gate().acquire()?;
        let start = std::time::Instant::now();
        let mut attempts = 0u32;
        loop {
            let result = work();
            if let Err(ref error) = result {
                if is_emfile(error) && attempts < 3 {
                    attempts += 1;
                    std::thread::sleep(std::time::Duration::from_millis(50 * (1 << attempts)));
                    continue;
                }
            }
            tracing::info!(
                operation,
                elapsed_ms = %start.elapsed().as_millis(),
                success = result.is_ok(),
                attempts = attempts + 1,
                "domain operation completed"
            );
            return result;
        }
    })
    .await
    .map_err(|error| AppError::Internal(error.to_string()))?
}

/// Validates and opens a local repository, returning its canonical identity.
#[tauri::command]
#[specta::specta]
pub async fn open_repository(path: String) -> Result<RepositoryInfo, AppError> {
    blocking("open_repository", move || {
        ActiveRepo::validate(&path)?.info()
    })
    .await
}

/// Checks a candidate working-tree root without changing application selection.
#[tauri::command]
#[specta::specta]
pub async fn validate_repository(path: String) -> Result<RepositoryInfo, AppError> {
    blocking("validate_repository", move || {
        ActiveRepo::validate(&path)?.info()
    })
    .await
}

/// Reads a bounded history page using the selected repository's canonical path.
#[tauri::command]
#[specta::specta]
pub async fn get_commits(
    path: String,
    request: HistoryRequest,
    reader: tauri::State<'_, std::sync::Arc<HistoryReader>>,
) -> Result<HistoryPage, AppError> {
    let reader = std::sync::Arc::clone(reader.inner());
    blocking("get_commits", move || {
        reader.get_commits(&ActiveRepo::validate(&path)?, &request)
    })
    .await
}

/// Lists local and remote branches and identifies the current branch.
#[tauri::command]
#[specta::specta]
pub async fn get_branches(path: String) -> Result<Vec<BranchInfo>, AppError> {
    blocking("get_branches", move || {
        refs::get_branches(&ActiveRepo::validate(&path)?)
    })
    .await
}

/// Lists tags, peeling annotated tags to commits when applicable.
#[tauri::command]
#[specta::specta]
pub async fn get_tags(path: String) -> Result<Vec<TagInfo>, AppError> {
    blocking("get_tags", move || {
        refs::get_tags(&ActiveRepo::validate(&path)?)
    })
    .await
}

/// The repository named on the command line, if the application was launched
/// with one.
///
/// `gitcanvas /path/to/repo` is what a terminal user expects of a Git client,
/// and it is also what lets the end-to-end suite open a repository without a
/// native file dialog.
///
/// Every argument is scanned rather than only the first: a launcher may put its
/// own flags ahead of the user's path, which is exactly what the WebDriver
/// harness does. The first argument that both looks like a path and validates
/// as a repository wins; an argument that is not one is skipped rather than
/// reported, because it probably belongs to the runtime.
///
/// `GITCANVAS_REPOSITORY` does the same thing for environments where passing
/// arguments is awkward.
#[tauri::command]
#[specta::specta]
pub async fn get_startup_repository() -> Result<Option<RepositoryInfo>, AppError> {
    blocking("get_startup_repository", || {
        let from_env = std::env::var("GITCANVAS_REPOSITORY").ok();
        let candidates = from_env
            .into_iter()
            .chain(std::env::args().skip(1))
            .filter(|argument| !argument.starts_with('-'));

        for candidate in candidates {
            if let Ok(repo) = ActiveRepo::validate(&candidate) {
                return repo.info().map(Some);
            }
        }
        Ok(None)
    })
    .await
}
