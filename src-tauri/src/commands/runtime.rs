//! Running blocking git work away from the event loop.
//!
//! libgit2 is synchronous, so every command hands its work to a blocking
//! thread. Two things are decided here rather than in each command:
//!
//! - **How much runs at once.** libgit2 can hold object and pack descriptors for
//!   as long as a `Repository` lives, so a burst of queries could exhaust the
//!   process's descriptor budget. Reads, writes and long transfers use separate
//!   gates so a remote operation cannot starve history queries or ordinary Git
//!   writes.
//! - **What may be repeated.** Reads and watcher setup are idempotent, so a
//!   transient failure is retried with backoff. A write — checkout, pull, push,
//!   clone, a keychain change — runs exactly once: repeating it after a
//!   partial failure could apply it twice.

use std::{
    sync::{Condvar, Mutex, OnceLock},
    time::{Duration, Instant},
};

use gitcanvas_core::{error::AppError, retry::retry_transient};

const MAX_CONCURRENT_READS: usize = 2;
const MAX_CONCURRENT_WRITES: usize = 2;
const MAX_CONCURRENT_TRANSFERS: usize = 2;
const READ_RETRIES: u32 = 3;
const READ_BACKOFF: Duration = Duration::from_millis(100);
const OPERATION_GATE_TIMEOUT: Duration = Duration::from_secs(30);

/// A counting gate: at most `capacity` permits are out at any time.
struct Gate {
    available: Mutex<usize>,
    changed: Condvar,
    wait_timeout: Duration,
}

impl Gate {
    const fn new(capacity: usize) -> Self {
        Self {
            available: Mutex::new(capacity),
            changed: Condvar::new(),
            wait_timeout: OPERATION_GATE_TIMEOUT,
        }
    }

    #[cfg(test)]
    fn with_wait_timeout(capacity: usize, wait_timeout: Duration) -> Self {
        Self {
            available: Mutex::new(capacity),
            changed: Condvar::new(),
            wait_timeout,
        }
    }

    fn acquire(&self) -> Result<Permit<'_>, AppError> {
        let poisoned = || AppError::Internal("git operation gate was poisoned".to_owned());
        let mut available = self.available.lock().map_err(|_| poisoned())?;
        let deadline = Instant::now()
            .checked_add(self.wait_timeout)
            .ok_or_else(|| {
                AppError::ResourceLimitExceeded(
                    "the Git operation wait timeout is not representable".to_owned(),
                )
            })?;
        while *available == 0 {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Err(AppError::ResourceLimitExceeded(
                    "timed out waiting for an available Git operation slot".to_owned(),
                ));
            }
            let (next, timeout) = self
                .changed
                .wait_timeout(available, remaining)
                .map_err(|_| poisoned())?;
            available = next;
            if timeout.timed_out() && *available == 0 {
                return Err(AppError::ResourceLimitExceeded(
                    "timed out waiting for an available Git operation slot".to_owned(),
                ));
            }
        }
        *available = available.checked_sub(1).ok_or_else(|| {
            AppError::Internal("git operation gate permit count underflowed".to_owned())
        })?;
        Ok(Permit { gate: self })
    }
}

struct Permit<'a> {
    gate: &'a Gate,
}

impl Drop for Permit<'_> {
    fn drop(&mut self) {
        if let Ok(mut available) = self.gate.available.lock() {
            *available = available.saturating_add(1);
            self.gate.changed.notify_one();
        }
    }
}

fn read_gate() -> &'static Gate {
    static GATE: OnceLock<Gate> = OnceLock::new();
    GATE.get_or_init(|| Gate::new(MAX_CONCURRENT_READS))
}

fn write_gate() -> &'static Gate {
    static GATE: OnceLock<Gate> = OnceLock::new();
    GATE.get_or_init(|| Gate::new(MAX_CONCURRENT_WRITES))
}

fn transfer_gate() -> &'static Gate {
    static GATE: OnceLock<Gate> = OnceLock::new();
    GATE.get_or_init(|| Gate::new(MAX_CONCURRENT_TRANSFERS))
}

async fn run<T: Send + 'static>(
    operation: &'static str,
    gate: fn() -> &'static Gate,
    work: impl FnOnce() -> Result<T, AppError> + Send + 'static,
) -> Result<T, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let _permit = gate().acquire()?;
        let start = Instant::now();
        let result = work();
        tracing::info!(
            operation,
            elapsed_ms = %start.elapsed().as_millis(),
            success = result.is_ok(),
            "domain operation completed"
        );
        result
    })
    .await
    .map_err(|error| AppError::Internal(error.to_string()))?
}

/// Runs an idempotent read, retrying transient failures such as descriptor
/// exhaustion.
pub(crate) async fn read<T: Send + 'static>(
    operation: &'static str,
    mut work: impl FnMut() -> Result<T, AppError> + Send + 'static,
) -> Result<T, AppError> {
    run(operation, read_gate, move || {
        retry_transient(READ_RETRIES, READ_BACKOFF, &mut work)
    })
    .await
}

/// Runs work that changes something — the repository, the keychain, the cache,
/// or a remote — exactly once, never retrying it.
pub(crate) async fn write<T: Send + 'static>(
    operation: &'static str,
    work: impl FnOnce() -> Result<T, AppError> + Send + 'static,
) -> Result<T, AppError> {
    run(operation, write_gate, work).await
}

/// Runs long network work through its independent two-permit, 30-second gate.
///
/// Release metadata and downloads use this independent gate so ordinary
/// repository writes and reads can proceed while a transfer is active.
pub(crate) async fn transfer<T: Send + 'static>(
    operation: &'static str,
    work: impl FnOnce() -> Result<T, AppError> + Send + 'static,
) -> Result<T, AppError> {
    run(operation, transfer_gate, work).await
}

#[cfg(test)]
mod tests {
    use std::sync::{
        atomic::{AtomicU32, Ordering},
        mpsc, Arc,
    };

    use super::*;

    fn transient() -> AppError {
        AppError::ResourceExhausted("too many open files".to_owned())
    }

    #[test]
    fn a_gate_admits_no_more_than_its_capacity() {
        let gate = Arc::new(Gate::new(2));
        let first = gate.acquire().unwrap();
        let second = gate.acquire().unwrap();

        let (sender, receiver) = mpsc::channel();
        let waiting = {
            let gate = Arc::clone(&gate);
            std::thread::spawn(move || {
                let _third = gate.acquire().unwrap();
                sender.send(()).unwrap();
            })
        };
        assert!(
            receiver.recv_timeout(Duration::from_millis(150)).is_err(),
            "the third caller must wait while both permits are out"
        );

        drop(first);
        receiver.recv_timeout(Duration::from_secs(5)).unwrap();
        waiting.join().unwrap();
        drop(second);
    }

    #[test]
    fn a_saturated_write_gate_does_not_block_reads() {
        let held: Vec<_> = (0..MAX_CONCURRENT_WRITES)
            .map(|_| write_gate().acquire().unwrap())
            .collect();

        // On its own thread, so a read that wrongly waits for the write gate
        // fails this test by timeout instead of hanging the suite.
        let (sender, receiver) = mpsc::channel();
        std::thread::spawn(move || {
            let value = tauri::async_runtime::block_on(read("test_read", || Ok(7)));
            let _ = sender.send(value);
        });

        let value = receiver
            .recv_timeout(Duration::from_secs(5))
            .expect("a read must not wait for the write gate");
        assert_eq!(value.unwrap(), 7);
        drop(held);
    }

    #[test]
    fn reads_are_retried_and_writes_are_not() {
        let attempts = Arc::new(AtomicU32::new(0));
        let counted = Arc::clone(&attempts);
        let outcome = tauri::async_runtime::block_on(read("test_read", move || {
            if counted.fetch_add(1, Ordering::SeqCst) < 2 {
                Err(transient())
            } else {
                Ok("read")
            }
        }));
        assert_eq!(outcome.unwrap(), "read");
        assert_eq!(attempts.load(Ordering::SeqCst), 3);

        let attempts = Arc::new(AtomicU32::new(0));
        let counted = Arc::clone(&attempts);
        let outcome: Result<(), _> =
            tauri::async_runtime::block_on(write("test_write", move || {
                counted.fetch_add(1, Ordering::SeqCst);
                Err(transient())
            }));
        assert!(outcome.unwrap_err().is_transient());
        assert_eq!(attempts.load(Ordering::SeqCst), 1, "a write runs once");
    }

    #[test]
    fn a_gate_wait_has_a_bounded_timeout() {
        let gate = Gate::with_wait_timeout(0, Duration::from_millis(5));

        let Err(error) = gate.acquire() else {
            panic!("a zero-capacity gate must not admit work")
        };

        assert!(matches!(error, AppError::ResourceLimitExceeded(_)));
        assert!(error.to_string().contains("timed out"));
    }

    #[test]
    fn transfers_have_an_independent_two_permit_gate() {
        let held: Vec<_> = (0..MAX_CONCURRENT_TRANSFERS)
            .map(|_| transfer_gate().acquire().unwrap())
            .collect();
        let (sender, receiver) = mpsc::channel();
        std::thread::spawn(move || {
            let value = tauri::async_runtime::block_on(transfer("test_transfer", || Ok(9)));
            let _ = sender.send(value);
        });
        assert!(receiver.recv_timeout(Duration::from_millis(100)).is_err());

        let read_value = tauri::async_runtime::block_on(read("test_read", || Ok(7))).unwrap();
        let write_value = tauri::async_runtime::block_on(write("test_write", || Ok(8))).unwrap();
        assert_eq!(read_value, 7);
        assert_eq!(write_value, 8);

        drop(held);
        assert_eq!(
            receiver
                .recv_timeout(Duration::from_secs(5))
                .unwrap()
                .unwrap(),
            9
        );
    }

    #[test]
    fn an_abandoned_started_blocking_write_keeps_its_lock_until_it_finishes() {
        use git2::Repository;
        use gitcanvas_core::{repository::ActiveRepo, write_lock::with_repository_write_lock};

        let directory = tempfile::tempdir().unwrap();
        Repository::init(directory.path()).unwrap();
        let active = ActiveRepo::validate(directory.path()).unwrap();
        let (started_sender, started_receiver) = mpsc::channel();
        let (release_sender, release_receiver) = mpsc::channel();
        let (finished_sender, finished_receiver) = mpsc::channel();
        let operation = tauri::async_runtime::spawn_blocking(move || {
            let result = with_repository_write_lock(&active, || {
                started_sender
                    .send(())
                    .map_err(|error| AppError::Internal(error.to_string()))?;
                release_receiver
                    .recv()
                    .map_err(|error| AppError::Internal(error.to_string()))?;
                Ok(())
            });
            let _ = finished_sender.send(result.is_ok());
            result
        });

        started_receiver
            .recv_timeout(Duration::from_secs(5))
            .expect("the blocking operation should hold the repository lock");
        // Tokio cannot abort spawn_blocking work after it has started. Dropping
        // the join handle abandons the result, not the running blocking closure.
        operation.abort();
        drop(operation);

        let contender_active = ActiveRepo::validate(directory.path()).unwrap();
        let (contender_sender, contender_receiver) = mpsc::channel();
        let contender = std::thread::spawn(move || {
            let result = with_repository_write_lock(&contender_active, || Ok(()));
            let _ = contender_sender.send(result);
        });
        assert!(contender_receiver
            .recv_timeout(Duration::from_millis(100))
            .is_err());

        release_sender.send(()).unwrap();
        assert!(finished_receiver
            .recv_timeout(Duration::from_secs(5))
            .unwrap());
        contender_receiver
            .recv_timeout(Duration::from_secs(5))
            .unwrap()
            .unwrap();
        contender.join().unwrap();
    }
}
