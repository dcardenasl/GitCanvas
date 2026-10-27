import { beforeEach, expect, it } from "vitest";

import {
  openTestProject,
  resetWorkspace,
  TEST_LIMITS,
} from "../../test/workspace";
import { useWorkspace } from "../workspace";
import { workspaceRecord } from "../workspaceRecords";

beforeEach(() => {
  resetWorkspace();
  useWorkspace.getState().setLimits(TEST_LIMITS);
});

it("keeps filter exclusions isolated by worktree and undo local to the session", () => {
  const store = useWorkspace.getState();
  store.changeReferenceFilters("/main", ["refs/heads/side"]);
  store.changeReferenceFilters("/linked", ["refs/tags/v1"]);
  expect(useWorkspace.getState().referenceFilters).toEqual([
    { path: "/main", excluded: ["refs/heads/side"], search: "" },
    { path: "/linked", excluded: ["refs/tags/v1"], search: "" },
  ]);

  useWorkspace.getState().undoReferenceFilters("/main");
  expect(useWorkspace.getState().referenceFilters).toEqual([
    { path: "/linked", excluded: ["refs/tags/v1"], search: "" },
  ]);
});

it("bounds undo to 50 transitions and treats a bulk transition as one step", () => {
  const store = useWorkspace.getState();
  for (let index = 0; index < 51; index += 1)
    store.changeReferenceFilters("/main", [
      `refs/heads/branch-${String(index)}`,
    ]);

  expect(useWorkspace.getState().referenceFilterUndo["/main"]).toHaveLength(50);
  useWorkspace.getState().undoReferenceFilters("/main");
  expect(useWorkspace.getState().referenceFilters[0]?.excluded).toEqual([
    "refs/heads/branch-49",
  ]);
});

it("persists each worktree search with its filters and keeps it after closing a tab", () => {
  const project = openTestProject();
  useWorkspace
    .getState()
    .changeReferenceFilters(project.path, ["refs/heads/side"]);
  useWorkspace.getState().setReferenceSearch(project.path, "feature");
  expect(useWorkspace.getState().referenceFilters).toEqual([
    { path: project.path, excluded: ["refs/heads/side"], search: "feature" },
  ]);
  expect(workspaceRecord(useWorkspace.getState()).reference_filters).toEqual(
    useWorkspace.getState().referenceFilters,
  );

  useWorkspace.getState().closeTab(project.path);
  expect(useWorkspace.getState().referenceFilters[0]?.search).toBe("feature");
});

it("clears an empty search without discarding exclusions and preserves search on undo", () => {
  const store = useWorkspace.getState();
  store.changeReferenceFilters("/main", ["refs/heads/side"]);
  store.setReferenceSearch("/main", "feature");
  store.changeReferenceFilters("/main", []);
  store.undoReferenceFilters("/main");
  expect(useWorkspace.getState().referenceFilters).toEqual([
    { path: "/main", excluded: ["refs/heads/side"], search: "feature" },
  ]);

  useWorkspace.getState().clearReferenceSearch("/main");
  expect(useWorkspace.getState().referenceFilters).toEqual([
    { path: "/main", excluded: ["refs/heads/side"], search: "" },
  ]);
});

it("bounds saved search text by the backend UTF-8 byte limit", () => {
  useWorkspace.getState().setReferenceSearch("/main", "á".repeat(3000));
  expect(
    new TextEncoder().encode(
      useWorkspace.getState().referenceFilters[0]?.search,
    ).length,
  ).toBeLessThanOrEqual(TEST_LIMITS.max_reference_search_bytes);
});
