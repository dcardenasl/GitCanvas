# Design

The application window in `docs/mockup.html` is the existing, user-approved visual
reference. This implementation extends that design; it does not introduce a new identity.

## Surface and hierarchy

Dense desktop Git workspace: compact toolbar, 220px branch sidebar, flexible history
and a 310px inspector when a commit is selected. One vertical scroll owner contains
virtualized commit rows and their SVG graph. Row height is 40px. Preserve horizontal
space for the commit message; allow horizontal graph scrolling for many lanes.

## Tokens

- Background: #10131a; sidebar: #14161d; toolbar: #12141b.
- Controls: #171a22; borders: #262b38; subtle dividers: #1c2029.
- Primary text: #d3d6e0; secondary text: #a1a9bc (raised from the mockup for contrast).
- Accent: #f0a63e, with dark #1a1206 foreground on filled buttons.
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
