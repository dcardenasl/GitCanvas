import type {
  StashEntry,
  StashPage,
  StashFileSummary,
  StashFilesPage,
} from "../bindings";

/** A recorded row with a stable full OID, independent of the current alias. */
export function stashEntry(overrides: Partial<StashEntry> = {}): StashEntry {
  return {
    stash_id: "a".repeat(40),
    index: 0,
    message: "On main: saved work",
    message_lossy: false,
    branch: { kind: "named", name: "main" },
    recorded_at: "1700000000",
    offset_minutes: -180,
    ...overrides,
  };
}

/** A complete empty inventory; tests opt into rows instead of faking backend calls. */
export function stashPage(overrides: Partial<StashPage> = {}): StashPage {
  return {
    revision: "stash-revision",
    entries: [],
    total: 0,
    total_matches: 0,
    search: "",
    selected_present: null,
    selected_entry: null,
    next_cursor: null,
    limits: {
      default_page_size: 50,
      max_reflog_bytes: 8_388_608,
      max_entries: 20_000,
      max_entry_bytes: 65_536,
      max_page_size: 200,
      max_cursor_bytes: 4_096,
      max_search_bytes: 512,
    },
    ...overrides,
  };
}

/** One exact modified saved file, including the mode-independent path identity. */
export function stashFile(
  overrides: Partial<StashFileSummary> = {},
): StashFileSummary {
  const version = {
    commit_id: "b".repeat(40),
    object_id: "c".repeat(40),
    path: "notes.txt",
    path_lossy: false,
    kind: "blob" as const,
  };
  return {
    key: "exact-key",
    path_identity: "raw-path",
    origin: "tracked",
    file: {
      path: "notes.txt",
      old_path: null,
      change: "Modified",
      insertions: 1,
      deletions: 1,
      omitted: null,
    },
    stats_available: true,
    previous: version,
    saved: version,
    preview_unavailable: null,
    ...overrides,
  };
}

/** Bounded saved comparison with no text patches in the listing. */
export function stashFilesPage(
  overrides: Partial<StashFilesPage> = {},
): StashFilesPage {
  return {
    inspection: {
      stash_id: stashEntry().stash_id,
      base_commit_id: "b".repeat(40),
      index_commit_id: "c".repeat(40),
      untracked_commit_id: null,
      mode: "all",
      revision: "files-revision",
      notices: [],
    },
    files: [stashFile()],
    total_files: 1,
    next_cursor: null,
    limits: {
      max_files: 5_000,
      max_page_size: 250,
      max_comparison_blob_bytes: 67_108_864,
      max_key_bytes: 4_096,
      initial_patch_lines: 2_000,
      initial_patch_bytes: 1_048_576,
      expanded_patch_bytes: 16_777_216,
      initial_content_lines: 5_000,
      initial_content_bytes: 2_097_152,
      expanded_content_bytes: 33_554_432,
    },
    ...overrides,
  };
}
