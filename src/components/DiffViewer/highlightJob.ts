import type {
  HighlightJob,
  HighlightRequest,
  HighlightResponse,
  HighlightRows,
} from "./highlightProtocol";
import { highlightDiff, highlightSource } from "./syntax";

/** Tokenizes a job. Pure, so the worker and the tests run the same code. */
export function runHighlightJob(job: HighlightJob): HighlightRows {
  if (job.mode === "diff") return highlightDiff(job.lines, job.language);
  const rows = highlightSource(job.lines.join("\n"), job.language);
  return job.lines.map((_, index) => rows[index] ?? []);
}

/** Answers a request, turning any failure into a message instead of a throw. */
export function answerHighlightRequest(
  request: HighlightRequest,
): HighlightResponse {
  try {
    return { id: request.id, rows: runHighlightJob(request.job) };
  } catch (error) {
    return {
      id: request.id,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
