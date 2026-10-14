// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { resetWorkspace, openTestProject } from "../../test/workspace";
import { useWorkspace } from "../../state/workspace";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "./ErrorBoundary";

const restartApplication = vi.hoisted(() => vi.fn());
vi.mock("../../lib/ipc", () => ({ restartApplication }));
beforeEach(() => {
  resetWorkspace();
  restartApplication.mockReset().mockResolvedValue(null);
});

function BrokenView(): never {
  throw new Error("internal repository path should not be shown");
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("shows a localized safe fallback when a child render fails", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <ErrorBoundary>
        <BrokenView />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeInstanceOf(HTMLElement);
    expect(
      screen.getByRole("heading", { name: "GitCanvas encontró un problema" }),
    ).toBeInstanceOf(HTMLElement);
    expect(
      screen.getByRole("button", { name: "Reiniciar GitCanvas" }),
    ).toBeInstanceOf(HTMLElement);
    expect(
      screen.queryByText("internal repository path should not be shown"),
    ).toBeNull();
  });
  it("requests a native restart and keeps a failed attempt recoverable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    restartApplication.mockRejectedValueOnce(new Error("restart failed"));
    render(
      <ErrorBoundary>
        <BrokenView />
      </ErrorBoundary>,
    );
    const button = screen.getByRole("button", { name: "Reiniciar GitCanvas" });
    await userEvent.click(button);
    expect(await screen.findByText("restart failed")).toBeInstanceOf(
      HTMLElement,
    );
    await userEvent.click(button);
    expect(restartApplication).toHaveBeenCalledTimes(2);
  });

  it("cannot restart while a known repository write is running", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    openTestProject();
    useWorkspace.getState().updateGitActions("/tmp/repo", (state) => ({
      ...state,
      running: "pull",
    }));
    render(
      <ErrorBoundary>
        <BrokenView />
      </ErrorBoundary>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Reiniciar GitCanvas" }),
    );
    expect(restartApplication).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain(
      "termine la operación",
    );
  });
});
