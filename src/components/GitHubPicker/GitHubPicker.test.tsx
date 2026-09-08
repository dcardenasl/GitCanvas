// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GitHubRepository } from "../../bindings";

const hasGithubToken = vi.fn<() => Promise<boolean>>();
const listGithubRepositories = vi.fn<() => Promise<GitHubRepository[]>>();
const storeGithubToken =
  vi.fn<(token: string) => Promise<{ login: string; name: string | null }>>();
const cloneGithubRepository =
  vi.fn<
    (url: string, name: string) => Promise<{ path: string; full_name: string }>
  >();
const openRepository =
  vi.fn<(path: string) => Promise<{ path: string; name: string }>>();
const forgetGithubToken = vi.fn<() => Promise<null>>();
const onCloneProgress = vi.fn<(handler: unknown) => Promise<() => void>>(() =>
  Promise.resolve(() => undefined),
);

vi.mock("../../lib/ipc", () => ({
  hasGithubToken: () => hasGithubToken(),
  listGithubRepositories: () => listGithubRepositories(),
  storeGithubToken: (token: string) => storeGithubToken(token),
  cloneGithubRepository: (url: string, name: string) =>
    cloneGithubRepository(url, name),
  openRepository: (path: string) => openRepository(path),
  forgetGithubToken: () => forgetGithubToken(),
  onCloneProgress: (handler: unknown) => onCloneProgress(handler),
}));

const { GitHubPicker } = await import("./GitHubPicker");

const REPO: GitHubRepository = {
  full_name: "dcardenasl/gitcanvas",
  clone_url: "https://github.com/dcardenasl/gitcanvas.git",
  private: true,
  default_branch: "main",
  description: "Visual git client",
};

function renderPicker(onClose = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <GitHubPicker onClose={onClose} />
    </QueryClientProvider>,
  );
  return onClose;
}

beforeEach(() => {
  vi.clearAllMocks();
  onCloneProgress.mockImplementation(() => Promise.resolve(() => undefined));
});
afterEach(cleanup);

describe("GitHubPicker", () => {
  it("asks for a token when none is stored", async () => {
    hasGithubToken.mockResolvedValue(false);
    renderPicker();

    expect(await screen.findByLabelText("Personal Access Token")).toBeDefined();
  });

  it("uses a password field so the token is never shown on screen", async () => {
    hasGithubToken.mockResolvedValue(false);
    renderPicker();

    const input = await screen.findByLabelText("Personal Access Token");
    expect(input.getAttribute("type")).toBe("password");
  });

  it("refuses to submit an empty token", async () => {
    hasGithubToken.mockResolvedValue(false);
    renderPicker();

    const submit = await screen.findByRole("button", { name: "Conectar" });
    expect(submit.hasAttribute("disabled")).toBe(true);
  });

  it("lists repositories once a token is stored", async () => {
    hasGithubToken.mockResolvedValue(true);
    listGithubRepositories.mockResolvedValue([REPO]);
    renderPicker();

    expect(await screen.findByText("dcardenasl/gitcanvas")).toBeDefined();
    expect(screen.getByText("privado")).toBeDefined();
  });

  it("clones the chosen repository and opens it", async () => {
    hasGithubToken.mockResolvedValue(true);
    listGithubRepositories.mockResolvedValue([REPO]);
    cloneGithubRepository.mockResolvedValue({
      path: "/cache/dcardenasl_gitcanvas",
      full_name: REPO.full_name,
    });
    openRepository.mockResolvedValue({
      path: "/cache/dcardenasl_gitcanvas",
      name: "gitcanvas",
    });
    const onClose = renderPicker();

    await userEvent.click(
      await screen.findByRole("button", { name: "Clonar" }),
    );

    await waitFor(() => {
      expect(cloneGithubRepository).toHaveBeenCalledWith(
        REPO.clone_url,
        REPO.full_name,
      );
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("reports a rejected token instead of failing silently", async () => {
    hasGithubToken.mockResolvedValue(true);
    listGithubRepositories.mockRejectedValue(
      new Error("the GitHub token is invalid or lacks the required scopes"),
    );
    renderPicker();

    expect(await screen.findByRole("alert")).toBeDefined();
  });

  it("stops listening for progress when it goes away", async () => {
    const stop = vi.fn();
    onCloneProgress.mockImplementation(() => Promise.resolve(stop));
    hasGithubToken.mockResolvedValue(true);
    listGithubRepositories.mockResolvedValue([]);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { unmount } = render(
      <QueryClientProvider client={client}>
        <GitHubPicker onClose={vi.fn()} />
      </QueryClientProvider>,
    );
    unmount();

    await waitFor(() => {
      expect(stop).toHaveBeenCalled();
    });
  });
});
