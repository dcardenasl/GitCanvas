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
    scope: "worktree" as const,
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
    scope: "worktree",
    principal: null,
    revision: 0,
    colors: [],
  });
  useWorkspace.getState().setGraphPreferences({
    path: "/two",
    scope: "worktree",
    principal: null,
    revision: 0,
    colors: [],
  });
  expect(useWorkspace.getState().graphPreferences.map((p) => p.path)).toEqual([
    "/one",
  ]);
  expect(useWorkspace.getState().storageError?.cause).toMatchObject({
    kind: "ResourceLimitExceeded",
  });
});

it("migrates the principal's complete record and removes only linked legacy records", () => {
  const main = {
    path: "/repo",
    scope: "worktree" as const,
    principal: "refs/heads/main",
    revision: 2,
    colors: [
      { reference: "refs/heads/main", color: "blue" as const, edited: 2 },
    ],
  };
  const active = {
    ...main,
    path: "/repo-feature",
    principal: "refs/heads/feature",
    colors: [
      { reference: "refs/heads/feature", color: "rose" as const, edited: 3 },
    ],
  };
  const unrelated = { ...main, path: "/other" };
  useWorkspace.setState({ graphPreferences: [active, unrelated, main] });
  const updates: number[] = [];
  const unsubscribe = useWorkspace.subscribe((state) =>
    updates.push(state.graphPreferences.length),
  );
  useWorkspace.getState().migrateRepositoryPreferences({
    repositoryId: "/common/repo.git",
    mainRoot: "/repo",
    activeRoot: "/repo-feature",
    memberRoots: ["/repo", "/repo-feature"],
    automatic: {
      ...main,
      path: "/common/repo.git",
      scope: "repository",
      principal: null,
    },
    resolved: { ...main, path: "/common/repo.git", scope: "repository" },
  });
  unsubscribe();
  expect(updates).toEqual([2]);
  expect(useWorkspace.getState().graphPreferences).toEqual([
    unrelated,
    { ...main, path: "/common/repo.git", scope: "repository" },
  ]);
});

it("falls back to the active worktree when the principal has no record", () => {
  const active = {
    path: "/repo-feature",
    scope: "worktree" as const,
    principal: "refs/heads/feature",
    revision: 4,
    colors: [
      { reference: "refs/heads/feature", color: "rose" as const, edited: 4 },
    ],
  };
  useWorkspace.setState({ graphPreferences: [active] });
  useWorkspace.getState().migrateRepositoryPreferences({
    repositoryId: "/common/repo.git",
    mainRoot: "/repo",
    activeRoot: "/repo-feature",
    memberRoots: ["/repo", "/repo-feature"],
    automatic: {
      ...active,
      path: "/common/repo.git",
      scope: "repository",
      principal: null,
    },
    resolved: { ...active, path: "/common/repo.git", scope: "repository" },
  });
  expect(useWorkspace.getState().graphPreferences).toEqual([
    { ...active, path: "/common/repo.git", scope: "repository" },
  ]);
});
