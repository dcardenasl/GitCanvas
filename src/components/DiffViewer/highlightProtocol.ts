import type { SyntaxLanguage } from "./language";
import type { HighlightableLine } from "./syntax";
import type { HighlightedRow } from "./tokens";

/** What to tokenize: a whole file, or the rows of a rendered patch. */
export type HighlightJob =
  | {
      readonly mode: "source";
      readonly language: SyntaxLanguage;
      readonly lines: readonly string[];
    }
  | {
      readonly mode: "diff";
      readonly language: SyntaxLanguage;
      readonly lines: readonly HighlightableLine[];
    };

/** The display mode a job was made for. */
export type HighlightMode = HighlightJob["mode"];

/** One tokenized row per input row; `null` where a diff row has no code. */
export type HighlightRows = readonly (HighlightedRow | null)[];

/** Message from the interface to the worker. */
export interface HighlightRequest {
  readonly id: number;
  readonly job: HighlightJob;
}

/** Message from the worker back, matched to its request by `id`. */
export type HighlightResponse =
  | { readonly id: number; readonly rows: HighlightRows }
  | { readonly id: number; readonly error: string };
