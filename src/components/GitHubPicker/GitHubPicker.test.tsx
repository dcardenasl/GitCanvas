// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GitHubRepository, GitHubRepositoryList } from "../../bindings";

const hasGithubToken = vi.fn<() => Promise<boolean>>();
const listGithubRepositories = vi.fn<() => Promise<GitHubRepositoryList>>();
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

function repositoryList(
  repositories: GitHubRepository[] = [],
  truncated = false,
): GitHubRepositoryList {
  return { repositories, truncated };
}

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
    listGithubRepositories.mockResolvedValue(repositoryList([REPO]));
    renderPicker();

    expect(await screen.findByText("dcardenasl/gitcanvas")).toBeDefined();
    expect(screen.getByText("privado")).toBeDefined();
  });

  it("explains when the API result was capped at one thousand repositories", async () => {
    hasGithubToken.mockResolvedValue(true);
    listGithubRepositories.mockResolvedValue(repositoryList([REPO], true));
    renderPicker();

    expect(
      await screen.findByText(/primeros 1\.000 repositorios/),
    ).toBeDefined();
  });

  it("clones the chosen repository and opens it", async () => {
    hasGithubToken.mockResolvedValue(true);
    listGithubRepositories.mockResolvedValue(repositoryList([REPO]));
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
    listGithubRepositories.mockResolvedValue(repositoryList());

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

  describe("signing in", () => {
    it("sends the token, then lists repositories", async () => {
      hasGithubToken.mockResolvedValueOnce(false);
      storeGithubToken.mockResolvedValue({ login: "david", name: null });
      listGithubRepositories.mockResolvedValue(repositoryList([REPO]));
      renderPicker();

      await userEvent.type(
        await screen.findByLabelText("Personal Access Token"),
        "ghp_secret",
      );
      hasGithubToken.mockResolvedValue(true);
      await userEvent.click(screen.getByRole("button", { name: "Conectar" }));

      expect(storeGithubToken).toHaveBeenCalledWith("ghp_secret");
      expect(await screen.findByText("dcardenasl/gitcanvas")).toBeDefined();
    });

    it("shows why a token was refused and keeps asking", async () => {
      hasGithubToken.mockResolvedValue(false);
      storeGithubToken.mockRejectedValue(new Error("the token is invalid"));
      renderPicker();

      await userEvent.type(
        await screen.findByLabelText("Personal Access Token"),
        "nope",
      );
      await userEvent.click(screen.getByRole("button", { name: "Conectar" }));

      expect((await screen.findByRole("alert")).textContent).toContain(
        "the token is invalid",
      );
      expect(screen.getByLabelText("Personal Access Token")).toBeDefined();
    });
  });

  it("signs out through the keychain", async () => {
    hasGithubToken.mockResolvedValue(true);
    listGithubRepositories.mockResolvedValue(repositoryList());
    forgetGithubToken.mockResolvedValue(null);
    renderPicker();

    await userEvent.click(
      await screen.findByRole("button", { name: "Desconectar" }),
    );

    await waitFor(() => {
      expect(forgetGithubToken).toHaveBeenCalledTimes(1);
    });
  });

  describe("cloning", () => {
    /** A clone that never finishes, so the progress line can be read. */
    async function startClone() {
      let emit: (payload: unknown) => void = () => undefined;
      onCloneProgress.mockImplementation((handler: unknown) => {
        emit = (payload) => {
          (handler as (event: { payload: unknown }) => void)({ payload });
        };
        return Promise.resolve(() => undefined);
      });
      hasGithubToken.mockResolvedValue(true);
      listGithubRepositories.mockResolvedValue(repositoryList([REPO]));
      cloneGithubRepository.mockReturnValue(new Promise(() => undefined));
      renderPicker();
      await userEvent.click(
        await screen.findByRole("button", { name: "Clonar" }),
      );
      return (payload: unknown) => {
        act(() => {
          emit(payload);
        });
      };
    }

    it("shows a percentage once the total is known", async () => {
      const emit = await startClone();

      emit({
        full_name: REPO.full_name,
        received_objects: 50,
        total_objects: 200,
        received_bytes: String(3 * 1024 * 1024),
      });

      expect((await screen.findByRole("status")).textContent).toContain(
        "25% · 3.0 MB",
      );
    });

    it("does not invent a percentage while the server is still counting", async () => {
      const emit = await startClone();

      emit({
        full_name: REPO.full_name,
        received_objects: 0,
        total_objects: 0,
        received_bytes: "1048576",
      });

      expect((await screen.findByRole("status")).textContent).toContain(
        "Preparando… 1.0 MB",
      );
    });

    it("reports a failed clone and lets the user try again", async () => {
      hasGithubToken.mockResolvedValue(true);
      listGithubRepositories.mockResolvedValue(repositoryList([REPO]));
      cloneGithubRepository.mockRejectedValue(new Error("network down"));
      renderPicker();

      await userEvent.click(
        await screen.findByRole("button", { name: "Clonar" }),
      );

      expect((await screen.findByRole("alert")).textContent).toContain(
        "network down",
      );
      expect(
        screen.getByRole("button", { name: "Clonar" }).hasAttribute("disabled"),
      ).toBe(false);
    });
  });
});
