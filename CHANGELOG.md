# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Commit graph.** The history view draws branch lanes and merge curves in SVG
  over a virtualized commit table, sharing one scroll container so the graph can
  never drift out of step with its rows. Lane colours are a deterministic
  function of lane index, so they never change between renders.
- **Resumable graph layout.** `layout(commits, previousState)` extends a
  topologically ordered stream without rewriting earlier rows, so loading the
  next page of history leaves the lanes already on screen exactly where they
  were.
- **Cursor-paginated history.** The view loads 500 commits at a time and
  requests the next page as the tail comes into view, so a repository with a
  hundred thousand commits opens as fast as one with fifty.
- **Repository navigation.** A native folder picker opens a local repository,
  and the sidebar lists local branches, remote branches and tags, marking the
  checked-out branch.
- **Git data engine** — Open canonical working repositories, including linked worktrees, and browse topological history with stable cursor pagination, local/remote branches and annotated tags.
- **Repository diagnostics** — Structured errors and rotating JSON logs report failures while Git operations run outside the UI thread.
