// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithQueryClient } from "../../test/test-utils";

const { getWorkspaceLimits, loadWorkspace } = vi.hoisted(() => ({
  getWorkspaceLimits: vi.fn(),
  loadWorkspace: vi.fn(),
}));
vi.mock("../../state/workspaceLifecycle", () => ({
  useWorkspaceLifecycle: () => ({ retry: vi.fn() }),
}));
vi.mock("../../lib/ipc", () => ({
  getWorkspaceLimits,
  loadWorkspace,
  IpcError: class extends Error {
    constructor(error: { message: string }) {
      super(error.message);
    }
  },
}));

const { WorkspaceGate } = await import("./WorkspaceGate");
const { useWorkspace } = await import("../../state/workspace");

const LIMITS = { max_tabs: 30, max_favorites: 200, max_recents: 20 };

beforeEach(() => {
  getWorkspaceLimits.mockReset();
  loadWorkspace.mockResolvedValue({
    workspace: { tabs: [], active: null, favorites: [], recents: [] },
    recovery: null,
  });
  useWorkspace.setState({
    limits: null,
    tabs: [],
    activeRoot: null,
    storageError: null,
  });
});
afterEach(cleanup);

function renderGate() {
  return renderWithQueryClient(
    <WorkspaceGate>
      <p>the application</p>
    </WorkspaceGate>,
  );
}

describe("WorkspaceGate", () => {
  it("holds the application back until the bounds are known", async () => {
    getWorkspaceLimits.mockResolvedValue(LIMITS);
    renderGate();

    expect(screen.queryByText("the application")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Iniciando");

    expect(await screen.findByText("the application")).toBeInstanceOf(
      HTMLElement,
    );
    expect(useWorkspace.getState().limits).toEqual(LIMITS);
  });

  it("says why it cannot start and starts once retried", async () => {
    getWorkspaceLimits.mockRejectedValueOnce(new Error("backend unavailable"));
    getWorkspaceLimits.mockResolvedValue(LIMITS);
    renderGate();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("no pudo iniciar");
    expect(alert.textContent).toContain("backend unavailable");
    expect(screen.queryByText("the application")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await waitFor(() => {
      expect(screen.getByText("the application")).toBeInstanceOf(HTMLElement);
    });
  });

  it("does not hold the application back once the bounds are known", () => {
    useWorkspace.setState({ limits: LIMITS });
    getWorkspaceLimits.mockResolvedValue(LIMITS);
    renderGate();

    expect(screen.getByText("the application")).toBeInstanceOf(HTMLElement);
  });
  it("restores both tabs as unverified before the application can read repositories", async () => {
    getWorkspaceLimits.mockResolvedValue(LIMITS);
    loadWorkspace.mockResolvedValue({
      workspace: {
        tabs: ["/tmp/alpha", "/tmp/beta"].map((path) => ({
          path,
          selection: { kind: "history" },
          history_anchor: null,
          collapsed_folders: [],
        })),
        active: "/tmp/beta",
        favorites: ["/tmp/alpha"],
        recents: [],
      },
      recovery: null,
    });
    renderGate();
    await screen.findByText("the application");
    expect(useWorkspace.getState().activeRoot).toBe("/tmp/beta");
    expect(
      useWorkspace.getState().tabs.map((tab) => tab.verification.status),
    ).toEqual(["unverified", "unverified"]);
    expect(useWorkspace.getState().favorites).toEqual(["/tmp/alpha"]);
  });
  it("shows damaged storage while continuing in memory and preserves the warning after a save", async () => {
    getWorkspaceLimits.mockResolvedValue(LIMITS);
    loadWorkspace.mockResolvedValue({
      workspace: { tabs: [], active: null, favorites: [], recents: [] },
      recovery: {
        kind: "Corrupt",
        detail: "bad json",
        backup: "/data/workspace.json.corrupt-1",
      },
    });
    renderGate();
    await screen.findByText("the application");
    expect(screen.getByRole("alert").textContent).toContain(
      "original se conservó",
    );
    expect(useWorkspace.getState().storageError?.kind).toBe("recovery");
    useWorkspace.getState().setStorageError(null);
    expect(useWorkspace.getState().storageError?.kind).toBe("recovery");
    await userEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
