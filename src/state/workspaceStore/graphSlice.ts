import type { StateCreator } from "zustand";
import type { GraphSlice, WorkspaceState } from "./types";

/** Updates presentation preferences without touching Git or closing tabs. */
export const createGraphSlice: StateCreator<
  WorkspaceState,
  [],
  [],
  GraphSlice
> = (set, get) => ({
  graphPreferences: [],
  setGraphPreferences: (preferences) => {
    const state = get();
    const exists = state.graphPreferences.some(
      (p) => p.path === preferences.path && p.scope === preferences.scope,
    );
    const limits = state.limits;
    if (
      limits === null ||
      (!exists && state.graphPreferences.length >= limits.max_graph_projects) ||
      preferences.colors.length > limits.max_graph_references
    ) {
      state.setStorageError({
        kind: "ResourceLimitExceeded",
        message: "Graph preference capacity exceeded",
      });
      return;
    }
    set({
      graphPreferences: [
        ...state.graphPreferences.filter(
          (p) => p.path !== preferences.path || p.scope !== preferences.scope,
        ),
        preferences,
      ],
    });
  },
  migrateRepositoryPreferences: ({
    repositoryId,
    mainRoot,
    activeRoot,
    memberRoots,
    automatic,
    resolved,
  }) => {
    const state = get();
    const members = new Set(memberRoots);
    const shared = state.graphPreferences.find(
      (p) => p.scope === "repository" && p.path === repositoryId,
    );
    const main =
      mainRoot === null
        ? undefined
        : state.graphPreferences.find(
            (p) => p.scope === "worktree" && p.path === mainRoot,
          );
    const active = state.graphPreferences.find(
      (p) => p.scope === "worktree" && p.path === activeRoot,
    );
    const chosen = shared ?? main ?? active ?? automatic;
    const migrated = {
      ...resolved,
      principal: chosen.principal,
      revision: Math.max(chosen.revision, resolved.revision),
      path: repositoryId,
      scope: "repository" as const,
    };
    const next = state.graphPreferences.filter(
      (p) =>
        !(p.scope === "worktree" && members.has(p.path)) &&
        !(p.scope === "repository" && p.path === repositoryId),
    );
    next.push(migrated);
    if (
      state.limits === null ||
      next.length > state.limits.max_graph_projects ||
      migrated.colors.length > state.limits.max_graph_references
    ) {
      state.setStorageError({
        kind: "ResourceLimitExceeded",
        message: "Graph preference capacity exceeded",
      });
      return;
    }
    if (JSON.stringify(next) !== JSON.stringify(state.graphPreferences))
      set({ graphPreferences: next });
  },
});
