# ADR 0006: Workspace, tabs and persistence

## Status

Accepted — 2026-10-14

Extended by [ADR 0007](0007-stable-branch-graph.md), 2026-10-19: schema 2 and graph
preferences that outlive tab closure.

## Decision

**Identity and state.** The canonical worktree root (`RepositoryInfo.path`) identifies a
tab. Aliases of the same root activate the existing tab; linked worktrees are distinct
projects. `state/workspace.ts` composes the store from slices in `state/workspaceStore/`
(tabs, library, view, storage, limits and closed tabs); each slice updates the state with
a single atomic `set`, and the rules between slices are pure functions. It coordinates
order, the active tab and sessions; `navigation.ts` holds pure transitions. Each session
keeps its selection, search, folders, anchor, expansion and action state. Callbacks are
bound to the root that started them, so switching tabs never redirects a response or a
notice to another project. A tab with a write in progress cannot be closed.

**Opening and authorization.** A local folder, a clone, recents and favorites all go
through `openProjectAt` and the open command; the startup argument returns the same
validated contract. Whatever is read from the store only restores presentation: it does
not authorize Git. Activation blocks writes synchronously, before React effects run, and
the executor itself rejects callbacks that were not verified. The root is reopened, a
stable identity is required, and the references and the local fingerprint are read before
actions are enabled. If they did not change, pagination is kept; if they did, it is
invalidated. The view waits before querying a restored project. A failure leaves a
recoverable tab with Retry, Locate or Close. Locating onto another open tab reuses that
tab and removes only the inaccessible one; changing root starts fresh navigation so the
previous project's selections are never attributed to the new one.

**Observation and resources.** Only the active tab has a watcher, a poller and observed
queries. Inactive tabs show their operational state and never present branches or local
changes as current. `ProjectCache` keeps the heavy data of the active tab and of the five
most recently used inactive ones, in addition to the queries' `gcTime`. References and the
fingerprint are lightweight; closing a tab removes every query for its root. The global
`HistoryReader` budget is unchanged: eight snapshots and two million ids.

**Store.** `gitcanvas-core/workspace` defines the schema, the validation and the exclusive
writer; Tauri only authorizes and plans IPC. `workspace.json`, versioned, lives in the
data directory. It is replaced atomically after writing and flushing a neighboring
temporary file. A monotonic revision stops a late save from overwriting a newer one. The
backend publishes the limits: thirty tabs, two hundred favorites, twenty recents; it also
validates paths, ids, folders and four MiB per file. Corrupt or future-version data is set
aside, keeping the three most recent originals, and its location is reported. A read or
save failure lets the app continue in memory and stays visible.

**What is remembered.** Tab order, the active tab, the selection of a commit/file or of
the local side, the history anchor, collapsed folders, favorites and recents. Git objects,
diffs, caches, pending operations and file expansion are not saved. Search and view
controls last for the in-memory session. Theme, language, panel sizes and list mode stay
in `localStorage`: the language has to be resolved synchronously before the first render.
Navigation is saved with a 300 ms debounce; structural changes are queued immediately. A
single writer also drains changes received during a save. Closing and a normal system exit
go through the flush; if it fails, the window stays open so the save can be recovered.
Exit has a deadline: the frontend acknowledges the close request
(`acknowledge_shutdown`) before flushing and, if it does not respond within three seconds,
a watchdog destroys the window so a blocked renderer cannot hold the app. A forced process
termination cannot run that flush and keeps the last complete file.

**Restoration and navigation.** The store is loaded before the interface mounts, and only
the active tab is validated initially. The others stay "unverified" until used, but all
their paths enter the clone-protection registry. The startup argument is added without
discarding the restoration; it yields if the person opened another project while it was
being resolved. An anchor that is not loaded does not cause hidden page reads. The detail
of a commit selected outside the walk is requested by id through the same authorized flow.
After a render failure, the recovery button restarts the native process from the last
durable state; reloading only the page would misalign the request sequences with Rust.

**Favorites and recents.** Favorites are independent of tabs, sorted by name, with a
folder or path to disambiguate. Recents are ordered by last use, never repeat favorites in
the presentation and cannot be reordered by hand. Trying to open an inaccessible path shows
the error and lets the person remove the entry. Only open tabs protect clones from
retention; an evicted favorite keeps its recoverable path. The entry whose common Git
directory is used by an external worktree and the container of nested projects are also
protected. While the protection is being synchronized, or a dependency cannot be resolved,
no cleanup happens. A repair also never replaces an entry used by an open project.
Retention and replacement hand the deletion to the registry through `RemoveGuard`: the
decision "nobody uses it" and the removal are a single step, with no window for a tab to
open it in between.

**Interface and menu.** A compact bar above the toolbar; each tab is a project, and the
"+" opens a folder, GitHub, favorites or recents. Pointer drag, keyboard with roving
focus, Alt+arrows to reorder and Delete to close. Ctrl+Tab and ⌘/Ctrl+1–9 cycle through
tabs; Ctrl+O/W on Windows and Linux respect text fields. On macOS a custom menu receives
⌘O and ⌘W, with labels from the active catalog; the system quit is routed to the close
with save. Everything uses the same workspace actions.

**Home.** The first tab is always Home: the opening screen with favorites and recents. It
is not a project; it is not saved, closed or reordered, and showing it does not change the
active tab, which is restored when it is chosen. While it is visible, Ctrl+W closes nothing
and whatever is specific to a project (name, refresh, search, actions) is not shown. It
replaces the favorites and recents views that had a "Back" button.

**Tab use cases.** A context menu (right click or the menu key) closes the tab, the others
or those to the right, and copies the path. Ctrl+Shift+T (⇧⌘T on macOS) reopens the last
closed tab with its selection and search; the closed-tab history is per session and
bounded. Dropping a folder onto the window uses the webview's drag event and goes through
`openProjectAt`: the dropped path does not grant access by itself. "Show in file explorer"
is left out on purpose: it would require launching processes or widening the webview's
permissions.

**Isolated verification.** The E2E suite uses repositories with an ownership marker and a
temporary data directory. Windows built with `e2e` use a private WebView: the Rust
directory alone does not isolate `localStorage`. Real sessions or preferences are never
reused or modified. Production installers include neither the WebDriver server nor the
private test mode.

## Consequences

Thirty tabs can keep lightweight sessions, while the heavy cache has an explicit limit.
The store assumes neither future permissions nor availability; recovering a path is still
an authorized open. Serialized writing keeps the final state predictable, but a system or
disk failure can prevent saving and is reported. The schema allows validated future
evolution, without silently adapting unknown versions. Staging and creating commits,
drafts and mutual exclusion between worktrees were assigned to v0.4 when this was
written and are now planned for v0.13 (see [ROADMAP.md](../../ROADMAP.md)); this delivery
does not introduce them.
