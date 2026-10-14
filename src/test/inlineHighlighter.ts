import type { HighlightClient } from "../components/DiffViewer/highlightClient";
import { runHighlightJob } from "../components/DiffViewer/highlightJob";

/**
 * A highlighter that tokenizes on the calling thread, for component tests.
 * The real one needs a `Worker`, which the test environments do not provide;
 * the worker protocol itself is covered by `highlightClient.test.ts`.
 */
export const inlineHighlighter: HighlightClient = {
  highlight(job, signal) {
    if (signal.aborted) {
      return Promise.reject(new DOMException("cancelled", "AbortError"));
    }
    return Promise.resolve(runHighlightJob(job));
  },
};
