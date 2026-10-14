import { answerHighlightRequest } from "./highlightJob";
import type { HighlightRequest, HighlightResponse } from "./highlightProtocol";

/**
 * The part of a dedicated worker's global scope this file uses. Declared here
 * because the `WebWorker` lib cannot be combined with the `DOM` lib the rest of
 * the application is typed against.
 */
interface HighlightScope {
  onmessage: ((event: MessageEvent<HighlightRequest>) => void) | null;
  postMessage(response: HighlightResponse): void;
}

const scope = self as unknown as HighlightScope;

scope.onmessage = (event) => {
  scope.postMessage(answerHighlightRequest(event.data));
};
