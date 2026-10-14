/// <reference types="node" />

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Reads a stylesheet under `src/` as text, failing loudly when it is empty.
 *
 * Vitest processes CSS imports away, so `import x from "./a.css?raw"` yields an
 * empty string and a test built on it passes while checking nothing. Reading
 * from disk is the only form that cannot do that.
 */
export function readStylesheet(pathFromSrc: string): string {
  const css = readFileSync(
    fileURLToPath(new URL(`../${pathFromSrc}`, import.meta.url)),
    "utf8",
  );
  if (css.trim() === "") throw new Error(`${pathFromSrc} is empty`);
  return css;
}
