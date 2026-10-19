# ADR 0007: Stable branch trajectories and appearance

## Status

Accepted — 2026-10-19. Implemented in dev for the v0.4 delivery.

## Decision

Rust exposes one bounded `RepositoryRefsSnapshot`: branches, tags, resolved/symbolic
HEAD and sorted history roots. Branches include full upstream and symbolic target
identities. Two equivalent observations through one repository handle are required;
three unstable attempts produce a recoverable conflict. Broken symbolic defaults
remain explicit. No network is used. The old branch/tag commands were removed.

All reference consumers share one query. Activation explicitly refreshes it and
metadata observation includes local configuration. History requests use the snapshot's
frozen roots; query identities include those roots. Replacing roots releases obsolete
frontend walks for that project, rather than retaining generations until gcTime.
Unchanged roots retain pages. Core history cache budgets remain unchanged.

`lib/graph-layout` owns pure geometry. Its input is SHA/parents plus frozen reference
seeds and a principal identity, without IPC types, React, DOM or palette values.
Each pending trajectory retains a lane until its target commit arrives. Multiple
connections to one SHA remain independent until that node; first parents continue
their trajectory, additional parents open side trajectories. A merge with no surviving
side reference gets a deterministic synthetic trajectory, not a fictional branch name.
Lane zero is reserved for the visual principal, without an incoming phantom segment
before that trajectory starts. Topological order and one node per commit are preserved.
Checkpoints retain the complete frontier; appending pages never rewrites older rows.

Colors are named palette identities, not lane numbers. Configured upstream components
share a color while retaining independent trajectories. Explicit edits use a per-project
monotonic sequence; the latest wins when components are linked. Absent references retain
preferences. Automatic assignments reuse the fixed eight-pair palette without changing
existing choices. Color equality does not prove exclusive historical ownership.

Principal choice is independent of HEAD. Detection uses valid remote default aliases,
preferring origin and then an unambiguous destination. One local tracking that destination
is preferred; multiple candidates retain the remote as principal. Without reliable data,
a stable visual fallback is used and the user is invited to choose. A missing explicit
choice is retained with a recovery notice and resumes if it reappears.

The existing atomic, revision-ordered Rust writer stores schema 2. Version 1 migrates
in memory and is saved as version 2 on the next write. Graph preferences are indexed by
canonical worktree root independently of open tabs. Limits are 200 preference projects,
10,000 remembered references per project and the existing 4 MiB file bound; Rust publishes
the limits. Corruption, future versions and failures retain existing recovery behavior.
No stored path authorizes Git. Reconciliation checks that its source preferences are
still current before saving, so a later explicit edit cannot be overwritten by an effect.

The SVG contains only visible rows plus margin. Adjacent commits connect with one
node-to-node cubic, split exactly at the row boundary. This bypasses temporary frontier
lanes that would otherwise produce an outward-and-back bend. Tangents are vertical at
nodes and continuous at the split; the connection meets other trajectories only at its
destination node. Nonadjacent destinations retain their independent pending paths.
Routing consults the neighboring loaded rows even outside the mounted window, with
linear work in visible connections. When a page arrives, the preceding final half-row
may simplify; layout rows and lane reservations remain immutable. No extra page is read.
Other half-row paths have vertical endpoint tangents;
all outlines are drawn before colored connections, then nodes, avoiding endpoint gaps.
Rows remain 40 px, lane spacing 14 px and colored strokes 2 px. A single scroll owner
serves rows and graph. Palette edits change presentation; principal changes recompute
only loaded geometry, preserving navigation.

## Consequences

Branch menus expose appearance and existing checkout separately. Palette names, main,
HEAD and remote-default markers are localized and keyboard accessible. The graph remains
aria-hidden; named references and table rows carry semantics. No new Git writes, filters,
network queries, branch management or authors are introduced in this delivery.

Filters planned for v0.5 must operate on traversal roots independently of trajectory
identity/color. Actual filtered traversal behavior is not claimed as implemented here.
Migrating back to an older binary is not an in-place schema downgrade: its existing
future-version recovery policy applies. The original file is preserved by that policy.
