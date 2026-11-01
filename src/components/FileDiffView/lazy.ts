import { lazy } from "react";

/** The diff view, loaded on first use so the shell's first paint does not wait for it. */
export const LazyFileDiffView = lazy(async () => {
  const module = await import("./FileDiffView");
  return { default: module.FileDiffView };
});
