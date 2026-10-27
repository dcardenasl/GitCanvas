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

it("keeps collapsed reference nodes isolated by worktree and in the durable workspace", () => {
  useWorkspace
    .getState()
    .setReferenceTreeCollapsed("/main", ["folder:remote:origin/feature"]);
  useWorkspace.getState().setReferenceTreeCollapsed("/linked", ["group:tags"]);

  expect(useWorkspace.getState().referenceTreePreferences).toEqual([
    { path: "/main", collapsed: ["folder:remote:origin/feature"] },
    { path: "/linked", collapsed: ["group:tags"] },
  ]);
  expect(
    workspaceRecord(useWorkspace.getState()).reference_tree_preferences,
  ).toEqual(useWorkspace.getState().referenceTreePreferences);
});

it("removes empty preferences and refuses more worktrees than the backend limit", () => {
  useWorkspace.getState().setReferenceTreeCollapsed("/main", ["group:local"]);
  useWorkspace.getState().setReferenceTreeCollapsed("/main", []);
  expect(useWorkspace.getState().referenceTreePreferences).toEqual([]);

  useWorkspace.setState({
    referenceTreePreferences: Array.from({ length: 200 }, (_, index) => ({
      path: `/repo-${String(index)}`,
      collapsed: ["group:local"],
    })),
  });
  useWorkspace.getState().setReferenceTreeCollapsed("/new", ["group:local"]);
  expect(useWorkspace.getState().referenceTreePreferences).toHaveLength(200);
  expect(useWorkspace.getState().storageError?.cause).toMatchObject({
    kind: "ResourceLimitExceeded",
  });
});

it("persists collapsed state after a project tab closes", () => {
  const project = openTestProject();
  useWorkspace
    .getState()
    .setReferenceTreeCollapsed(project.path, ["group:remote"]);
  useWorkspace.getState().closeTab(project.path);

  expect(
    useWorkspace
      .getState()
      .referenceTreePreferences.find(
        (preference) => preference.path === project.path,
      ),
  ).toEqual({ path: project.path, collapsed: ["group:remote"] });
});
