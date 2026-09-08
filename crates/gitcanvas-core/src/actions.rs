//! Branch checkout, fast-forward pull and push.
//!
//! Everything here that can lose work refuses by default and reports what
//! stands in the way. Forcing is always a separate, explicit decision made
//! above this layer — nothing in this module silently discards anything.

use git2::{
    build::CheckoutBuilder, AnnotatedCommit, AutotagOption, BranchType, Cred, FetchOptions,
    PushOptions, RemoteCallbacks, Repository, StatusOptions,
};
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{error::AppError, github::credentials, repository::ActiveRepo};

/// A path that would be lost or overwritten by an operation.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DirtyPath {
    pub path: String,
    /// True when the change is staged, false when it is only in the worktree.
    pub staged: bool,
}

/// The outcome of a checkout attempt.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub enum CheckoutOutcome {
    /// The branch is now checked out.
    Switched { branch: String },
    /// Refused: these changes would have been lost.
    Blocked { conflicts: Vec<DirtyPath> },
}

/// The outcome of a pull attempt.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub enum PullOutcome {
    /// Already up to date; nothing was fetched that changes the branch.
    UpToDate,
    /// Fast-forwarded to the remote tip.
    FastForwarded { commits: u32, to: String },
    /// Refused: the histories diverged and a real merge would be required.
    DivergedRequiresMerge { local: String, remote: String },
    /// The branch has no upstream to pull from.
    NoUpstream,
}

/// The outcome of a push attempt.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub enum PushOutcome {
    Pushed {
        branch: String,
        remote: String,
    },
    /// Refused: the remote has commits the local branch does not.
    RejectedNonFastForward {
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

fn remote_callbacks<'a>() -> RemoteCallbacks<'a> {
    let mut callbacks = RemoteCallbacks::new();
    callbacks.credentials(|_url, username, allowed| {
        if allowed.contains(git2::CredentialType::USER_PASS_PLAINTEXT) {
            if let Ok(token) = credentials::read_token() {
                return Cred::userpass_plaintext(&token, "");
            }
        }
        if allowed.contains(git2::CredentialType::SSH_KEY) {
            if let Some(username) = username {
                return Cred::ssh_key_from_agent(username);
            }
        }
        Cred::default()
    });
    callbacks
}

/// Fetches the upstream and fast-forwards the current branch onto it.
///
/// A pull that would need a real merge is reported, never performed: creating a
/// merge commit from a button has correctness and history implications that
/// deserve a deliberate decision, and the command line is right there.
///
/// # Errors
///
/// Returns [`AppError`] when the repository cannot be opened, the remote is
/// unreachable, or credentials are rejected.
pub fn pull_fast_forward(active: &ActiveRepo) -> Result<PullOutcome, AppError> {
    let repo = active.open()?;
    let head = repo.head()?;
    let branch_name = head.shorthand()?.to_owned();
    let head_name = head.name()?.to_owned();

    let branch = repo.find_branch(&branch_name, BranchType::Local)?;
    let Ok(upstream) = branch.upstream() else {
        return Ok(PullOutcome::NoUpstream);
    };
    let upstream_name = upstream.name()?.unwrap_or("upstream").to_owned();

    let remote_name = upstream_remote(&repo, &head_name);

    let mut remote = repo.find_remote(&remote_name)?;
    let mut fetch = FetchOptions::new();
    fetch.remote_callbacks(remote_callbacks());
    fetch.download_tags(AutotagOption::All);
    remote.fetch(&[&branch_name], Some(&mut fetch), None)?;

    let fetch_head = repo.find_reference("FETCH_HEAD")?;
    let target: AnnotatedCommit<'_> = repo.reference_to_annotated_commit(&fetch_head)?;
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

    let local_oid = head.target().unwrap_or(git2::Oid::ZERO_SHA1);
    let ahead = repo
        .graph_ahead_behind(target.id(), local_oid)
        .map_or(0, |(ahead, _)| u32::try_from(ahead).unwrap_or(u32::MAX));

    let mut reference = repo.find_reference(&head_name)?;
    reference.set_target(target.id(), "pull: fast-forward")?;
    repo.set_head(&head_name)?;
    repo.checkout_head(Some(CheckoutBuilder::default().safe()))?;

    Ok(PullOutcome::FastForwarded {
        commits: ahead,
        to: target.id().to_string(),
    })
}

/// Pushes the current branch to its remote.
///
/// A non-fast-forward rejection is reported rather than retried with force: the
/// remote having commits the local branch does not is exactly the case where
/// forcing destroys someone else's work.
///
/// # Errors
///
/// Returns [`AppError`] when the repository cannot be opened, the remote is
/// unreachable, or credentials are rejected.
pub fn push_current_branch(active: &ActiveRepo) -> Result<PushOutcome, AppError> {
    let repo = active.open()?;
    let head = repo.head()?;
    if !head.is_branch() {
        return Err(AppError::InvalidInput(
            "HEAD is detached, so there is no branch to push".to_owned(),
        ));
    }
    let branch_name = head.shorthand()?.to_owned();
    let remote_name = upstream_remote(&repo, head.name()?);

    let mut remote = repo.find_remote(&remote_name)?;
    let mut options = PushOptions::new();
    options.remote_callbacks(remote_callbacks());

    let refspec = format!("refs/heads/{branch_name}:refs/heads/{branch_name}");
    match remote.push(&[&refspec], Some(&mut options)) {
        Ok(()) => Ok(PushOutcome::Pushed {
            branch: branch_name,
            remote: remote_name,
        }),
        Err(error) if error.code() == git2::ErrorCode::NotFastForward => {
            Ok(PushOutcome::RejectedNonFastForward {
                branch: branch_name,
            })
        }
        Err(error) if error.code() == git2::ErrorCode::Auth => Err(AppError::InvalidInput(
            "the remote rejected the credentials for this push".to_owned(),
        )),
        Err(error) => Err(AppError::from(error)),
    }
}
