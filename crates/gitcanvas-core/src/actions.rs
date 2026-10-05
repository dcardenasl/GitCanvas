//! Branch checkout, fast-forward pull and push.
//!
//! Everything here that can lose work refuses by default and reports what
//! stands in the way. Forcing is always a separate, explicit decision made
//! above this layer — nothing in this module silently discards anything.

use std::{cell::RefCell, rc::Rc};

use git2::{
    build::CheckoutBuilder, AnnotatedCommit, AutotagOption, BranchType, Direction, ErrorCode,
    FetchOptions, PushOptions, RemoteCallbacks, Repository, StatusOptions,
};
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{error::AppError, github::credentials, repository::ActiveRepo};

/// A path that would be lost or overwritten by an operation.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DirtyPath {
    /// Repository-relative path that would be discarded or overwritten.
    pub path: String,
    /// True when the change is staged, false when it is only in the worktree.
    pub staged: bool,
}

/// The outcome of a checkout attempt.
/// Serialized with an internal `kind` tag so TypeScript sees a discriminated
/// union it can narrow with a `switch`, matching how `AppError` already
/// crosses the boundary. The default external tagging generates a shape that
/// needs a key lookup before anything can be read.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "kind")]
pub enum CheckoutOutcome {
    /// The branch is now checked out.
    Switched {
        /// Name of the branch now checked out.
        branch: String,
    },
    /// Refused: these changes would have been lost.
    Blocked {
        /// Local paths that prevent a safe checkout.
        conflicts: Vec<DirtyPath>,
    },
}

/// The outcome of a pull attempt.
/// Serialized with an internal `kind` tag so TypeScript sees a discriminated
/// union it can narrow with a `switch`, matching how `AppError` already
/// crosses the boundary. The default external tagging generates a shape that
/// needs a key lookup before anything can be read.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "kind")]
pub enum PullOutcome {
    /// Already up to date; nothing was fetched that changes the branch.
    UpToDate,
    /// Fast-forwarded to the remote tip.
    FastForwarded {
        /// Number of commits added by the fast-forward.
        commits: u32,
        /// Commit id at the new branch tip.
        to: String,
    },
    /// Refused: the histories diverged and a real merge would be required.
    DivergedRequiresMerge {
        /// Local branch tip commit id.
        local: String,
        /// Upstream branch tip commit id.
        remote: String,
    },
    /// The branch has no upstream to pull from.
    NoUpstream,
}

/// The outcome of a push attempt.
/// Serialized with an internal `kind` tag so TypeScript sees a discriminated
/// union it can narrow with a `switch`, matching how `AppError` already
/// crosses the boundary. The default external tagging generates a shape that
/// needs a key lookup before anything can be read.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "kind")]
pub enum PushOutcome {
    /// Successfully pushed the checked-out branch.
    Pushed {
        /// Name of the branch sent.
        branch: String,
        /// Name of the remote that received it.
        remote: String,
    },
    /// Refused: the remote has commits the local branch does not.
    RejectedNonFastForward {
        /// Name of the branch the remote rejected.
        branch: String,
    },
}

/// Uncommitted changes that a checkout would destroy.
fn dirty_paths(repo: &Repository) -> Result<Vec<DirtyPath>, AppError> {
    let mut options = StatusOptions::new();
    options
        .include_untracked(false)
        .include_ignored(false)
        .exclude_submodules(true);

    let mut dirty = Vec::new();
    for entry in repo.statuses(Some(&mut options))?.iter() {
        let status = entry.status();
        // Untracked files survive a checkout, so they are not conflicts.
        if status.is_wt_new() {
            continue;
        }
        let staged = status.is_index_new()
            || status.is_index_modified()
            || status.is_index_deleted()
            || status.is_index_renamed()
            || status.is_index_typechange();
        dirty.push(DirtyPath {
            path: entry.path().unwrap_or_default().to_owned(),
            staged,
        });
    }
    Ok(dirty)
}

/// Checks out a local branch.
///
/// Refuses when the worktree carries changes that would be lost, unless `force`
/// is set. Forcing is destructive and must come from an explicit confirmation.
///
/// # Errors
///
/// Returns [`AppError`] when the repository cannot be opened, the branch does
/// not exist, or libgit2 fails the checkout.
pub fn checkout_branch(
    active: &ActiveRepo,
    branch: &str,
    force: bool,
) -> Result<CheckoutOutcome, AppError> {
    let repo = active.open()?;

    if !force {
        let conflicts = dirty_paths(&repo)?;
        if !conflicts.is_empty() {
            return Ok(CheckoutOutcome::Blocked { conflicts });
        }
    }

    let reference = repo
        .find_branch(branch, BranchType::Local)?
        .into_reference();
    let name = reference.name()?.to_owned();
    let tree = reference.peel_to_tree()?;

    let mut checkout = CheckoutBuilder::new();
    if force {
        checkout.force();
    } else {
        // Safe checkout still refuses at the libgit2 level, which is the second
        // line of defence behind the status check above.
        checkout.safe();
    }

    repo.checkout_tree(tree.as_object(), Some(&mut checkout))?;
    repo.set_head(&name)?;

    Ok(CheckoutOutcome::Switched {
        branch: branch.to_owned(),
    })
}

/// The remote a branch tracks, defaulting to `origin`.
///
/// A branch with no configured upstream still has a sensible remote to talk to,
/// and failing here would block a first push on a brand-new branch.
fn upstream_remote(repo: &Repository, head_name: &str) -> String {
    repo.branch_upstream_remote(head_name)
        .ok()
        .and_then(|buffer| buffer.as_str().ok().map(str::to_owned))
        .unwrap_or_else(|| "origin".to_owned())
}

/// The ref on the remote that `branch` pushes to and pulls from.
///
/// Read from `branch.<name>.merge`, because a local branch is free to track a
/// remote branch with a different name. Without an upstream the branch pushes to
/// its own name, which is what creates it on a first push.
fn upstream_ref(repo: &Repository, branch: &str) -> String {
    repo.config()
        .and_then(|config| config.get_string(&format!("branch.{branch}.merge")))
        .unwrap_or_else(|_| format!("refs/heads/{branch}"))
}

fn remote_callbacks<'a>() -> RemoteCallbacks<'a> {
    let mut callbacks = RemoteCallbacks::new();
    callbacks.credentials(credentials::callback());
    callbacks
}

/// The current branch's name, or an explanation when HEAD is detached.
fn current_branch(repo: &Repository, verb: &str) -> Result<(String, String), AppError> {
    let head = repo.head()?;
    if !head.is_branch() {
        return Err(AppError::InvalidInput(format!(
            "HEAD is detached, so there is no branch to {verb}"
        )));
    }
    Ok((head.shorthand()?.to_owned(), head.name()?.to_owned()))
}

/// Fetches the upstream and fast-forwards the current branch onto it.
///
/// A pull that would need a real merge is reported, never performed: creating a
/// merge commit from a button has correctness and history implications that
/// deserve a deliberate decision, and the command line is right there.
///
/// The working tree is updated before the branch ref moves. If local changes
/// stand in the way the checkout refuses and nothing has changed, instead of
/// leaving the branch advanced over a working tree that still shows the old
/// files as staged reversals.
///
/// # Errors
///
/// Returns [`AppError`] when the repository cannot be opened, HEAD is detached,
/// the remote is unreachable, credentials are rejected, or local changes would
/// be overwritten.
pub fn pull_fast_forward(active: &ActiveRepo) -> Result<PullOutcome, AppError> {
    let repo = active.open()?;
    let (branch_name, head_name) = current_branch(&repo, "pull")?;

    let branch = repo.find_branch(&branch_name, BranchType::Local)?;
    let Ok(upstream) = branch.upstream() else {
        return Ok(PullOutcome::NoUpstream);
    };
    let upstream_name = upstream.name()?.unwrap_or("upstream").to_owned();
    let upstream_ref_name = upstream.get().name()?.to_owned();
    drop(upstream);
    drop(branch);

    let remote_name = upstream_remote(&repo, &head_name);
    let mut remote = repo.find_remote(&remote_name)?;
    let mut fetch = FetchOptions::new();
    fetch.remote_callbacks(remote_callbacks());
    fetch.download_tags(AutotagOption::All);
    // The remote's configured refspecs, so the tracking ref the branch points
    // at is the one that gets updated — whatever the remote branch is called.
    remote
        .fetch(&[] as &[&str], Some(&mut fetch), None)
        .map_err(AppError::from_git2_remote)?;

    let tracking = repo.find_reference(&upstream_ref_name)?;
    let target: AnnotatedCommit<'_> = repo.reference_to_annotated_commit(&tracking)?;
    let (analysis, _) = repo.merge_analysis(&[&target])?;

    if analysis.is_up_to_date() {
        return Ok(PullOutcome::UpToDate);
    }
    if !analysis.is_fast_forward() {
        return Ok(PullOutcome::DivergedRequiresMerge {
            local: branch_name,
            remote: upstream_name,
        });
    }

    let head = repo.head()?;
    let local_oid = head.target().unwrap_or(git2::Oid::ZERO_SHA1);
    let ahead = repo
        .graph_ahead_behind(target.id(), local_oid)
        .map_or(0, |(ahead, _)| u32::try_from(ahead).unwrap_or(u32::MAX));

    let commit = repo.find_commit(target.id())?;
    repo.checkout_tree(commit.as_object(), Some(CheckoutBuilder::new().safe()))
        .map_err(|error| {
            if error.code() == ErrorCode::Conflict {
                AppError::Conflict(
                    "local changes would be overwritten by the pull; commit or discard them first"
                        .to_owned(),
                )
            } else {
                AppError::from(error)
            }
        })?;
    repo.reference_matching(
        &head_name,
        target.id(),
        true,
        local_oid,
        "pull: fast-forward",
    )?;

    Ok(PullOutcome::FastForwarded {
        commits: ahead,
        to: target.id().to_string(),
    })
}

/// Whether a server's rejection message means "your branch is behind".
fn is_non_fast_forward(message: &str) -> bool {
    let message = message.to_ascii_lowercase();
    [
        "non-fast-forward",
        "fetch first",
        "not a fast-forward",
        "stale info",
    ]
    .iter()
    .any(|marker| message.contains(marker))
}

/// The commit a remote currently has at `reference`, if it has one.
fn remote_tip(
    remote: &mut git2::Remote<'_>,
    reference: &str,
) -> Result<Option<git2::Oid>, AppError> {
    let connection = remote
        .connect_auth(Direction::Push, Some(remote_callbacks()), None)
        .map_err(AppError::from_git2_remote)?;
    Ok(connection
        .list()?
        .iter()
        .find(|head| head.name() == reference)
        .map(git2::RemoteHead::oid))
}

/// Pushes the current branch to its remote.
///
/// A non-fast-forward rejection is reported rather than retried with force: the
/// remote having commits the local branch does not is exactly the case where
/// forcing destroys someone else's work.
///
/// libgit2 does not compare histories before pushing, and a remote's refusal
/// arrives as a per-ref status rather than as a failed call. Both are handled
/// explicitly: the remote's tip is compared with the local branch first, and
/// any status the server returns is turned into an outcome or an error, so a
/// push the remote refused can never be reported as pushed.
///
/// # Errors
///
/// Returns [`AppError`] when the repository cannot be opened, HEAD is detached,
/// the remote is unreachable, credentials are rejected, or the remote refuses
/// the update for a reason other than being ahead.
pub fn push_current_branch(active: &ActiveRepo) -> Result<PushOutcome, AppError> {
    let repo = active.open()?;
    let (branch_name, head_name) = current_branch(&repo, "push")?;
    let remote_name = upstream_remote(&repo, &head_name);
    let target_ref = upstream_ref(&repo, &branch_name);

    let local_oid = repo
        .find_reference(&head_name)?
        .target()
        .ok_or_else(|| AppError::Git("the current branch has no commit to push".to_owned()))?;

    let mut remote = repo.find_remote(&remote_name)?;

    if let Some(remote_oid) = remote_tip(&mut remote, &target_ref)? {
        // A tip this repository does not even have is, by definition, work the
        // local branch has not seen.
        let behind = remote_oid != local_oid
            && (repo.find_commit(remote_oid).is_err()
                || !repo.graph_descendant_of(local_oid, remote_oid)?);
        if behind {
            return Ok(PushOutcome::RejectedNonFastForward {
                branch: branch_name,
            });
        }
    }

    let refusal: Rc<RefCell<Option<String>>> = Rc::default();
    let mut callbacks = remote_callbacks();
    callbacks.push_update_reference({
        let refusal = Rc::clone(&refusal);
        move |reference, status| {
            if let Some(status) = status {
                *refusal.borrow_mut() = Some(format!("{reference}: {status}"));
            }
            Ok(())
        }
    });
    let mut options = PushOptions::new();
    options.remote_callbacks(callbacks);

    let refspec = format!("{head_name}:{target_ref}");
    let result = remote.push(&[&refspec], Some(&mut options));
    drop(options);

    match result {
        Ok(()) => {}
        Err(error) if error.code() == ErrorCode::NotFastForward => {
            return Ok(PushOutcome::RejectedNonFastForward {
                branch: branch_name,
            });
        }
        Err(error) if error.code() == ErrorCode::Auth => {
            return Err(AppError::Auth(
                "the remote rejected the credentials for this push".to_owned(),
            ));
        }
        Err(error) => return Err(AppError::from_git2_remote(error)),
    }

    match refusal.take() {
        None => Ok(PushOutcome::Pushed {
            branch: branch_name,
            remote: remote_name,
        }),
        Some(message) if is_non_fast_forward(&message) => Ok(PushOutcome::RejectedNonFastForward {
            branch: branch_name,
        }),
        Some(message) => Err(AppError::Conflict(format!(
            "the remote refused the push: {message}"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::is_non_fast_forward;

    #[test]
    fn server_wording_for_a_branch_that_is_behind_is_recognised() {
        for message in [
            "refs/heads/main: non-fast-forward",
            "refs/heads/main: Fetch first",
            "refs/heads/main: stale info",
            "refs/heads/main: not a fast-forward",
        ] {
            assert!(is_non_fast_forward(message), "missed {message}");
        }
        assert!(!is_non_fast_forward("refs/heads/main: protected branch"));
    }
}
