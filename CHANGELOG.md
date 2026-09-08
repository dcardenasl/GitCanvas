# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Git data engine** — Open canonical working repositories, including linked worktrees, and browse topological history with stable cursor pagination, local/remote branches and annotated tags.
- **Repository diagnostics** — Structured errors and rotating JSON logs report failures while Git operations run outside the UI thread.

### Performance

- **HistoryReader** — Reuse immutable traversal snapshots within a bounded LRU cache to avoid rewalking the entire history on each page.
