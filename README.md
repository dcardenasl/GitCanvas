# GitCanvas

A visual Git client focused on one thing: reading the branch and commit graph of a
repository at a glance. Open a local repository (or clone one from GitHub) and walk
its history branch by branch.

GitCanvas does not try to replace a full Git client. It solves the part that carries
the most value — seeing the shape of the history — and solves it well.

## Status

**v0.1.0** — the MVP is complete: local history with a resumable commit graph,
commit diffs, GitHub cloning, and guarded checkout, pull and push.

See [`CHANGELOG.md`](CHANGELOG.md) for what shipped, [`TASKS.md`](TASKS.md) for
how it was built, and
[`docs/plans/2026-09-08-plan-de-implementacion.md`](docs/plans/2026-09-08-plan-de-implementacion.md)
for the governing plan.

## Stack

| Layer | Choice |
|---|---|
| Shell | Tauri v2 |
| Git engine | Rust, `git2` (libgit2) with vendored libgit2 and OpenSSL |
| Type contracts | `tauri-specta` — Rust types generate `src/bindings.ts`, never hand-written |
| Graph layout | TypeScript, a pure function with no React, DOM or Tauri dependency |
| Render | SVG over row virtualization (`@tanstack/react-virtual`) |
| Frontend | React + TypeScript + Vite |

## Requirements

- Node >= 22
- Rust stable (`rustup`), with the `clippy` and `rustfmt` components
- Platform toolchain for Tauri v2 (Xcode Command Line Tools on macOS)

## Development

```bash
npm install          # also installs the git hooks via the prepare script
npm run tauri dev    # run the app
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run test         # vitest
cargo test           # Rust unit and integration tests
cargo clippy --all-targets -- -D warnings
```

## Known limitations

Documented on purpose rather than discovered later:

- Diffs are computed **against the first parent only**. Combined diffs for merge
  commits are out of scope for the MVP.
- `pull` is **fast-forward only**. Anything that needs a merge is reported, not
  resolved automatically.
- Cold topological reads of histories with many loose objects may exceed 300 ms;
  subsequent pages reuse a bounded SHA cache. Git reads run off the UI thread.
- Graph layout is optimised for the common case, not for histories with a very large
  number of simultaneously active branches.

## Contributing

This is a personal tool and is not open for contributions.

## License

**All rights reserved.** © 2026 David Cárdenas Lorca. Personal use only; no license
to use, copy, modify or distribute is granted.
