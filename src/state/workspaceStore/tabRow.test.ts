import { describe, expect, it } from "vitest";

import { IDLE_GIT_ACTIONS } from "../gitActionState";
import { EMPTY_NAVIGATION } from "../navigation";
import { VERIFIED, VERIFYING, type Verification } from "../verification";
import { changeTab, neighborOf, prepareActivation, tabOf } from "./tabRow";
import type { Tab, WorkspaceState } from "./types";

function tab(name: string, verification: Verification = VERIFIED): Tab {
  return {
    repository: { path: `/work/${name}`, name },
    navigation: EMPTY_NAVIGATION,
    gitActions: IDLE_GIT_ACTIONS,
    verification,
  };
}

const state = (tabs: readonly Tab[]) => ({ tabs }) as unknown as WorkspaceState;

describe("neighborOf", () => {
  const row = [tab("a"), tab("b"), tab("c")];

  it("prefers the tab on the right, then the one on the left", () => {
    expect(neighborOf(row, "/work/a")).toBe("/work/b");
    expect(neighborOf(row, "/work/b")).toBe("/work/c");
    expect(neighborOf(row, "/work/c")).toBe("/work/b");
  });

  it("has none for the only tab, or for a tab not in the row", () => {
    expect(neighborOf([tab("a")], "/work/a")).toBeNull();
    expect(neighborOf([], "/work/a")).toBeNull();
  });
});

describe("prepareActivation", () => {
  it("marks a verified tab as needing a check when it becomes active", () => {
    const [, b] = prepareActivation([tab("a"), tab("b")], "/work/b", "/work/a");

    expect(b?.verification.status).toBe("unverified");
  });

  it("leaves every other tab alone", () => {
    const [a] = prepareActivation([tab("a"), tab("b")], "/work/b", "/work/a");

    expect(a?.verification.status).toBe("verified");
  });

  it("does not disturb a check already running or already pending", () => {
    const rows = prepareActivation(
      [tab("a", VERIFYING), tab("b", { status: "unverified" })],
      "/work/a",
      "/work/b",
    );
    expect(rows[0]?.verification.status).toBe("verifying");

    const pending = prepareActivation(
      [tab("a", { status: "unverified" })],
      "/work/a",
      null,
    );
    expect(pending[0]?.verification.status).toBe("unverified");
  });

  it("does not re-check the tab that was already active", () => {
    const [a] = prepareActivation([tab("a")], "/work/a", "/work/a");

    expect(a?.verification.status).toBe("verified");
  });

  it("re-checks an unreachable tab only when it is explicitly reopened", () => {
    const unreachable = tab("a", {
      status: "unreachable",
      error: new Error("x"),
    });

    const still = prepareActivation([unreachable], "/work/a", "/work/a");
    expect(still[0]?.verification.status).toBe("unreachable");

    const reopened = prepareActivation(
      [unreachable],
      "/work/a",
      "/work/a",
      true,
    );
    expect(reopened[0]?.verification.status).toBe("unverified");
  });

  it("changes nothing when no tab is the target", () => {
    const row = [tab("a")];

    const result = prepareActivation(row, null, "/work/a");

    expect(result[0]).toBe(row[0]);
  });
});

describe("changeTab", () => {
  it("replaces only the tab named", () => {
    const initial = state([tab("a"), tab("b")]);

    const result = changeTab(initial, "/work/b", (t) => ({
      ...t,
      verification: VERIFYING,
    }));

    const tabs = (result as Pick<WorkspaceState, "tabs">).tabs;
    expect(tabs[0]).toBe(initial.tabs[0]);
    expect(tabs[1]?.verification.status).toBe("verifying");
  });

  it("returns the state itself when the project is not open or nothing changed", () => {
    const initial = state([tab("a")]);

    expect(changeTab(initial, "/work/missing", (t) => t)).toBe(initial);
    expect(changeTab(initial, "/work/a", (t) => t)).toBe(initial);
  });
});

describe("tabOf", () => {
  it("finds a tab by root", () => {
    const initial = state([tab("a"), tab("b")]);

    expect(tabOf(initial, "/work/b")?.repository.name).toBe("b");
    expect(tabOf(initial, "/work/none")).toBeNull();
  });
});
