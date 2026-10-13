/**
 * Every language the file preview can highlight, with the final file
 * extensions (lowercase, no dot) that select it. This is the single list:
 * `SyntaxLanguage` is derived from it, and `syntax.ts` must provide a grammar
 * for each entry or the type check fails.
 */
export const SYNTAX_LANGUAGES = [
  { id: "css", extensions: ["css"] },
  { id: "javascript", extensions: ["js", "mjs", "cjs"] },
  { id: "json", extensions: ["json"] },
  { id: "jsx", extensions: ["jsx"] },
  { id: "markdown", extensions: ["md", "markdown"] },
  { id: "markup", extensions: ["html", "htm"] },
  { id: "php", extensions: ["php"] },
  { id: "rust", extensions: ["rs"] },
  { id: "typescript", extensions: ["ts", "mts", "cts"] },
  { id: "tsx", extensions: ["tsx"] },
] as const;

/** Languages explicitly supported by the file preview. */
export type SyntaxLanguage = (typeof SYNTAX_LANGUAGES)[number]["id"];

/** Maximum rendered rows for which the viewer performs syntax tokenization. */
export const SYNTAX_HIGHLIGHT_LINE_LIMIT = 5_000;

/** Maximum UTF-16 code units tokenized in one preview to bound the work. */
export const SYNTAX_HIGHLIGHT_CHARACTER_LIMIT = 2 * 1024 * 1024;

const EXTENSION_LANGUAGE: ReadonlyMap<string, SyntaxLanguage> = new Map(
  SYNTAX_LANGUAGES.flatMap(({ id, extensions }) =>
    extensions.map((extension) => [extension, id] as const),
  ),
);

/** Resolves a supported syntax only from the final, case-insensitive extension. */
export function syntaxLanguageForPath(path: string): SyntaxLanguage | null {
  const basename = path.slice(path.lastIndexOf("/") + 1);
  const separator = basename.lastIndexOf(".");
  if (separator <= 0 || separator === basename.length - 1) return null;
  const extension = basename.slice(separator + 1).toLowerCase();
  return EXTENSION_LANGUAGE.get(extension) ?? null;
}

/** Whether a recognized source path fits within both tokenization budgets. */
export function canHighlightPath(
  path: string,
  lineCount: number,
  characterCount: number,
): boolean {
  return (
    lineCount <= SYNTAX_HIGHLIGHT_LINE_LIMIT &&
    characterCount <= SYNTAX_HIGHLIGHT_CHARACTER_LIMIT &&
    syntaxLanguageForPath(path) !== null
  );
}
