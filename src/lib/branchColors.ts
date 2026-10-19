import type {
  BranchInfo,
  GraphColor,
  GraphPreferences,
  ReferenceColor,
  RepositoryRefsSnapshot,
} from "../bindings";
import type { GraphContext } from "./graph-layout/context";

import { GRAPH_COLORS } from "./graph-layout/colors";

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Connected components use configured upstream identities, never short names. */
export function colorGroups(
  branches: readonly BranchInfo[],
): readonly (readonly string[])[] {
  const neighbors = new Map<string, Set<string>>();
  for (const branch of branches) {
    if (branch.is_symbolic) continue;
    if (!neighbors.has(branch.full_name))
      neighbors.set(branch.full_name, new Set());
    if (branch.upstream !== null) {
      if (!neighbors.has(branch.upstream))
        neighbors.set(branch.upstream, new Set());
      neighbors.get(branch.full_name)?.add(branch.upstream);
      neighbors.get(branch.upstream)?.add(branch.full_name);
    }
  }
  const visited = new Set<string>();
  const groups: string[][] = [];
  for (const name of [...neighbors.keys()].sort(compare)) {
    if (visited.has(name)) continue;
    const group: string[] = [];
    const pending = [name];
    while (pending.length > 0) {
      const next = pending.pop();
      if (next === undefined || visited.has(next)) continue;
      visited.add(next);
      group.push(next);
      for (const neighbor of neighbors.get(next) ?? [])
        if (!visited.has(neighbor)) pending.push(neighbor);
    }
    groups.push(group.sort(compare));
  }
  return groups;
}

/** Reconciles new/upstream references while retaining absent identities and edits. */
export function reconcileColors(
  path: string,
  branches: readonly BranchInfo[],
  saved?: GraphPreferences,
): GraphPreferences {
  const records = new Map(
    (saved?.colors ?? []).map((record) => [record.reference, record]),
  );
  const uses = new Map<GraphColor, number>();
  for (const record of records.values())
    uses.set(record.color, (uses.get(record.color) ?? 0) + 1);
  for (const group of colorGroups(branches)) {
    const prior = group.flatMap((name) => {
      const record = records.get(name);
      return record === undefined ? [] : [record];
    });
    prior.sort(
      (a, b) => b.edited - a.edited || compare(a.reference, b.reference),
    );
    const chosen = prior[0];
    const leastUsed = [...GRAPH_COLORS].sort(
      (a, b) => (uses.get(a) ?? 0) - (uses.get(b) ?? 0),
    );
    const color = chosen?.color ?? leastUsed[0] ?? "stone";
    for (const reference of group) {
      if (!records.has(reference)) uses.set(color, (uses.get(color) ?? 0) + 1);
      records.set(reference, { reference, color, edited: chosen?.edited ?? 0 });
    }
  }
  return {
    path,
    principal: saved?.principal ?? null,
    revision: saved?.revision ?? 0,
    colors: [...records.values()].sort((a, b) =>
      compare(a.reference, b.reference),
    ),
  };
}

/** Applies one explicit edit to the full configured upstream component. */
export function editBranchColor(
  preferences: GraphPreferences,
  branches: readonly BranchInfo[],
  reference: string,
  color: GraphColor,
): GraphPreferences {
  if (preferences.revision >= 0xffff_ffff)
    throw new Error("Graph color edit sequence exhausted");
  const revision = preferences.revision + 1;
  const group = new Set(
    colorGroups(branches).find((names) => names.includes(reference)) ?? [
      reference,
    ],
  );
  return {
    ...preferences,
    revision,
    colors: preferences.colors.map((record) =>
      group.has(record.reference)
        ? { ...record, color, edited: revision }
        : record,
    ),
  };
}

/** Selected principal and truthful recovery status; detection never performs checkout. */
export function visualPrincipal(
  snapshot: RepositoryRefsSnapshot,
  saved: string | null,
): {
  reference: string | null;
  status: "selected" | "detected" | "missing" | "choose";
} {
  const branches = snapshot.branches.filter(
    (branch) => !branch.is_symbolic && branch.target !== null,
  );
  if (saved !== null && branches.some((branch) => branch.full_name === saved))
    return { reference: saved, status: "selected" };
  if (saved !== null)
    return {
      reference:
        [...branches].sort((a, b) => compare(a.full_name, b.full_name))[0]
          ?.full_name ?? null,
      status: "missing",
    };
  const identities = new Set(branches.map((branch) => branch.full_name));
  const defaults = snapshot.branches.filter(
    (branch) =>
      branch.is_symbolic &&
      branch.is_remote &&
      branch.full_name.endsWith("/HEAD") &&
      identities.has(branch.symbolic_target ?? ""),
  );
  const origin = defaults.find(
    (branch) => branch.full_name === "refs/remotes/origin/HEAD",
  );
  const destinations = [
    ...new Set(
      defaults.flatMap((branch) =>
        branch.symbolic_target === null ? [] : [branch.symbolic_target],
      ),
    ),
  ];
  const target =
    origin?.symbolic_target ??
    (destinations.length === 1 ? destinations[0] : null);
  if (target !== null && target !== undefined) {
    const locals = branches.filter(
      (branch) => !branch.is_remote && branch.upstream === target,
    );
    return {
      reference:
        locals.length === 1 ? (locals[0]?.full_name ?? target) : target,
      status: "detected",
    };
  }
  return {
    reference:
      [...branches].sort((a, b) => compare(a.full_name, b.full_name))[0]
        ?.full_name ?? null,
    status: "choose",
  };
}

/** Converts the IPC snapshot into the pure layout's minimal immutable input. */
export function graphContext(
  snapshot: RepositoryRefsSnapshot,
  principal: string | null,
): GraphContext {
  return {
    principal,
    seeds: snapshot.branches
      .filter((b) => !b.is_symbolic && b.target !== null)
      .map((b) => ({ id: b.full_name, commitId: b.target ?? "" })),
  };
}

/** Semantic color lookup consumed by both graph and reference badges. */
export function colorByReference(
  preferences: GraphPreferences,
): ReadonlyMap<string, GraphColor> {
  return new Map(
    preferences.colors.map((record: ReferenceColor) => [
      record.reference,
      record.color,
    ]),
  );
}
