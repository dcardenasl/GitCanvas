import type { CommitInfo, FileHistoryPage, FileHistoryRow } from "../bindings";

/** A commit that changed a file, with every field the interface reads. */
export function fileHistoryRow(
  id: string,
  overrides: Partial<FileHistoryRow> = {},
): FileHistoryRow {
  const commit: CommitInfo = {
    id: id.repeat(40),
    summary: `change ${id}`,
    message: `change ${id}`,
    parents: [],
    author_name: "Test",
    author_email: "test@example.com",
    author_time: "1",
    commit_time: "1",
  };
  return {
    commit,
    change: "modified",
    is_merge: false,
    path_at_commit: "src/app.ts",
    renamed_from: null,
    lineage: null,
    ...overrides,
  };
}

/** One engine page of file history, with the bounds it reported. */
export function fileHistoryPage(
  rows: FileHistoryRow[],
  next: string | null,
  overrides: Partial<FileHistoryPage> = {},
): FileHistoryPage {
  return {
    rows,
    next_cursor: next,
    truncation: null,
    focus: null,
    start: "a".repeat(40),
    shallow: false,
    limits: {
      max_page_size: 200,
      max_examined: 20000,
      max_frontier: 256,
      max_renames: 32,
      max_rename_search_deltas: 2000,
    },
    ...overrides,
  };
}
