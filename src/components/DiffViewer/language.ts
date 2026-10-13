/** Languages explicitly supported by the file preview. */
export type SyntaxLanguage =
  | "css"
  | "javascript"
  | "json"
  | "jsx"
  | "markdown"
  | "markup"
  | "php"
  | "rust"
  | "typescript"
  | "tsx";

/** Maximum rendered rows for which the viewer performs syntax tokenization. */
export const SYNTAX_HIGHLIGHT_LINE_LIMIT = 5_000;

/** Maximum UTF-16 code units tokenized in one preview to bound main-thread work. */
export const SYNTAX_HIGHLIGHT_CHARACTER_LIMIT = 2 * 1024 * 1024;

const EXTENSION_LANGUAGE: Readonly<Record<string, SyntaxLanguage>> = {
  cjs: "javascript",
  css: "css",
  cts: "typescript",
  htm: "markup",
  html: "markup",
  js: "javascript",
  jsx: "jsx",
  json: "json",
  markdown: "markdown",
  md: "markdown",
  mjs: "javascript",
  mts: "typescript",
  php: "php",
  rs: "rust",
  ts: "typescript",
  tsx: "tsx",
};

/** Resolves a supported syntax only from the final, case-insensitive extension. */
export function syntaxLanguageForPath(path: string): SyntaxLanguage | null {
  const basename = path.slice(path.lastIndexOf("/") + 1);
  const separator = basename.lastIndexOf(".");
  if (separator <= 0 || separator === basename.length - 1) return null;
  const extension = basename.slice(separator + 1).toLowerCase();
  return Object.hasOwn(EXTENSION_LANGUAGE, extension)
    ? (EXTENSION_LANGUAGE[extension] ?? null)
    : null;
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
