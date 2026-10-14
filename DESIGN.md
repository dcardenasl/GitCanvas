# Design

The application window in `docs/mockup.html` is the visual reference. Preserve its compact
Git workspace while carrying the GitCanvas orchid identity through purposeful UI accents.

## Surface and hierarchy

Dense desktop Git workspace: compact toolbar, 220px branch sidebar, flexible history
and a 310px inspector when a commit is selected. Sidebar width is bounded to 160–420px;
inspector width to 240–620px; history keeps at least 360px. The Tauri window minimum
is 940×600. One vertical scroll owner contains virtualized commit rows and their SVG
graph. Row height is 40px. Preserve horizontal space for the commit message; allow
horizontal graph scrolling for many lanes.

## Tokens

- Dark theme: background #10131a; sidebar #14161d; toolbar #12141b; controls #171a22; borders #262b38; text #d3d6e0.
- Light theme: background #f7f6f3; sidebar #f0efeb; toolbar #fbfaf8; controls white; borders #d9d6d0; text #25232c.
- Orchid remains the brand accent (#c4a3ff dark, #6941a5 light); selected rows use a subtle violet tint in both themes.
- Green and red remain reserved for added and removed code; graph lane hues stay stable and receive a subtle surface outline for separation.
- Code colors: 13 semantic tokens (`--syntax-keyword`, `--syntax-string`, …), each defined
  in both themes and checked at 4.5:1 or more over plain, added and deleted rows. Added and
  deleted rows keep their green and red as a row surface and marker; the text itself uses
  the ordinary ink so the code, not the change status, carries the color.
- Brand artwork: the wordmark is white on the dark theme and near-black on the light one;
  the mark is shared. Files are exported at up to 4× their drawn size.
- Theme preference is window-level, persisted locally, defaults to dark, and can follow the operating system.
- Sans: `ui-sans-serif`, `system-ui`, `-apple-system`, `Segoe UI`, sans-serif. Code and
  SHAs: `ui-monospace`, JetBrains Mono, SF Mono, Menlo, monospace.
- Controls: 7px corner radius, 13px text, explicit hover/focus/disabled states.

## Interaction

Operate mode. Open repository is the primary entry. Branches and tags are navigation
into history, and selecting a commit reveals its metadata and diff. Errors and loading
states occupy their own region without replacing successful repository data. Keyboard
navigation, visible focus and descriptive accessible names accompany all controls.
Every label is translated and may grow by half in another language, so controls size
to their text; new components use logical CSS properties so the layout can mirror for
right-to-left languages. Window-level preferences (theme, language) live behind one
toolbar button so the toolbar stays on one row at the 940px minimum.

## Project navigation

A compact tab row sits above the toolbar. The active tab uses the ordinary surface,
favorites use the orchid star, and close, open and overflow controls retain the same
focus and hover treatment. Long names truncate inside the tab, with the full path in
the tooltip; duplicate names include their containing folder. Pointer dragging and
keyboard reordering share the workspace actions. Tabs show only writing, unverified
or inaccessible status, and the unverified mark stays quiet; inactive Git metadata is never
presented as current. A context menu on a tab lists close, close others, close to the right
and copy path; entries show their shortcut in a quiet `kbd` and group with separators. The
open menu groups folder and GitHub actions apart from favorites, recents and reopening the
last closed tab. While a folder is dragged over the window, a centered notice invites to
drop it.

The opening menu and empty screen expose folder opening, GitHub, favorites and recent
projects. Project lists use plain rows with wrapping paths and accessible favorite
controls, rather than cards or a modal. Recovery replaces the inaccessible repository
view with Retry, Locate and Close. Storage errors occupy a wrapping banner above the
workspace and retain their original diagnostic. All new styles use logical properties
and are checked in both themes at the 940×600 window minimum.

## File previews

Long lines wrap by default, and the toggle shows its pressed state with the accent. Code is
colored only for the registered languages and within the size budgets; everything else is
plain text and equally complete. See [ADR 0005](docs/adr/0005-syntax-highlighting.md) for
how to register a language.

## Platform behavior

The product is a desktop Tauri application for macOS, Linux, and Windows. The layout is
designed for the 940×600 minimum window; there is no separate responsive web or mobile
layout. No decorative cards, marketing header, fake traffic lights or mock profile
identity.
