# ADR 0005: Syntax highlighting in file previews

## Status

Accepted

## Decision

**Where.** Diffs and whole-file previews color the code they show. Highlighting is
presentation, so it lives in the frontend (`src/components/DiffViewer/`); the Rust
engine neither knows nor needs a language. Content is never withheld or altered: a file
the highlighter cannot or should not handle renders as plain text.

**Engine.** `refractor` (Prism's grammars as pure data transforms, no DOM) tokenizes
the text. Only the grammars the application registers are bundled, and only inside
the worker's bundle, so the main bundle carries none of them.

**One registry of languages.** `SYNTAX_LANGUAGES` in `language.ts` lists each language
with the file extensions that select it; `SyntaxLanguage` is derived from it. The
grammar table in `syntax.ts` is a `Record<SyntaxLanguage, Syntax>`, so a language
without a grammar fails the type check. A language is chosen only from the final
extension of the path; there is no content sniffing. Adding one is a registry entry,
a grammar import and, if it emits a scope not yet mapped, a line in the scope table.

**Categories, not colors.** Prism scopes fold into 13 semantic categories
(`SYNTAX_CATEGORIES`). Each category is a `.syntax-token--<category>` rule that reads a
`--syntax-<category>` token, defined per theme in `App.css`. A test fails when a category
lacks its rule or either theme color, or when a rule exists for a category the
highlighter cannot emit. Palette values were checked at 4.5:1 or more against the plain,
added and deleted row backgrounds of both themes.

**Off the interface thread.** Tokenizing runs in a dedicated Web Worker so a large file
cannot freeze scrolling or input. The client (`highlightClient.ts`) runs jobs one at a
time; a job whose consumer left is dropped from the queue without running, and aborting
the running job ends the worker, which the next job restarts. A crash rejects only the
running job. Every failure resolves to plain text. The worker is built as a classic
(IIFE) script because the declared macOS minimum ships a WebView without module
workers, and it is served from the application's own origin, which the existing
`script-src 'self'` policy already covers.

**Bounds.** Highlighting applies up to 5 000 rows and 2 MiB of text per preview
(`SYNTAX_HIGHLIGHT_LINE_LIMIT`, `SYNTAX_HIGHLIGHT_CHARACTER_LIMIT`). Past either, the
file stays plain text, so grammar cost has a ceiling independent of file size.

**Diff semantics.** A patch shows hunks, not files, so each hunk is tokenized as two
independent sequences: context and deleted rows as the old side, context and added rows
as the new side. A construct that opens before a hunk starts (a block comment, a
template string) is therefore not known inside it. That is accepted: it can miscolor
the first rows of a hunk, never change their text, and the whole-file view is exact.

## Consequences

The worker needs a real browser engine to run, which unit tests cannot provide. Its
logic is split so the tested parts are the real ones — `runHighlightJob` for tokenizing
and `createHighlightClient` for scheduling, with a fake worker — and an end-to-end
check asserts that tokens appear in the packaged application. One packaging detail is
pinned in `vite.config.ts`: `decode-named-character-reference`, a dependency of the
grammar library, resolves to a DOM-based entry for the "browser" condition and throws
in a worker, so the build aliases it to its pure-JavaScript entry. Upgrading
`refractor` should re-check that alias.

Highlighting is limited to the registered languages; others show as plain text, which
is a correct result rather than a degraded one.
