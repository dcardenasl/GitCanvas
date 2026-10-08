//! Retrying transient failures.

use std::{thread, time::Duration};

use crate::error::AppError;

// Retries intentionally block until the backoff expires; keeping this call in
// one helper makes the synchronous API's only sleep exception explicit.
#[allow(clippy::disallowed_methods)]
fn wait_before_retry(delay: Duration) {
    thread::sleep(delay);
}

/// Runs `operation`, retrying while it fails with a transient error.
///
/// Waits `base`, then `2 × base`, then `4 × base`… between attempts, and gives
/// up after `retries` retries, returning the last error. A non-transient error
/// is returned immediately: retrying a real failure only delays reporting it.
///
/// Only for operations that are safe to repeat. Reads and watcher setup are;
/// pushing, pulling or cloning are not, and must not be passed here.
///
/// # Errors
///
/// Returns the operation's error once it is not transient or the retries run out.
pub fn retry_transient<T>(
    retries: u32,
    base: Duration,
    mut operation: impl FnMut() -> Result<T, AppError>,
) -> Result<T, AppError> {
    let mut attempt = 0u32;
    loop {
        match operation() {
            Err(error) if error.is_transient() && attempt < retries => {
                let multiplier = 1u32.checked_shl(attempt).unwrap_or(u32::MAX);
                wait_before_retry(base.saturating_mul(multiplier));
                attempt = attempt.saturating_add(1);
            }
            other => return other,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::cell::Cell;

    use super::*;

    const NO_WAIT: Duration = Duration::ZERO;

    fn exhausted() -> AppError {
        AppError::ResourceExhausted("too many open files".into())
    }

    #[test]
    fn a_transient_failure_is_retried_until_it_succeeds() {
        let calls = Cell::new(0);
        let result = retry_transient(3, NO_WAIT, || {
            calls.set(calls.get() + 1);
            if calls.get() < 3 {
                Err(exhausted())
            } else {
                Ok("done")
            }
        });
        assert_eq!(result.unwrap(), "done");
        assert_eq!(calls.get(), 3);
    }

    #[test]
    fn retries_are_bounded_and_the_last_error_is_returned() {
        let calls = Cell::new(0);
        let result: Result<(), _> = retry_transient(2, NO_WAIT, || {
            calls.set(calls.get() + 1);
            Err(exhausted())
        });
        assert!(result.unwrap_err().is_transient());
        assert_eq!(calls.get(), 3, "the first attempt plus two retries");
    }

    #[test]
    fn a_real_failure_is_reported_immediately() {
        let calls = Cell::new(0);
        let result: Result<(), _> = retry_transient(3, NO_WAIT, || {
            calls.set(calls.get() + 1);
            Err(AppError::Git("corrupt".into()))
        });
        assert!(matches!(result, Err(AppError::Git(_))));
        assert_eq!(calls.get(), 1);
    }

    #[test]
    fn exponential_backoff_shift_saturates_after_the_integer_width() {
        let calls = Cell::new(0);
        let result: Result<(), _> = retry_transient(40, NO_WAIT, || {
            calls.set(calls.get() + 1);
            Err(exhausted())
        });
        assert!(result.unwrap_err().is_transient());
        assert_eq!(calls.get(), 41);
    }
}
