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
import { useWorkspace } from "./workspace";

/** One projection of frozen refs and durable preferences for the originating root. */
export function useGraphModel(root: string | null) {
  const refs = useRepositoryRefs(root);
  const saved = useWorkspace((state) =>
    state.graphPreferences.find((p) => p.path === root),
  );
  const preferences = useMemo(
    () =>
      root === null || refs.data === undefined
        ? null
        : reconcileColors(root, refs.data.branches, saved),
    [root, refs.data, saved],
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
      JSON.stringify(preferences) !== JSON.stringify(saved)
    ) {
      const store = useWorkspace.getState();
      // A later user edit or another mounted consumer wins over this render.
      if (store.graphPreferences.find((p) => p.path === root) === saved)
        store.setGraphPreferences(preferences);
    }
  }, [preferences, saved, root]);
  const changeColor = (reference: string, color: GraphColor) => {
    if (root === null) return;
    const latest = useWorkspace
      .getState()
      .graphPreferences.find((p) => p.path === root);
    if (refs.data === undefined) return;
    try {
      const current = reconcileColors(root, refs.data.branches, latest);
      useWorkspace
        .getState()
        .setGraphPreferences(
          editBranchColor(current, refs.data.branches, reference, color),
        );
    } catch (error) {
      useWorkspace.getState().setStorageError(error);
    }
  };
  const choosePrincipal = (reference: string) => {
    if (root === null || refs.data === undefined) return;
    const latest = useWorkspace
      .getState()
      .graphPreferences.find((p) => p.path === root);
    useWorkspace.getState().setGraphPreferences({
      ...reconcileColors(root, refs.data.branches, latest),
      principal: reference,
    });
  };
  return {
    refs,
    preferences,
    context,
    colors,
    main,
    changeColor,
    choosePrincipal,
  };
}
