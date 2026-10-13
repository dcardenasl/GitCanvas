import { createHighlightClient } from "./highlightClient";
import { spawnHighlightWorker } from "./spawnHighlightWorker";

/** The application's highlighter: one shared worker, started on first use. */
export const syntaxHighlighter = createHighlightClient(spawnHighlightWorker);
