import { beforeEach, expect, it } from "vitest";
import {
  openTestProject,
  resetWorkspace,
  TEST_LIMITS,
} from "../../test/workspace";
import { useWorkspace } from "../workspace";
import { workspaceRecord } from "../workspaceRecords";

beforeEach(resetWorkspace);
it("retains graph preferences independently of closed tabs and restores them", () => {
  const project = openTestProject();
  const preferences = {
    path: project.path,
    principal: "refs/heads/main",
    revision: 1,
    colors: [
      { reference: "refs/heads/main", color: "blue" as const, edited: 1 },
    ],
  };
  useWorkspace.getState().setGraphPreferences(preferences);
  useWorkspace.getState().closeTab(project.path);
  const record = workspaceRecord(useWorkspace.getState());
  expect(record.tabs).toEqual([]);
  resetWorkspace();
  useWorkspace.getState().restore(record);
  openTestProject(project);
  expect(useWorkspace.getState().graphPreferences).toEqual([preferences]);
});
it("refuses new preferences past the backend limit without losing earlier data", () => {
  useWorkspace.setState({
    limits: { ...TEST_LIMITS, max_graph_projects: 1 },
  });
  useWorkspace.getState().setGraphPreferences({
    path: "/one",
    principal: null,
    revision: 0,
    colors: [],
  });
  useWorkspace.getState().setGraphPreferences({
    path: "/two",
    principal: null,
    revision: 0,
    colors: [],
  });
  expect(useWorkspace.getState().graphPreferences.map((p) => p.path)).toEqual([
    "/one",
  ]);
  expect(useWorkspace.getState().storageError).not.toBeNull();
});
