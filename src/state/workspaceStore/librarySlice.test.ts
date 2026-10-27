import { describe, expect, it } from "vitest";

import { recentsAfterVisit } from "./librarySlice";

const limits = {
  max_tabs: 30,
  max_favorites: 200,
  max_recents: 3,
  max_graph_projects: 200,
  max_graph_references: 10000,
  max_reference_filter_worktrees: 200,
  max_excluded_references: 20001,
  max_reference_search_bytes: 4096,
  max_reference_tree_worktrees: 200,
  max_collapsed_reference_folders: 500,
};

describe("recentsAfterVisit", () => {
  it("puts a project first, once", () => {
    const state = { recents: ["/b", "/a", "/c"], limits };

    expect(recentsAfterVisit(state, "/a")).toEqual(["/a", "/b", "/c"]);
  });

  it("keeps to the backend's bound, dropping the oldest", () => {
    const state = { recents: ["/a", "/b", "/c"], limits };

    expect(recentsAfterVisit(state, "/d")).toEqual(["/d", "/a", "/b"]);
  });

  it("leaves the list alone while the bound is unknown instead of erasing it", () => {
    const state = { recents: ["/a", "/b"], limits: null };

    expect(recentsAfterVisit(state, "/c")).toBe(state.recents);
  });
});
