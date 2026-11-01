import { expect, it } from "vitest";

import {
  EMPTY_NAVIGATION,
  type FileHistoryView,
  type Navigation,
} from "./navigation";
import { restoreTab, workspaceRecord } from "./workspaceRecords";
import { IDLE_GIT_ACTIONS } from "./gitActionState";
import { UNVERIFIED } from "./verification";
import type { Tab } from "./workspaceStore/types";

const VIEW: FileHistoryView = {
  path: "src/app.ts",
  startCommitId: "a".repeat(40),
  selectedCommitId: "b".repeat(40),
  stale: true,
};

it("never writes an open file history to the saved workspace", () => {
  const navigation: Navigation = { ...EMPTY_NAVIGATION, fileHistory: VIEW };
  const tab: Tab = {
    repository: { path: "/repo", name: "repo" },
    navigation,
    gitActions: IDLE_GIT_ACTIONS,
    verification: UNVERIFIED,
  };
  const record = workspaceRecord({
    tabs: [tab],
    activeRoot: "/repo",
    favorites: [],
    recents: [],
    graphPreferences: [],
    referenceFilters: [],
    referenceTreePreferences: [],
  });
  expect(JSON.stringify(record)).not.toContain("startCommitId");
  expect(JSON.stringify(record)).not.toContain("src/app.ts");
});

it("restores every tab with the file history closed", () => {
  const tab = restoreTab({
    path: "/repo",
    selection: { kind: "history" },
    history_anchor: null,
    collapsed_folders: [],
  });
  expect(tab.navigation.fileHistory).toBeNull();
});
