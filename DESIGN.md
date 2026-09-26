# Design

The application window in `docs/mockup.html` is the existing, user-approved visual
reference. This implementation extends that design; it does not introduce a new identity.

## Surface and hierarchy

Dense desktop Git workspace: compact toolbar, 220px branch sidebar, flexible history
and a 310px inspector when a commit is selected. One vertical scroll owner contains
virtualized commit rows and their SVG graph. Row height is 40px. Preserve horizontal
space for the commit message; allow horizontal graph scrolling for many lanes.

## Tokens

- Dark theme: background #10131a; sidebar #14161d; toolbar #12141b; controls #171a22; borders #262b38; text #d3d6e0.
- Light theme: background #f7f6f3; sidebar #f0efeb; toolbar #fbfaf8; controls white; borders #d9d6d0; text #25232c.
- Orchid remains the brand accent (#c4a3ff dark, #6941a5 light); selected rows use a subtle violet tint in both themes.
- Green and red remain reserved for added and removed code; graph lane hues stay stable and receive a subtle surface outline for separation.
- Theme preference is window-level, persisted locally, defaults to dark, and can follow the operating system.
- Sans: Hanken Grotesk, system-ui fallback. Code and SHAs: JetBrains Mono, monospace.
- Controls: 7px corner radius, 13px text, explicit hover/focus/disabled states.

## Interaction

Operate mode. Open repository is the primary entry. Branches and tags are navigation
into history, and selecting a commit reveals its metadata and diff. Errors and loading
states occupy their own region without replacing successful repository data. Keyboard
navigation, visible focus and descriptive accessible names accompany all controls.

## Responsive behavior

Keep the graph and commit message usable at the desktop window minimum. On narrower
browser previews, collapse supporting navigation and show the inspector beneath history.
No decorative cards, marketing header, fake traffic lights or mock profile identity.
