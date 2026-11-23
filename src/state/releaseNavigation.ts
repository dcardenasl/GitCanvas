import type { Transition } from "./navigation";

/** Session-only release inspection over an unchanged Git selection. */
export interface ReleaseView {
  readonly releaseId: string;
}

/** Opens a release for the current worktree without changing the graph selection. */
export function openRelease(releaseId: string): Transition {
  return (navigation) =>
    navigation.releaseView?.releaseId === releaseId &&
    navigation.stash === null &&
    navigation.fileHistory === null
      ? navigation
      : {
          ...navigation,
          stash: null,
          fileHistory: null,
          sidebarTemporaryOpen: false,
          releaseView: { releaseId },
        };
}

/** Closes release inspection and reveals the underlying Git context again. */
export const closeRelease: Transition = (navigation) =>
  navigation.releaseView === null
    ? navigation
    : { ...navigation, releaseView: null };
