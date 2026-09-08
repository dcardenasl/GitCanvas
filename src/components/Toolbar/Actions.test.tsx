// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CheckoutOutcome, PullOutcome, PushOutcome } from "../../bindings";

const checkoutBranch =
  vi.fn<
    (path: string, branch: string, force: boolean) => Promise<CheckoutOutcome>
  >();
const pullFastForward = vi.fn<(path: string) => Promise<PullOutcome>>();
const pushCurrentBranch = vi.fn<(path: string) => Promise<PushOutcome>>();

vi.mock("../../lib/ipc", () => ({
  checkoutBranch: (path: string, branch: string, force: boolean) =>
    checkoutBranch(path, branch, force),
  pullFastForward: (path: string) => pullFastForward(path),
  pushCurrentBranch: (path: string) => pushCurrentBranch(path),
}));

const { Actions } = await import("./Actions");

function renderActions() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <Actions repositoryPath="/tmp/repo" currentBranch="dev" />
    </QueryClientProvider>,
  );
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

    await userEvent.click(screen.getByRole("button", { name: "Push" }));

    expect(pushCurrentBranch).not.toHaveBeenCalled();
    expect(screen.getByText("Enviar cambios")).toBeDefined();
  });

  it("pushes once the confirmation is accepted", async () => {
    pushCurrentBranch.mockResolvedValue({
      kind: "Pushed",
      branch: "dev",
      remote: "origin",
    });
    renderActions();

    await userEvent.click(screen.getByRole("button", { name: "Push" }));
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

    await userEvent.click(screen.getByRole("button", { name: "Push" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Enviar", hidden: true }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Tráelos con pull");
    expect(pushCurrentBranch).toHaveBeenCalledTimes(1);
  });

  it("reports a diverged pull without resolving it", async () => {
    pullFastForward.mockResolvedValue({
      kind: "DivergedRequiresMerge",
      local: "dev",
      remote: "origin/dev",
    });
    renderActions();

    await userEvent.click(screen.getByRole("button", { name: "Pull" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("divergieron");
  });

  it("says when a pull had nothing to bring", async () => {
    pullFastForward.mockResolvedValue({ kind: "UpToDate" });
    renderActions();

    await userEvent.click(screen.getByRole("button", { name: "Pull" }));

    expect(await screen.findByRole("status")).toBeDefined();
  });

  it("reports a missing upstream as a state, not a crash", async () => {
    pullFastForward.mockResolvedValue({ kind: "NoUpstream" });
    renderActions();

    await userEvent.click(screen.getByRole("button", { name: "Pull" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("upstream");
  });
});
