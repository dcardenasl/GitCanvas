import { create } from "zustand";

/** Presentation mode for changed-file navigation. */
export type FileListView = "path" | "tree";

const STORAGE_KEY = "gitcanvas.file-list-view";

function readView(): FileListView {
  try {
    return localStorage.getItem(STORAGE_KEY) === "tree" ? "tree" : "path";
  } catch {
    return "path";
  }
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
    try {
      localStorage.setItem(STORAGE_KEY, view);
    } catch {
      // The view remains usable for this session when storage is unavailable.
    }
  },
}));
