import { compareNames, type ChangedFile } from "../../lib/changedFiles";

/**
 * A directory node whose children list directories before files.
 * Directories and files are each sorted with the shared natural name ordering.
 */
export interface FileTreeDirectory {
  /** Discriminator used to narrow a tree entry. */
  readonly kind: "directory";
  /** Name of this directory, without its parent path. */
  readonly name: string;
  /** Repository-relative directory path, using `/` separators. */
  readonly path: string;
  /** Sorted child directories and changed files. */
  readonly entries: readonly FileTreeEntry[];
  /** Number of changed files at any depth below this directory. */
  readonly fileCount: number;
}

/** A leaf in the changed-file tree that retains its source diff record. */
export interface FileTreeFile {
  /** Discriminator used to narrow a tree entry. */
  readonly kind: "file";
  /** Stable unique id for this occurrence in the input list. */
  readonly id: string;
  /** Basename of the changed file. */
  readonly name: string;
  /** Original diff entry used to open the file. */
  readonly file: ChangedFile;
}

/** One directory or file node in the changed-file tree. */
export type FileTreeEntry = FileTreeDirectory | FileTreeFile;

/** Tree roots and directory paths available to expand/collapse controls. */
export interface FileTree {
  /** Sorted entries at the repository root. */
  readonly entries: readonly FileTreeEntry[];
  /** Directory paths in tree traversal order, excluding the repository root. */
  readonly directoryPaths: readonly string[];
}

interface MutableDirectory {
  readonly name: string;
  readonly path: string;
  readonly directories: Map<string, MutableDirectory>;
  readonly files: ChangedFile[];
}

function sortedEntries(directory: MutableDirectory): FileTreeEntry[] {
  const directories = [...directory.directories.values()].map((child) =>
    toDirectory(child),
  );
  const files = directory.files.map((file, index) => ({
    kind: "file" as const,
    id: `${file.path}\u0000${String(index)}`,
    name: file.path.split("/").filter(Boolean).at(-1) ?? file.path,
    file,
  }));

  return [...directories, ...files].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
    return compareNames(left.name, right.name);
  });
}

function toDirectory(directory: MutableDirectory): FileTreeDirectory {
  const entries = sortedEntries(directory);
  return {
    kind: "directory",
    name: directory.name,
    path: directory.path,
    entries,
    fileCount: entries.reduce(
      (count, entry) =>
        count + (entry.kind === "directory" ? entry.fileCount : 1),
      0,
    ),
  };
}

/**
 * Groups Git's slash-separated file paths without changing the path used to open them.
 * Directories and files are sorted naturally, with directories listed first at
 * each level. Empty path segments are ignored.
 *
 * @param files - Changed-file records from a commit or working-tree listing.
 * @returns A read-only tree and its directory paths in traversal order.
 */
export function buildFileTree(files: readonly ChangedFile[]): FileTree {
  const root: MutableDirectory = {
    name: "",
    path: "",
    directories: new Map(),
    files: [],
  };

  for (const file of files) {
    const segments = file.path.split("/").filter(Boolean);
    const name = segments.pop();
    if (name === undefined) {
      root.files.push(file);
      continue;
    }

    let parent = root;
    for (const segment of segments) {
      let directory = parent.directories.get(segment);
      if (directory === undefined) {
        directory = {
          name: segment,
          path: parent.path === "" ? segment : `${parent.path}/${segment}`,
          directories: new Map(),
          files: [],
        };
        parent.directories.set(segment, directory);
      }
      parent = directory;
    }
    parent.files.push(file);
  }

  const entries = sortedEntries(root);
  const directoryPaths: string[] = [];
  const collectDirectoryPaths = (items: readonly FileTreeEntry[]) => {
    for (const entry of items) {
      if (entry.kind !== "directory") continue;
      directoryPaths.push(entry.path);
      collectDirectoryPaths(entry.entries);
    }
  };
  collectDirectoryPaths(entries);

  return { entries, directoryPaths };
}
