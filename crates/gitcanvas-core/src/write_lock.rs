//! Process-local serialization for writes that share a Git common directory.

use std::{
    collections::HashMap,
    sync::{Arc, Condvar, Mutex, OnceLock, Weak},
    time::{Duration, Instant},
};

use crate::{error::AppError, repository::ActiveRepo};

#[cfg(not(any(unix, windows)))]
use std::path::PathBuf;

#[derive(Debug, Clone, Hash, PartialEq, Eq)]
enum CommonDirectoryKey {
    #[cfg(unix)]
    File { device: u64, inode: u64 },
    #[cfg(windows)]
    Path(String),
    #[cfg(not(any(unix, windows)))]
    Path(PathBuf),
}

const WRITE_LOCK_TIMEOUT: Duration = Duration::from_secs(2);

struct LockState {
    held: bool,
}

struct CommonDirectoryLock {
    state: Mutex<LockState>,
    changed: Condvar,
}

impl CommonDirectoryLock {
    fn new() -> Self {
        Self {
            state: Mutex::new(LockState { held: false }),
            changed: Condvar::new(),
        }
    }
}

struct WritePermit(Arc<CommonDirectoryLock>);

impl Drop for WritePermit {
    fn drop(&mut self) {
        if let Ok(mut state) = self.0.state.lock() {
            state.held = false;
            self.0.changed.notify_one();
        }
    }
}

fn lock_table() -> &'static Mutex<HashMap<CommonDirectoryKey, Weak<CommonDirectoryLock>>> {
    static LOCKS: OnceLock<Mutex<HashMap<CommonDirectoryKey, Weak<CommonDirectoryLock>>>> =
        OnceLock::new();
    LOCKS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn common_directory(repo: &ActiveRepo) -> Result<CommonDirectoryKey, AppError> {
    let path = repo.open()?.commondir().canonicalize()?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;

        let metadata = std::fs::metadata(path)?;
        Ok(CommonDirectoryKey::File {
            device: metadata.dev(),
            inode: metadata.ino(),
        })
    }
    #[cfg(windows)]
    {
        let path = path.to_string_lossy().to_lowercase();
        Ok(CommonDirectoryKey::Path(path))
    }
    #[cfg(not(any(unix, windows)))]
    {
        Ok(CommonDirectoryKey::Path(path))
    }
}

fn shared_lock(path: &CommonDirectoryKey) -> Result<Arc<CommonDirectoryLock>, AppError> {
    let mut locks = lock_table()
        .lock()
        .map_err(|_| AppError::Internal("repository write-lock table was poisoned".into()))?;
    locks.retain(|_, lock| lock.strong_count() > 0);
    if let Some(lock) = locks.get(path).and_then(Weak::upgrade) {
        return Ok(lock);
    }
    let lock = Arc::new(CommonDirectoryLock::new());
    locks.insert(path.clone(), Arc::downgrade(&lock));
    Ok(lock)
}

fn acquire(repo: &ActiveRepo) -> Result<WritePermit, AppError> {
    let key = common_directory(repo)?;
    let lock = shared_lock(&key)?;
    let poisoned = || AppError::Internal("repository write lock was poisoned".into());
    let mut state = lock.state.lock().map_err(|_| poisoned())?;
    let deadline = Instant::now()
        .checked_add(WRITE_LOCK_TIMEOUT)
        .ok_or_else(|| {
            AppError::ResourceLimitExceeded(
                "the repository write-lock timeout is not representable".into(),
            )
        })?;

    while state.held {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err(repository_busy());
        }
        let (next, timeout) = lock
            .changed
            .wait_timeout(state, remaining)
            .map_err(|_| poisoned())?;
        state = next;
        if timeout.timed_out() && state.held {
            return Err(repository_busy());
        }
    }

    state.held = true;
    drop(state);
    Ok(WritePermit(lock))
}

fn repository_busy() -> AppError {
    AppError::RepositoryBusy(
        "another Git write is still using this repository; try again shortly".into(),
    )
}

/// Runs a Git write while holding the process-local lock for the repository's
/// canonical Git common directory. Linked worktrees therefore share one lock.
/// The lock is released on return, error, or unwinding.
///
/// # Errors
/// Returns [`AppError::RepositoryBusy`] when another write holds the lock for
/// more than two seconds, or an internal/filesystem error if the lock cannot be
/// established.
pub fn with_repository_write_lock<T>(
    repo: &ActiveRepo,
    operation: impl FnOnce() -> Result<T, AppError>,
) -> Result<T, AppError> {
    let _permit = acquire(repo)?;
    operation()
}

#[cfg(test)]
mod tests {
    use std::{
        panic::{catch_unwind, AssertUnwindSafe},
        sync::{
            atomic::{AtomicBool, Ordering},
            mpsc,
        },
        thread,
    };

    use git2::{Repository, Signature, WorktreeAddOptions};
    use tempfile::TempDir;

    use super::{acquire, common_directory, with_repository_write_lock};
    use crate::{error::AppError, repository::ActiveRepo};

    struct Repositories {
        _main_dir: TempDir,
        _linked_parent: TempDir,
        main: ActiveRepo,
        linked: ActiveRepo,
    }

    fn repositories() -> Repositories {
        let main_dir = tempfile::tempdir().unwrap();
        let repository = Repository::init(main_dir.path()).unwrap();
        let signature = Signature::now("Test Author", "test@example.com").unwrap();
        let tree_id = repository.treebuilder(None).unwrap().write().unwrap();
        let tree = repository.find_tree(tree_id).unwrap();
        let commit = repository
            .commit(Some("HEAD"), &signature, &signature, "initial", &tree, &[])
            .unwrap();
        repository
            .branch("linked", &repository.find_commit(commit).unwrap(), false)
            .unwrap();

        let linked_parent = tempfile::tempdir().unwrap();
        let linked_path = linked_parent.path().join("linked");
        let mut options = WorktreeAddOptions::new();
        options.checkout_existing(true);
        repository
            .worktree("linked", &linked_path, Some(&options))
            .unwrap();

        Repositories {
            main: ActiveRepo::validate(main_dir.path()).unwrap(),
            linked: ActiveRepo::validate(linked_path).unwrap(),
            _main_dir: main_dir,
            _linked_parent: linked_parent,
        }
    }

    #[test]
    fn linked_worktrees_share_one_lock_and_writes_serialize() {
        let repositories = repositories();
        assert_eq!(
            common_directory(&repositories.main).unwrap(),
            common_directory(&repositories.linked).unwrap()
        );

        let permit = acquire(&repositories.main).unwrap();
        let (sender, receiver) = mpsc::channel();
        let linked = repositories.linked;
        let worker = thread::spawn(move || {
            let result = with_repository_write_lock(&linked, || Ok(()));
            let _ = sender.send(result);
        });
        assert!(receiver
            .recv_timeout(std::time::Duration::from_millis(100))
            .is_err());

        drop(permit);
        receiver
            .recv_timeout(std::time::Duration::from_secs(5))
            .unwrap()
            .unwrap();
        worker.join().unwrap();
    }

    #[test]
    fn a_busy_repository_times_out_without_running_the_write() {
        let repositories = repositories();
        let permit = acquire(&repositories.main).unwrap();
        let called = AtomicBool::new(false);
        let started = std::time::Instant::now();
        let error = with_repository_write_lock(&repositories.linked, || {
            called.store(true, Ordering::SeqCst);
            Ok(())
        })
        .unwrap_err();

        assert!(matches!(error, AppError::RepositoryBusy(_)));
        assert!(!called.load(Ordering::SeqCst));
        assert!(started.elapsed() >= std::time::Duration::from_secs(2));

        drop(permit);
        with_repository_write_lock(&repositories.linked, || {
            called.store(true, Ordering::SeqCst);
            Ok(())
        })
        .unwrap();
        assert!(called.load(Ordering::SeqCst));
    }

    #[test]
    fn the_lock_is_released_after_error_and_panic() {
        let repositories = repositories();
        let error: Result<(), AppError> = with_repository_write_lock(&repositories.main, || {
            Err(AppError::Internal("fixture failure".into()))
        });
        assert!(matches!(error, Err(AppError::Internal(_))));

        let panic = catch_unwind(AssertUnwindSafe(|| {
            let _ = with_repository_write_lock(&repositories.linked, || -> Result<(), AppError> {
                panic!("fixture panic while holding the repository lock");
            });
        }));
        assert!(panic.is_err());

        with_repository_write_lock(&repositories.main, || Ok(())).unwrap();
    }
}
