---
target: GitCanvas file diff reading and line wrapping
total_score: 31
max_score: 40
na_heuristics: ""
p0_count: 0
p1_count: 1
timestamp: 2026-10-13T22-05-44Z
slug: src-components-filediffview-filediffview-tsx
---
Method: dual-agent (A: /root/design_review · B: /root/detector_browser)

# Critique: GitCanvas file diff reading

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3/4 | The wrap button exposes `aria-pressed`, but its selected state is visually weak. |
| 2 | Match System / Real World | 4/4 | Added/deleted markers, old/new line numbers, and `+`/`−` match familiar Git diff conventions. |
| 3 | User Control and Freedom | 3/4 | Users can switch between diff and whole-file modes and toggle wrapping; the wrap choice is transient. |
| 4 | Consistency and Standards | 3/4 | The compact controls fit the desktop workspace; coloring every character in changed lines makes code unusually dominant. |
| 5 | Error Prevention | 3/4 | No destructive action is involved, but long lines can run beyond the visible highlight and invite mistaken reading. |
| 6 | Recognition Rather Than Recall | 4/4 | The path, commit, mode labels, stats, markers, and line numbers are visible in context. |
| 7 | Flexibility and Efficiency | 3/4 | Wrapping can be changed, but it starts off and adds a corrective click before reading long lines. |
| 8 | Aesthetic and Minimalist Design | 3/4 | The diff stays focused and the header is compact; semantic text color competes with the content itself. |
| 9 | Error Recovery | 3/4 | Users can return to the graph or change views; oversized diffs have a separate explanatory state. |
| 10 | Help and Documentation | 2/4 | Labels are understandable, while wrapping guidance depends on a tooltip. |
| **Total** | | **31/40** | **Good (78%)** |

## Design Specificity Verdict

The surface feels authored for GitCanvas: the selected file path and commit, unified diff, old/new line numbers, and compact graph-oriented toolbar serve the product's core task. It is not a generic code editor. The strongest opportunity is to make the first view readable without sacrificing the familiar red/green change map.

The deterministic Impeccable detector returned `[]` for the FileDiffView and DiffViewer markup. It found no automated pattern violations. The supplied screenshots show the relevant live diff state. A separate fresh browser tab could only reach the empty repository screen, so no reliable browser overlay is available; the native app and its source were used for the visual assessment.

## Overall Impression

The structure communicates what changed and where. With wrapping disabled, long lines continue past the viewport while the colored row highlight ends at the viewport edge, producing the visible mismatch in the screenshot. The main fix is to make line wrapping the default. The next improvement is to keep the semantic background but let the code text use the normal theme foreground.

## What's Working

- The path and commit summary stay next to the diff, so users can verify which revision they are reading.
- Real old/new line-number cells preserve alignment and let users select code without copying the numbers.
- The two display modes and wrap toggle keep useful choices close to the file content, with Spanish and English labels.

## Priority Issues

- **[P1] Long changed lines escape their highlight.** `FileDiffView` initializes `wrap` to `false`, and the non-wrapped text preserves whitespace on one line. In the supplied screenshot, text continues across the viewport while the green background stops at its edge. This makes the diff harder to scan and the semantic highlight appear broken. **Fix:** default wrapping on and keep the toggle for users who prefer horizontal scanning. Suggested command: `$impeccable polish`.
- **[P2] Green/red foreground competes with code reading.** The row already has a green/red surface, and the entire line also receives a green/red foreground. This keeps the change status prominent but colors every character in long prose or code. **Fix:** retain the subtle semantic row surface, use the ordinary theme-aware text color for the code, and reserve strong green/red for the `+`/`−` marker and optionally the gutter. Suggested command: `$impeccable colorize`.
- **[P2] White text cannot be used on the current light-theme fills.** Approximate WCAG contrast calculations from the existing tokens give white text about 14.8:1 / 15.9:1 on the dark added/deleted surfaces, but only 1.24:1 / 1.25:1 on the light surfaces. The light-theme green/red foreground currently reaches approximately 4.66:1 / 4.53:1, just over the 4.5:1 normal-text target. **Fix:** do not set white text globally. If white text is preferred, design opaque, sufficiently dark green/red fills for both themes and check the contrast after compositing. Suggested command: `$impeccable colorize`.
- **[P2] The wrap toggle has a weak visual on/off cue.** `aria-pressed` exposes its state to assistive technology, but the control in the screenshot does not make the active state obvious. **Fix:** give the pressed state a clear but restrained selected treatment consistent with other controls. Suggested command: `$impeccable polish`.

## Persona Red Flags

- **Alex (Power User):** Opening a file with wrap off requires a manual correction on wide or long-line diffs. Keeping the toggle preserves the option to scan intentionally unwrapped code.
- **Riley (Deliberate Stress Tester):** A long Markdown paragraph or generated line demonstrates the highlight/text width mismatch immediately. A light theme also reveals that white text over the current pale green/red fill is illegible.

## Cognitive Load and Emotional Journey

The header presents two clear choices (diff vs. whole file, wrapping on vs. off) plus the change count; cognitive load is low. The reading journey has one early valley: long lines can force horizontal scrolling before the content becomes legible. Starting wrapped removes that friction. A strongly colored solid fill on every changed line could make the diff feel more urgent than the content warrants.

## Minor Observations

- Unified diff represents a modified line as a deleted line followed by an added line; there is no independent “modified” row class. Keep that red/green pair rather than introducing a third color without a separate meaning.
- The diff is rendered as a line grid; wrapping increases vertical height for long lines. This is a reasonable trade for prose and ordinary source files, while the existing toggle preserves an escape hatch for very long or generated content.
- Tooltip-only help can be missed by keyboard and touch users; the pressed state should carry most of the explanation.

## Questions to Consider

- Should wrapping remain a session-level display choice, or should the user's last choice persist across files and launches?
- For generated or minified files, would an explicit “very long line” affordance be clearer than disabling wrapping globally?
