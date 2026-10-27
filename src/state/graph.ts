import { useEffect, useMemo } from "react";
import type { GraphColor } from "../bindings";
import {
  colorByReference,
  editBranchColor,
  graphContext,
  reconcileColors,
  visualPrincipal,
} from "../lib/branchColors";
import { EMPTY_GRAPH_CONTEXT } from "../lib/graph-layout/layout";
import { useRepositoryRefs } from "./refs";
import { useRepositoryWorktrees } from "./repositoryWorktrees";
import { useWorkspace } from "./workspace";

/** One projection of frozen refs and durable preferences for the originating root. */
export function useGraphModel(root: string | null) {
  const refs = useRepositoryRefs(root);
  const worktrees = useRepositoryWorktrees(root);
  const repositoryId = worktrees.data?.repository_id ?? null;
  const memberRoots = useMemo(
    () => worktrees.data?.worktrees.map((tree) => tree.root) ?? [],
    [worktrees.data],
  );
  const mainRoot =
    worktrees.data?.worktrees.find((tree) => tree.is_main)?.root ?? null;
  const saved = useWorkspace((state) =>
    state.graphPreferences.find((p) =>
      repositoryId === null
        ? p.scope === "worktree" && p.path === root
        : p.scope === "repository" && p.path === repositoryId,
    ),
  );
  const legacy = useWorkspace(
    (state) =>
      (mainRoot === null
        ? undefined
        : state.graphPreferences.find(
            (p) => p.scope === "worktree" && p.path === mainRoot,
          )) ??
      state.graphPreferences.find(
        (p) => p.scope === "worktree" && p.path === root,
      ),
  );
  const preferences = useMemo(
    () =>
      root === null || refs.data === undefined
        ? null
        : reconcileColors(
            repositoryId ?? root,
            refs.data.branches,
            saved ?? legacy,
          ),
    [root, repositoryId, refs.data, saved, legacy],
  );
  const explicitPrincipal = preferences?.principal ?? null;
  const main = useMemo(
    () =>
      refs.data === undefined
        ? null
        : visualPrincipal(refs.data, explicitPrincipal),
    [refs.data, explicitPrincipal],
  );
  const principal = main?.reference ?? null;
  const context = useMemo(
    () =>
      refs.data === undefined
        ? EMPTY_GRAPH_CONTEXT
        : graphContext(refs.data, principal),
    [refs.data, principal],
  );
  const colors = useMemo(
    () =>
      preferences === null
        ? new Map<string, GraphColor>()
        : colorByReference(preferences),
    [preferences],
  );
  useEffect(() => {
    if (
      preferences !== null &&
      root !== null &&
      JSON.stringify(preferences) !== JSON.stringify(saved)
    ) {
      const store = useWorkspace.getState();
      // A later user edit or another mounted consumer wins over this render.
      if (
        repositoryId !== null &&
        refs.data !== undefined &&
        worktrees.data !== undefined
      ) {
        const currentSource =
          store.graphPreferences.find(
            (p) => p.scope === "repository" && p.path === repositoryId,
          ) ??
          (mainRoot === null
            ? undefined
            : store.graphPreferences.find(
                (p) => p.scope === "worktree" && p.path === mainRoot,
              )) ??
          store.graphPreferences.find(
            (p) => p.scope === "worktree" && p.path === root,
          );
        if (currentSource === (saved ?? legacy))
          store.migrateRepositoryPreferences({
            repositoryId,
            mainRoot,
            activeRoot: root,
            memberRoots,
            automatic: {
              ...reconcileColors(repositoryId, refs.data.branches),
              scope: "repository",
            },
            resolved: preferences,
          });
      } else if (
        store.graphPreferences.find(
          (p) => p.path === root && p.scope === "worktree",
        ) === legacy
      ) {
        store.setGraphPreferences(preferences);
      }
    }
  }, [
    preferences,
    saved,
    legacy,
    root,
    repositoryId,
    mainRoot,
    memberRoots,
    refs.data,
    worktrees.data,
  ]);
  const changeColor = (reference: string, color: GraphColor) => {
    if (root === null) return;
    const latest = useWorkspace
      .getState()
      .graphPreferences.find(
        (p) =>
          p.scope === (repositoryId === null ? "worktree" : "repository") &&
          p.path === (repositoryId ?? root),
      );
    if (refs.data === undefined) return;
    try {
      const current = reconcileColors(
        repositoryId ?? root,
        refs.data.branches,
        latest ?? legacy,
      );
      useWorkspace.getState().setGraphPreferences({
        ...editBranchColor(current, refs.data.branches, reference, color),
        path: repositoryId ?? root,
        scope: repositoryId === null ? "worktree" : "repository",
      });
    } catch (error) {
      useWorkspace.getState().setStorageError(error);
    }
  };
  const choosePrincipal = (reference: string) => {
    if (root === null || refs.data === undefined) return;
    const latest = useWorkspace
      .getState()
      .graphPreferences.find(
        (p) =>
          p.scope === (repositoryId === null ? "worktree" : "repository") &&
          p.path === (repositoryId ?? root),
      );
    useWorkspace.getState().setGraphPreferences({
      ...reconcileColors(
        repositoryId ?? root,
        refs.data.branches,
        latest ?? legacy,
      ),
      path: repositoryId ?? root,
      scope: repositoryId === null ? "worktree" : "repository",
      principal: reference,
    });
  };
  return {
    refs,
    worktrees,
    preferences,
    context,
    colors,
    main,
    changeColor,
    choosePrincipal,
  };
}
