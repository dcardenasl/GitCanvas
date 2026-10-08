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
- Theme preference is window-level, persisted locally, defaults to dark, and can follow the operating system.
- Sans: `ui-sans-serif`, `system-ui`, `-apple-system`, `Segoe UI`, sans-serif. Code and
  SHAs: `ui-monospace`, JetBrains Mono, SF Mono, Menlo, monospace.
- Controls: 7px corner radius, 13px text, explicit hover/focus/disabled states.

## Interaction

Operate mode. Open repository is the primary entry. Branches and tags are navigation
into history, and selecting a commit reveals its metadata and diff. Errors and loading
states occupy their own region without replacing successful repository data. Keyboard
navigation, visible focus and descriptive accessible names accompany all controls.

## Platform behavior

The product is a desktop Tauri application for macOS, Linux, and Windows. The layout is
designed for the 940×600 minimum window; there is no separate responsive web or mobile
layout. No decorative cards, marketing header, fake traffic lights or mock profile
identity.
