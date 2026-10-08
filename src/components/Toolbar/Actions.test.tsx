// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PullOutcome } from "../../bindings";
import { createIpcMocks, renderWithQueryClient } from "../../test/test-utils";

const mockIpc = createIpcMocks([
  "checkoutBranch",
  "pullFastForward",
  "pushCurrentBranch",
] as const);
const { checkoutBranch, pullFastForward, pushCurrentBranch } = mockIpc;

vi.mock("../../lib/ipc", () => mockIpc);

const { Actions } = await import("./Actions");
const { useGitActions } = await import("./useGitActions");

/** Wires the actions the way the shell does, plus a control that switches branch. */
function Harness({ path = "/tmp/repo" }: { readonly path?: string }) {
  const actions = useGitActions(path);
  return (
    <>
      <Actions actions={actions} currentBranch="dev" />
      <button
        type="button"
        onClick={() => {
          actions.checkout("side");
        }}
      >
        switch
      </button>
    </>
  );
}

function renderActions() {
  return renderWithQueryClient(<Harness />);
}

beforeEach(() => {
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
});
afterEach(cleanup);

describe("Actions", () => {
  it("never pushes without an explicit confirmation", async () => {
    renderActions();

    await userEvent.click(
      screen.getByRole("button", { name: "Enviar cambios" }),
    );

    expect(pushCurrentBranch).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Enviar cambios", hidden: true }),
    ).toBeInstanceOf(HTMLElement);
  });

  it("pushes once the confirmation is accepted", async () => {
    pushCurrentBranch.mockResolvedValue({
      kind: "Pushed",
      branch: "dev",
      remote: "origin",
    });
    renderActions();

    await userEvent.click(
      screen.getByRole("button", { name: "Enviar cambios" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Enviar", hidden: true }),
    );

    await waitFor(() => {
      expect(pushCurrentBranch).toHaveBeenCalledWith("/tmp/repo");
    });
  });

  it("explains a rejected push instead of retrying with force", async () => {
    pushCurrentBranch.mockResolvedValue({
      kind: "RejectedNonFastForward",
      branch: "dev",
    });
    renderActions();

    await userEvent.click(
      screen.getByRole("button", { name: "Enviar cambios" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Enviar", hidden: true }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Tráelos con «Traer cambios»");
    expect(pushCurrentBranch).toHaveBeenCalledTimes(1);
  });

  it("reports a diverged pull without resolving it", async () => {
    pullFastForward.mockResolvedValue({
      kind: "DivergedRequiresMerge",
      local: "dev",
      remote: "origin/dev",
    });
    renderActions();

    await userEvent.click(
      screen.getByRole("button", { name: "Traer cambios" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("divergieron");
  });

  it("says when a pull had nothing to bring", async () => {
    pullFastForward.mockResolvedValue({ kind: "UpToDate" });
    renderActions();

    await userEvent.click(
      screen.getByRole("button", { name: "Traer cambios" }),
    );

    expect(await screen.findByRole("status")).toBeInstanceOf(HTMLElement);
  });

  it("uses singular and plural wording for pull results", async () => {
    renderActions();
    pullFastForward.mockResolvedValue({
      kind: "FastForwarded",
      commits: 1,
      to: "b3f1d1a",
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Traer cambios" }),
    );
    expect(await screen.findByText("Avanzó 1 commit.")).toBeInstanceOf(
      HTMLElement,
    );

    await userEvent.click(screen.getByRole("button", { name: "Cerrar aviso" }));
    pullFastForward.mockResolvedValue({
      kind: "FastForwarded",
      commits: 2,
      to: "b3f1d1a",
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Traer cambios" }),
    );
    expect(await screen.findByText("Avanzó 2 commits.")).toBeInstanceOf(
      HTMLElement,
    );
  });

  it("closes notices and clears them when the repository changes", async () => {
    const { rerender } = renderActions();
    pullFastForward.mockResolvedValue({ kind: "UpToDate" });

    await userEvent.click(
      screen.getByRole("button", { name: "Traer cambios" }),
    );
    expect(await screen.findByText("Ya está al día.")).toBeInstanceOf(
      HTMLElement,
    );
    rerender(<Harness path="/tmp/another-repo" />);
    expect(screen.queryByText("Ya está al día.")).toBeNull();
    rerender(<Harness />);
    expect(screen.queryByText("Ya está al día.")).toBeNull();
  });

  it("does not restore a late notice from the previous repository", async () => {
    let finishPull: (outcome: PullOutcome) => void = () => undefined;
    const { rerender } = renderActions();
    pullFastForward.mockReturnValue(
      new Promise((resolve) => {
        finishPull = resolve;
      }),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Traer cambios" }),
    );
    rerender(<Harness path="/tmp/another-repo" />);
    finishPull({ kind: "UpToDate" });
    await screen.findByRole("button", { name: "Traer cambios" });
    rerender(<Harness />);
    expect(screen.queryByText("Ya está al día.")).toBeNull();
  });

  it("refreshes only live queries for the repository changed by pull", async () => {
    const { client } = renderActions();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    pullFastForward.mockResolvedValue({
      kind: "FastForwarded",
      commits: 1,
      to: "b3f1d1a",
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Traer cambios" }),
    );

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalled();
    });
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual(
      [
        ["history", "/tmp/repo"],
        ["branches", "/tmp/repo"],
        ["tags", "/tmp/repo"],
        ["worktree", "/tmp/repo"],
        ["worktree-file-diff", "/tmp/repo"],
        ["worktree-fingerprint", "/tmp/repo"],
      ],
    );
  });

  it("reports a missing upstream as a state, not a crash", async () => {
    pullFastForward.mockResolvedValue({ kind: "NoUpstream" });
    renderActions();

    await userEvent.click(
      screen.getByRole("button", { name: "Traer cambios" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("rama de seguimiento remoto");
  });

  it("switches branch without force first", async () => {
    checkoutBranch.mockResolvedValue({ kind: "Switched", branch: "side" });
    renderActions();

    await userEvent.click(screen.getByRole("button", { name: "switch" }));

    await waitFor(() => {
      expect(checkoutBranch).toHaveBeenCalledWith("/tmp/repo", "side", false);
    });
    expect((await screen.findByRole("status")).textContent).toContain("side");
  });

  it("asks before discarding work, and only then forces the checkout", async () => {
    checkoutBranch.mockResolvedValueOnce({
      kind: "Blocked",
      conflicts: [{ path: "a.txt", staged: false }],
    });
    renderActions();

    await userEvent.click(screen.getByRole("button", { name: "switch" }));
    expect(await screen.findByText("Hay cambios sin guardar")).toBeInstanceOf(
      HTMLElement,
    );
    expect(screen.getByText("a.txt")).toBeInstanceOf(HTMLElement);
    expect(checkoutBranch).toHaveBeenCalledTimes(1);

    checkoutBranch.mockResolvedValueOnce({ kind: "Switched", branch: "side" });
    await userEvent.click(
      screen.getByRole("button", { name: "Descartar y cambiar", hidden: true }),
    );

    await waitFor(() => {
      expect(checkoutBranch).toHaveBeenLastCalledWith(
        "/tmp/repo",
        "side",
        true,
      );
    });
  });

  it("does not start a checkout while another action is running", async () => {
    pullFastForward.mockReturnValue(new Promise(() => undefined));
    renderActions();

    await userEvent.click(
      screen.getByRole("button", { name: "Traer cambios" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "switch" }));

    expect(checkoutBranch).not.toHaveBeenCalled();
  });
});
