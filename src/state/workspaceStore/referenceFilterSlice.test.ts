import { beforeEach, expect, it } from "vitest";

import {
  openTestProject,
  resetWorkspace,
  TEST_LIMITS,
} from "../../test/workspace";
import { useWorkspace } from "../workspace";

beforeEach(() => {
  resetWorkspace();
  useWorkspace.getState().setLimits(TEST_LIMITS);
});

it("keeps filter exclusions isolated by worktree and undo local to the session", () => {
  const store = useWorkspace.getState();
  store.changeReferenceFilters("/main", ["refs/heads/side"]);
  store.changeReferenceFilters("/linked", ["refs/tags/v1"]);
  expect(useWorkspace.getState().referenceFilters).toEqual([
    { path: "/main", excluded: ["refs/heads/side"] },
    { path: "/linked", excluded: ["refs/tags/v1"] },
  ]);

  useWorkspace.getState().undoReferenceFilters("/main");
  expect(useWorkspace.getState().referenceFilters).toEqual([
    { path: "/linked", excluded: ["refs/tags/v1"] },
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

it("keeps search session-only and clears it when its worktree tab closes", () => {
  const project = openTestProject();
  useWorkspace.getState().setReferenceSearch(project.path, "feature");
  expect(useWorkspace.getState().referenceSearches[project.path]).toBe(
    "feature",
  );

  useWorkspace.getState().closeTab(project.path);
  expect(
    useWorkspace.getState().referenceSearches[project.path],
  ).toBeUndefined();
});
