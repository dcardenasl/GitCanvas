# ADR 0010: Image viewing

## Status

Accepted and implemented — 2026-11-15. Published in v0.8.0. Delivery evidence and platform limits are in the
[v0.8 verification record](../verification/v0.8.md). Decisions, bounds, acceptance
matrix and task order remain in the [implementation plan](../plan/2026-11-15-v0.8-implementacion.md).

## Context

The viewers for commits, per-file history, local changes and stashes share one content
policy (`blob::read_content`, ADR 0002): binary content is never returned and shows a
notice. For design, mobile and game repositories many changes are images, so those
changes look empty. The roadmap adds image viewing as v0.8: common formats, SVG without
running scripts, previous/saved comparison, dimensions and size, read-only, within the
existing budgets.

Constraints already in force: the production CSP allows `img-src 'self' data:` and
nothing else for images; `gitcanvas-core` never depends on `tauri`; reads go through
`runtime::read` and `with_repo`; the engine denies `unwrap`/`expect`/raw indexing;
`bindings.ts` is generated; repository content is untrusted.

## Decision

### Decode in the WebView, never in Rust

Rust only **recognises** and **bounds** an image. It reads the leading bytes to decide the
format, reads dimensions from the header, applies the byte and pixel budgets, and returns
the exact bytes as base64. It never decodes pixels and never parses SVG. Decoding is the
WebView's job, in its own sandbox. A decoding crate (`image`, `png`, `jpeg-decoder`) is
rejected: it would add a large attack surface in the privileged process for no gain.

### Format from bytes, MIME from the detected format

The format comes from signatures in the first bytes. The file extension is used only by
the frontend to decide whether to *ask* (so every text file is not read as a possible
SVG); Rust always decides what the bytes are. The MIME type used in the `data:` URL comes
from a fixed table keyed by the detected format, never from the path or repository text.

### One byte policy, no copy of the limits

`blob.rs` exposes one bounded raw read (2 MiB initial, 32 MiB explicit, hard cap with
`ResourceLimitExceeded`) used by both the text reader and the image reader. Disk reads
keep the ADR 0002 confinement and `stat → read → stat`; the image path reuses them and
adds no second implementation.

### SVG as an isolated image

SVG is shown only through `<img src="data:image/svg+xml;base64,…">`. In that context
engines run no scripts and fetch no external resources, and the CSP (`script-src 'self'`,
`img-src 'self' data:`) backs it. The content is never inserted into the DOM, an
`<object>`, `<embed>`, `<iframe>`, or parsed in JavaScript. It stays available as text
through the existing path. `.svgz` is not supported.

### One command per source and per version

`get_commit_image`, `get_worktree_image` and `get_stash_image` each return one version
(`previous` or `saved`) as a tagged outcome (`missing`, `unsupported`, `not_image`,
`too_large`, `withheld`, `image`). Two small responses beat one large one: a 32 MiB image
is about 43 MB of base64, and an explicit "load full" must pay only for the version the
user asked for. Local-change reads carry the snapshot revision on every request.

### Pixel ceiling

Images over 40 megapixels, or with a valid signature but an unreadable header, are not
delivered; the response carries metadata only. This bounds the decompression-bomb risk
that byte budgets alone cannot. A lying header can still make the WebView allocate more:
this is a declared limit, not a guarantee.

### Bounded animation

Animated GIF, APNG and WebP are flagged structurally in Rust. GIF detection walks its
blocks and counts image descriptors; APNG checks `acTL` before `IDAT`; WebP checks the
animation bit. The WebView animates while mounted, starts paused under
`prefers-reduced-motion`, and always offers play/pause. Rust does not decode frames.

### Memory

Image queries use a short `gcTime`, no refetch on focus, no structural sharing, and carry
the repository root at `queryKey[1]`, so tab close and the inactive-project LRU release
them with the existing helpers.

## Consequences

- No CSP change and no new Tauri capability; the existing attack surface for resources
  does not grow.
- Header dimensions use bounded local parsers; no image decoder or `imagesize` dependency
  was added. `base64` is a direct core dependency. `cargo deny` and `cargo audit` pass
  with the existing dependency-policy warnings recorded in the verification report.
- A file between 2 and 32 MiB is shown as "too large" until the user asks for it, like
  text; the format cannot be known without reading it, and the budget forbids reading it
  first.
- Support depends on the platform WebView (for example WebP in older WebKitGTK); an
  undecodable image shows an explicit notice, never a broken image.
- Dimensions are the stored size. EXIF orientation is applied only when painting.
- Other binary files keep today's notice. PDF, audio, video, design formats and 3D models
  are separate decisions.
