//! Native shutdown routing. Renderer recovery restarts explicitly; ordinary
//! system exit must first let the window flush its durable workspace.
//!
//! Closing is a conversation: the window asks the interface, the interface
//! saves and then destroys the window itself. That is what lets the session be
//! saved, and it is also what makes closing depend on the interface being alive.
//! A renderer that crashed or hung would answer nothing, and neither the red
//! button nor `⌘Q` would ever finish. So the interface acknowledges the request
//! the moment it receives it, and a window whose request goes unacknowledged
//! past [`RESPONSE_DEADLINE`] is destroyed by the backend.

use std::{
    sync::{Arc, Condvar, Mutex},
    time::Duration,
};

use tauri::{Manager, Runtime, Window, WindowEvent};

/// How long the interface has to acknowledge a close request before it is
/// presumed unresponsive. Receiving a request and acknowledging it takes
/// milliseconds; this is slack for a busy machine, not for saving.
pub const RESPONSE_DEADLINE: Duration = Duration::from_secs(3);

/// What became of one close request's wait.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Wait {
    /// The interface answered.
    Acknowledged,
    /// Another close request began meanwhile and took over.
    Superseded,
    /// Nobody answered in time.
    TimedOut,
}

#[derive(Default)]
struct Requests {
    /// Which close request is current; a new one supersedes the last.
    generation: u64,
    /// Whether the current request has been acknowledged.
    acknowledged: bool,
}

/// The acknowledgement of close requests, shared by the window event that
/// starts one, the command that answers it and the watchdog that waits.
#[derive(Default)]
pub struct ShutdownGate {
    requests: Mutex<Requests>,
    changed: Condvar,
}

impl ShutdownGate {
    /// Starts a close request and returns the number that identifies it.
    pub fn begin(&self) -> u64 {
        let Ok(mut requests) = self.requests.lock() else {
            return 0;
        };
        requests.generation = requests.generation.wrapping_add(1);
        requests.acknowledged = false;
        self.changed.notify_all();
        requests.generation
    }

    /// Records that the interface received the current close request.
    pub fn acknowledge(&self) {
        if let Ok(mut requests) = self.requests.lock() {
            requests.acknowledged = true;
            self.changed.notify_all();
        }
    }

    /// Waits until request `generation` is acknowledged or superseded, or the
    /// deadline passes.
    pub fn wait(&self, generation: u64, deadline: Duration) -> Wait {
        let Ok(requests) = self.requests.lock() else {
            // A poisoned gate cannot say who answered; do not destroy a window
            // on the strength of that.
            return Wait::Superseded;
        };
        let Ok((requests, timeout)) = self.changed.wait_timeout_while(requests, deadline, |r| {
            r.generation == generation && !r.acknowledged
        }) else {
            return Wait::Superseded;
        };
        if requests.generation != generation {
            Wait::Superseded
        } else if requests.acknowledged {
            Wait::Acknowledged
        } else {
            debug_assert!(timeout.timed_out());
            Wait::TimedOut
        }
    }
}

/// Sends normal system quit (including Cmd+Q) through the window's close request.
/// A destroyed final window has nothing left to flush; explicit process exits
/// and restarts also continue through Tauri's own lifecycle.
pub fn on_run_event(handle: &tauri::AppHandle, event: tauri::RunEvent) {
    if let tauri::RunEvent::ExitRequested {
        code: None, api, ..
    } = event
    {
        if let Some(window) = handle.get_webview_window("main") {
            api.prevent_exit();
            if let Err(error) = window.close() {
                tracing::error!(%error, "could not request window close before exit");
            }
        }
    }
}

/// Starts the watchdog for every close request, whether it came from the red
/// button, `Cmd+Q` or the interface itself.
pub fn on_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    if !matches!(event, WindowEvent::CloseRequested { .. }) {
        return;
    }
    let gate: Arc<ShutdownGate> = Arc::clone(&window.state::<Arc<ShutdownGate>>());
    let generation = gate.begin();
    let window = window.clone();
    let spawned = std::thread::Builder::new()
        .name("shutdown-watchdog".to_owned())
        .spawn(move || {
            if gate.wait(generation, RESPONSE_DEADLINE) == Wait::TimedOut {
                tracing::error!(
                    deadline_ms = %RESPONSE_DEADLINE.as_millis(),
                    "the interface did not answer a close request; destroying the window"
                );
                if let Err(error) = window.destroy() {
                    tracing::error!(%error, "could not destroy the unresponsive window");
                }
            }
        });
    if let Err(error) = spawned {
        tracing::error!(%error, "could not start the shutdown watchdog");
    }
}

#[cfg(test)]
mod tests {
    use std::{sync::Arc, thread, time::Duration};

    use super::{ShutdownGate, Wait};

    const SHORT: Duration = Duration::from_millis(40);
    const LONG: Duration = Duration::from_secs(5);

    #[test]
    fn an_unanswered_request_times_out() {
        let gate = ShutdownGate::default();
        let generation = gate.begin();

        assert_eq!(gate.wait(generation, SHORT), Wait::TimedOut);
    }

    #[test]
    fn an_acknowledgement_that_arrives_first_is_not_missed() {
        let gate = ShutdownGate::default();
        let generation = gate.begin();
        gate.acknowledge();

        assert_eq!(gate.wait(generation, LONG), Wait::Acknowledged);
    }

    #[test]
    fn an_acknowledgement_that_arrives_during_the_wait_ends_it_at_once() {
        let gate = Arc::new(ShutdownGate::default());
        let generation = gate.begin();
        let answering = Arc::clone(&gate);
        let answer = thread::spawn(move || answering.acknowledge());

        assert_eq!(gate.wait(generation, LONG), Wait::Acknowledged);
        answer.join().unwrap();
    }

    #[test]
    fn a_newer_request_supersedes_the_wait_of_an_older_one() {
        let gate = Arc::new(ShutdownGate::default());
        let first = gate.begin();
        let starting = Arc::clone(&gate);
        let second = thread::spawn(move || starting.begin());

        assert_eq!(gate.wait(first, LONG), Wait::Superseded);
        second.join().unwrap();
    }

    #[test]
    fn a_new_request_needs_its_own_acknowledgement() {
        let gate = ShutdownGate::default();
        gate.begin();
        gate.acknowledge();
        let second = gate.begin();

        assert_eq!(gate.wait(second, SHORT), Wait::TimedOut);
    }
}
