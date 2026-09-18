import type { FileDiff, FileDiffSummary } from "../../bindings";

export type ChangedFile = FileDiff | FileDiffSummary;

export interface FileTreeDirectory {
  readonly kind: "directory";
  readonly name: string;
  readonly path: string;
  readonly entries: readonly FileTreeEntry[];
  readonly fileCount: number;
}

export interface FileTreeFile {
  readonly kind: "file";
  readonly id: string;
  readonly name: string;
  readonly file: ChangedFile;
}

export type FileTreeEntry = FileTreeDirectory | FileTreeFile;

export interface FileTree {
  readonly entries: readonly FileTreeEntry[];
  readonly directoryPaths: readonly string[];
}

interface MutableDirectory {
  readonly name: string;
  readonly path: string;
  readonly directories: Map<string, MutableDirectory>;
  readonly files: ChangedFile[];
}

const NAME_ORDER = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

function compareNames(left: string, right: string): number {
  return (
    NAME_ORDER.compare(left, right) ||
    (left < right ? -1 : left > right ? 1 : 0)
  );
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

/** Groups Git's slash-separated file paths without changing the path used to open them. */
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
