import type { HighlightWorker } from "./highlightClient";
import SyntaxWorker from "./highlight.worker?worker";

/** Starts the bundled highlighting worker. */
export function spawnHighlightWorker(): HighlightWorker {
  return new SyntaxWorker();
}
