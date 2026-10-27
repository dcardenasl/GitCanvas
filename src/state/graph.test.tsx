// @vitest-environment jsdom
import { useLayoutEffect } from "react";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { GraphPreferences, RepositoryRefsSnapshot } from "../bindings";
import {
  createQueryClientWrapper,
  createTestQueryClient,
} from "../test/test-utils";
import { resetWorkspace } from "../test/workspace";
import { useWorkspace } from "./workspace";
import { useGraphModel } from "./graph";

vi.mock("../lib/ipc", () => ({
  getRepositoryRefs: vi.fn(),
  getRepositoryWorktrees: vi.fn(),
}));
const reference = "refs/heads/main";
const snapshot: RepositoryRefsSnapshot = {
  branches: [
    {
      name: "main",
      full_name: reference,
      target: "tip",
      is_remote: false,
      is_head: true,
      is_symbolic: false,
      upstream: null,
      symbolic_target: null,
    },
  ],
  tags: [],
  head: "tip",
  head_reference: reference,
  roots: ["tip"],
};
const preferences = (path: string, revision = 0): GraphPreferences => ({
  path,
  scope: "worktree",
  revision,
  principal: null,
  colors: [
    { reference, color: revision === 0 ? "amber" : "blue", edited: revision },
  ],
});
beforeEach(resetWorkspace);

it("does not overwrite a newer edit between rendering and passive reconciliation", () => {
  const client = createTestQueryClient();
  client.setQueryData(["refs", "/alpha"], snapshot);
  useWorkspace.getState().setGraphPreferences(preferences("/alpha"));
  renderHook(
    () => {
      const graph = useGraphModel("/alpha");
      useLayoutEffect(() => {
        useWorkspace.getState().setGraphPreferences(preferences("/alpha", 1));
      }, []);
      return graph;
    },
    { wrapper: createQueryClientWrapper(client) },
  );
  expect(useWorkspace.getState().graphPreferences[0]?.revision).toBe(1);
  expect(useWorkspace.getState().graphPreferences[0]?.colors[0]?.color).toBe(
    "blue",
  );
});

it("binds a retained callback to its original worktree after switching projects", () => {
  const client = createTestQueryClient();
  client.setQueryData(["refs", "/alpha"], snapshot);
  client.setQueryData(["refs", "/beta"], snapshot);
  const { result, rerender } = renderHook(({ root }) => useGraphModel(root), {
    initialProps: { root: "/alpha" },
    wrapper: createQueryClientWrapper(client),
  });
  const alpha = result.current.changeColor;
  rerender({ root: "/beta" });
  act(() => {
    alpha(reference, "rose");
  });
  const stored = useWorkspace.getState().graphPreferences;
  expect(stored.find((p) => p.path === "/alpha")?.colors[0]?.color).toBe(
    "rose",
  );
  expect(stored.find((p) => p.path === "/beta")?.colors[0]?.color).toBe(
    "amber",
  );
});
