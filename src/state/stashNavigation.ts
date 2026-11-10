import type {
  StashComparisonMode,
  StashEntry,
  StashFileSummary,
} from "../bindings";
import type { Transition } from "./navigation";

/** Reading choices belong to one tab and never enter durable workspace records. */
export type StashReading = "diff" | "previous" | "saved";
/** One bounded saved-state overlay, independent of durable graph navigation. */
export interface StashView {
  readonly entry: StashEntry;
  readonly removed: boolean;
  readonly mode: StashComparisonMode;
  readonly center: "graph" | "choose_file" | "file";
  readonly file: StashFileSummary | null;
  readonly fileMode: StashComparisonMode;
  readonly reading: StashReading;
  readonly expanded: boolean;
  readonly collapsedFolders: ReadonlySet<string>;
}

/** Opens another immutable saved state without replacing graph navigation. */
export function openStash(entry: StashEntry): Transition {
  return (navigation) =>
    navigation.stash?.entry.stash_id === entry.stash_id
      ? navigation
      : {
          ...navigation,
          fileHistory: null,
          sidebarTemporaryOpen: false,
          stash: {
            entry,
            removed: false,
            mode: "all",
            center: "graph",
            file: null,
            reading: "diff",
            expanded: false,
            fileMode: "all",
            collapsedFolders: new Set(),
          },
        };
}

/** Closes the overlay, restoring the underlying selection and graph anchor. */
export const closeStash: Transition = (navigation) =>
  navigation.stash === null
    ? navigation
    : { ...navigation, stash: null, sidebarTemporaryOpen: false };

/** Changes only a still-open inspection of this OID, including late async results. */
export function updateStash(
  id: string,
  change: (view: StashView) => StashView,
): Transition {
  return (navigation) => {
    const view = navigation.stash;
    if (view?.entry.stash_id !== id) return navigation;
    const next = change(view);
    return next === view ? navigation : { ...navigation, stash: next };
  };
}
