# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

React runs inside a Tauri desktop window on macOS, Linux and Windows.

## Users

David uses local Git repositories and GitHub repositories to inspect branching history.

## Product Purpose

Read the shape of repository history at a glance, then inspect the changes in a commit.

## Capabilities and Constraints

The governing scope is TASKS.md: local history, a resumable graph, first-parent diffs,
GitHub cloning, guarded checkout, fast-forward pull and authenticated push. Git data
comes from local clones. Credentials stay in Rust and the OS keychain. No shallow clones.

## Brand Commitments

The user requested execution of the existing plan, whose design is already closed.
The application window inside docs/mockup.html is the visual authority. Preserve its
branch sidebar, graph and commit rows, detail inspector and compact toolbar. The
surrounding mockup presentation page is not part of the application.

## Evidence on Hand

TASKS.md, CLAUDE.md, docs/PLAN-DESARROLLO.md, docs/mockup.html and local reference
repositories identified in CLAUDE.md. Display repository content only from real data.

## Product Principles

- The graph is the central task surface.
- Loading another page preserves previous lane assignments.
- Errors provide a recoverable state; destructive actions require explicit confirmation.
- Keep expensive work off the desktop event loop and bound rendered content.
