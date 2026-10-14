// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithQueryClient } from "../../test/test-utils";

const getWorkspaceLimits = vi.hoisted(() => vi.fn());
vi.mock("../../lib/ipc", () => ({ getWorkspaceLimits }));

const { WorkspaceGate } = await import("./WorkspaceGate");
const { useWorkspace } = await import("../../state/workspace");

const LIMITS = { max_tabs: 30, max_favorites: 200, max_recents: 20 };

beforeEach(() => {
  getWorkspaceLimits.mockReset();
  useWorkspace.setState({ limits: null });
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
});
