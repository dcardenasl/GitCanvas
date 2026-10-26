import type { RefTarget } from "./Sidebar";

/** Folder node representing an intermediate path segment in the reference tree. */
export interface RefFolderNode {
  /** Node discriminator. */
  readonly kind: "folder";
  /** Segment name, e.g. 'cargo'. */
  readonly name: string;
  /** Full path prefix up to this folder, e.g. 'origin/dependabot/cargo'. */
  readonly fullPath: string;
  /** Subfolders contained directly within this folder. */
  readonly folders: readonly RefFolderNode[];
  /** Leaves contained directly within this folder. */
  readonly leaves: readonly RefLeafNode[];
  /** All leaves recursively contained within this folder and its descendants. */
  readonly allLeaves: readonly RefTarget[];
}

/** Leaf node representing an individual branch or tag reference. */
export interface RefLeafNode {
  /** Node discriminator. */
  readonly kind: "leaf";
  /** Segment name, e.g. 'main' or 'syn-3.0.8'. */
  readonly name: string;
  /** Display and navigation target details. */
  readonly target: RefTarget;
}

/** Hierarchical tree representation of a list of Git references. */
export interface RefTree {
  /** Root-level folders. */
  readonly folders: readonly RefFolderNode[];
  /** Root-level leaves. */
  readonly leaves: readonly RefLeafNode[];
  /** Flat collection of all leaves across the tree. */
  readonly allLeaves: readonly RefTarget[];
}

interface MutableFolder {
  readonly name: string;
  readonly fullPath: string;
  readonly subfolders: Map<string, MutableFolder>;
  readonly leaves: RefLeafNode[];
  readonly allLeaves: RefTarget[];
}

const compareNames = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

/**
 * Organizes a flat list of Git references into a hierarchical tree based on '/' separators.
 *
 * @param targets The reference targets to organize.
 * @returns The hierarchical tree structure.
 */
export function buildRefTree(targets: readonly RefTarget[]): RefTree {
  const rootFolders = new Map<string, MutableFolder>();
  const rootLeaves: RefLeafNode[] = [];
  const allLeaves: RefTarget[] = [...targets];

  for (const target of targets) {
    const parts = target.name.split("/");
    const leafName = parts[parts.length - 1] ?? target.name;

    if (parts.length === 1) {
      rootLeaves.push({
        kind: "leaf",
        name: leafName,
        target,
      });
    } else {
      let currentMap = rootFolders;
      let currentPath = "";
      let currentFolder: MutableFolder | null = null;

      for (let i = 0; i < parts.length - 1; i++) {
        const segment = parts[i] ?? "";
        currentPath =
          currentPath === "" ? segment : `${currentPath}/${segment}`;
        let folder = currentMap.get(segment);
        if (folder === undefined) {
          folder = {
            name: segment,
            fullPath: currentPath,
            subfolders: new Map(),
            leaves: [],
            allLeaves: [],
          };
          currentMap.set(segment, folder);
        }
        folder.allLeaves.push(target);
        currentFolder = folder;
        currentMap = folder.subfolders;
      }

      if (currentFolder !== null) {
        currentFolder.leaves.push({
          kind: "leaf",
          name: leafName,
          target,
        });
      }
    }
  }

  function convertFolder(folder: MutableFolder): RefFolderNode {
    const sortedSubfolders = [...folder.subfolders.values()]
      .sort((a, b) => compareNames(a.name, b.name))
      .map(convertFolder);
    const sortedLeaves = [...folder.leaves].sort(
      (a, b) =>
        Number(b.target.isHead ?? false) - Number(a.target.isHead ?? false) ||
        compareNames(a.name, b.name),
    );

    return {
      kind: "folder",
      name: folder.name,
      fullPath: folder.fullPath,
      folders: sortedSubfolders,
      leaves: sortedLeaves,
      allLeaves: folder.allLeaves,
    };
  }

  const sortedRootFolders = [...rootFolders.values()]
    .sort((a, b) => compareNames(a.name, b.name))
    .map(convertFolder);

  const sortedRootLeaves = [...rootLeaves].sort(
    (a, b) =>
      Number(b.target.isHead ?? false) - Number(a.target.isHead ?? false) ||
      compareNames(a.name, b.name),
  );

  return {
    folders: sortedRootFolders,
    leaves: sortedRootLeaves,
    allLeaves,
  };
}
