# ADR 0004: Interface language, catalogs and structured errors

## Status

Accepted

## Decision

**Engine.** The interface uses `i18next` with `react-i18next`. Catalogs are JSON
files bundled with the application, one folder per language under
`src/i18n/locales/` and one namespace per feature area (`shell`, `history`,
`files`, `refs`, `git`, `github`, `errors`, `common`). Keys are typed from the English
catalogs through `CustomTypeOptions`, so a missing or mistyped key fails the type
check.

**One registry.** `src/i18n/languages.ts` lists every language once: BCP 47 code,
native name, text direction and its catalogs. English is the base catalog and the
fallback for any missing key. Adding a language is one folder of catalogs and one
registry entry; no component, store or selector names a language.

**Choosing the language.** The preference is `system`, or one registered code. `system`
matches the operating system's locales in order and falls back to English. The
preference is resolved while the `i18n` module is evaluated, before React renders, so
the first frame is already in the right language. Changing it switches at once
without a reload, keeps drafts, selection and open repositories, and updates `lang`
and `dir` on the document.

**What is translated.** Everything the application writes: labels, menus, states,
errors, confirmations, tooltips, accessible names and the dialogs it controls.
Never translated: paths, Git refs, names, commit messages and file contents.
Dates, numbers, percentages, sizes and plurals use the active locale through
`Intl` (i18next's `number` format and plural rules); no code concatenates a
count with a word.

**Errors.** Rust keeps returning `AppError { kind, message }`. The frontend translates
the `kind` into a summary (`errors:kind.*`) and `ErrorMessage` keeps the backend's
English diagnostic behind an expandable, copyable detail. State never holds a
translated sentence: it holds the failure (`unknown`) or a code with parameters
(`NoticeContent`), and the text is composed when it renders, so a message already on
screen follows a change of language.

**Enforced by the build.** `vitest` checks that every language has exactly the keys
and namespaces of the base catalog, the same interpolation variables and rich-text
tags, every plural category its `Intl.PluralRules` require, and a summary for every
`AppError` kind. A test parses the components and fails on any literal user-facing text
in JSX or in `aria-label`, `title`, `placeholder` or `alt`. New components use CSS
logical properties, which a test checks for the stylesheets written so far.

## Consequences

A new language costs catalogs and one registry line, and CI says what is missing. The
catalogs ship in the main bundle, which keeps startup synchronous at the price of
size growing with each language; if that ever matters, loading per language is a
change inside `src/i18n/index.ts` only. Interpolation variables are not typed per key,
so their parity across languages is checked by tests rather than by the compiler.
Right-to-left support is prepared (direction in the registry, logical properties in
new components) but the older stylesheets still use physical properties and need
migrating before an RTL language is registered.
