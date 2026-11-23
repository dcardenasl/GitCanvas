# ADR 0015: Compact release navigation and central inspection

## Status

Accepted and implemented — 2026-11-23. Records David's requested UI/UX refinement: list releases
without descriptions in the sidebar, open their full content and attachments in
the main pane, emphasize the latest release, and allow the Authors section to
fold. This supplements [ADR 0012](0012-releases-tag-fetch-and-downloads.md) and
[ADR 0013](0013-release-asset-discovery-and-resolution.md). It proposes replacing
CR-D04's combined sidebar list and the presentation rule that releases never
enter navigation state; their data, security and resource contracts remain in
force. Implementation evidence is in the CR-17 plan and
[`docs/verification/cr-17-qa.md`](../verification/cr-17-qa.md). This decision
does not claim publication or verification on every supported platform.

## Context

`TagsReleasesPanel` currently renders release names, tags, availability, notes,
actions and attachments inside the branch sidebar. That competes with reference
navigation for a narrow column, while local tags also appear in References.
`AuthorPanel` has its own heading and no disclosure, unlike the reference,
worktree and stash sections.

The workspace already keeps each tab's transient inspection state separate from
its durable Git selection. `StashView` provides an example of an inspection over
the underlying graph selection. `workspaceRecord` explicitly serializes the Git
selection, history anchor and collapsed file folders; `restoreTab` starts from
`EMPTY_NAVIGATION`. Durable sidebar folding already uses bounded, worktree-scoped
`referenceTreePreferences`. No base repository or `BASE_VERSION` is present.

Release-list responses already contain bounded plain-text notes and matching
local-tag information. Asset discovery is a dedicated metadata query keyed by
repository root and exact release ID. Neither the DTO nor the version-1 cache
contains GitHub's explicit latest-release designation.

## Decision

**Navigation and content.** References continues to list local Git tags. A
separate Releases section lists published release rows with compact identity
and state chips; descriptions, tag-fetch controls and attachments belong to the
central release view. Unmatched local tags do not appear a second time in that
section. A row is a keyboard-operable control with a visible selected state,
using the existing sidebar typography, spacing, focus and color tokens.

Selecting a release opens a session-only inspection owned by the originating
canonical worktree root and exact release ID. It shows the release name and tag,
publication date when supplied, stable/prerelease state, local-tag availability,
bounded notes, attachment metadata and the existing explicit actions. Empty,
loading, cached, truncated, unavailable and recoverable error states remain
visible. Hide the unrelated commit inspector while inspecting a release so its
metadata cannot be mistaken for release content. Keep the sidebar accessible.

Reuse the workspace's root-bound pure navigation transitions. Opening a release
does not change the underlying Git selection, graph anchor, search, reference
filters or graph geometry. Release, file-history and stash inspection have one
active presentation at a time. A deliberate Git navigation action exits release
inspection. Provide a visible return-to-history action and Escape behavior that
respects active menus and dialogs. Returning restores the underlying Git context
and focus to the originating release row, with the Releases disclosure as a
fallback when that row is unavailable or folded.

Do not add a release variant to persisted `SavedSelection`, persist release
objects or credentials, or migrate the workspace/cache schema. Tab switching
keeps each tab's transient selection independent; restoring the app starts in
the previously persisted Git context. A refreshed list must reconcile by ID;
if the selected release is no longer listed, show an unavailable state and a
way back rather than silently selecting another release. Async results remain
bound to their originating root and release.

**Most recent chip.** The existing metadata supports a truthful “Most recent”
indicator: among listed non-prerelease releases with valid `published_at`, mark
the one with the greatest publication timestamp. Preserve source list order as
a deterministic tie breaker. Do not compare tag names as semantic versions or
coerce provider IDs into JavaScript numbers. If no stable release has a valid
publication date, omit the chip. Cached/truncated-list notices qualify the
available data. This is a presentation derived from the loaded catalog, not a
claim about GitHub's separately configurable Latest designation.

**Attachments and actions.** Opening the central view may discover attachment
descriptors through `get_release_assets`; it never downloads attachment bytes or
fetches a tag automatically. Use one repository/release-keyed discovery result
for that view. Display filenames, exact sizes and available integrity metadata
without accepting URLs, destinations or integrity claims from the webview.
Downloads retain fresh Rust membership resolution, the native destination
dialog, progress, cancellation and all ADR 0012/0013 bounds. Selection changes
must not initiate, replay or silently cancel a transfer. A transfer's recorded
status remains associated with its exact root/release/asset identity.

Notes remain bounded plain text at the IPC boundary, with the existing truncation
mark, and are rendered as CommonMark/GFM in the main pane. Raw HTML and images are
not rendered. HTTPS links appear with an underline and keyboard focus, and open
only after explicit activation in the operating system's default browser. All
HTTPS hosts are allowed because the release author controls the destination; the
Rust command independently parses the destination, requires HTTPS, rejects
embedded credentials, control characters and overlong input, then calls the
native opener. The webview never creates an anchor or navigates to the URL. Relative
destinations resolve against the release's HTTPS GitHub page before they reach
Rust. Non-HTTPS destinations remain visible as selectable text. Opening a link
does not create an in-app network request. Failures stay in the release view with
a localized summary and the diagnostic available to copy. This preserves the
inert-content rule while making headings, lists, tables, quotes and code readable.
The renderer does not accept markup from outside the existing release-notes field.
Recovery UI preserves the existing pending-action rules and clears entered
tokens when its context disappears. Authentication never replays a download;
the user chooses Download again to open the native destination flow.

**Section folding.** Authors and Releases use the same disclosure presentation,
`aria-expanded`, `aria-controls` and focus behavior as neighboring sections.
Store folding under `section:authors` and `section:releases` in the existing
bounded `referenceTreePreferences`, scoped by worktree. Include both in the
sidebar's expand/collapse-all actions. Folding Authors preserves the selected
author and its graph emphasis; folding Releases preserves an open central
inspection. Hidden section controls leave the keyboard tab order.

## Verification requirements

- Sidebar lists release identities/chips only; local tags remain in References.
  Long names, empty lists, source errors, cache and truncation stay legible at
  the 940×600 minimum and within the existing sidebar width bounds.
- Selection displays the matching release and attachments in the main pane;
  unrelated commit content is hidden. Return, Escape, focus recovery, Git
  navigation and tab switching preserve the correct underlying Git context.
- Workspace serialization excludes release inspection, notes, descriptors,
  pending actions and credentials. Existing saved records restore unchanged.
  Fold state survives closing/reopening a worktree and stays isolated by root.
- Most-recent selection covers prereleases, invalid/missing dates, date order,
  ties, all-prerelease catalogs, cache and truncated catalogs. Strings retain
  exact release/asset IDs, including values above JavaScript's safe integers.
- Notes containing markup remain text; opening/folding/selecting never fetches
  Git tags or binary assets. Discovery, retries, downloads, cancellation and
  access recovery retain the existing identity and explicit-action contracts.
- Exercise every sidebar section with keyboard and pointer in English/Spanish
  and both themes, including selected, folded, empty, loading and error states.
  Record native-dialog and real screen-reader gaps without inferring coverage
  from component tests or visual inspection.

## Consequences

The sidebar becomes a compact navigation surface and the main pane gives notes
and attachments the room needed for inspection. Authors gains the same durable
folding behavior as neighboring sections without a persistence migration. The
cost is a new transient navigation mode, focus restoration and stale-selection
handling. Existing Git data, release cache, credentials and download contracts
remain reusable.

GitHub's explicit Latest badge can differ from the most recent publication.
Matching that provider designation precisely would require a separate metadata
contract/API decision; it is not inferred from the current DTO.
