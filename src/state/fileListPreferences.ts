import { create } from "zustand";

import { safeStorage } from "../lib/safeStorage";

/** Presentation mode for changed-file navigation. */
export type FileListView = "path" | "tree";

const STORAGE_KEY = "gitcanvas.file-list-view";

function readView(): FileListView {
  return safeStorage.get(STORAGE_KEY) === "tree" ? "tree" : "path";
}

interface FileListPreferences {
  readonly view: FileListView;
  setView: (view: FileListView) => void;
}

/** A window-level display preference shared by commit and working-tree panels. */
export const useFileListPreferences = create<FileListPreferences>((set) => ({
  view: readView(),
  setView: (view) => {
    set({ view });
    safeStorage.set(STORAGE_KEY, view);
  },
}));
