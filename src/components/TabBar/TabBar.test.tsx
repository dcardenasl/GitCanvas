// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createIpcMocks } from "../../test/test-utils";

const open = vi.fn<(options: unknown) => Promise<string | null>>();
const mockIpc = createIpcMocks(["openRepository"] as const);
const { openRepository } = mockIpc;

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (options: unknown) => open(options),
}));
vi.mock("../../lib/ipc", () => mockIpc);

const { TabBar } = await import("./TabBar");
const { useWorkspace } = await import("../../state/workspace");
const { openTestProject, resetWorkspace, activeRoot } =
  await import("../../test/workspace");

const ALPHA = { path: "/work/alpha", name: "alpha" };
const BETA = { path: "/work/beta", name: "beta" };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetWorkspace();
  HTMLDialogElement.prototype.showModal = vi.fn();
});
afterEach(cleanup);

function tab(name: string): HTMLElement {
  return screen.getByRole("tab", { name: new RegExp(`^${name}`) });
}

describe("TabBar", () => {
  it("shows a tab per open project and marks the active one", () => {
    openTestProject(ALPHA);
    openTestProject(BETA);
    render(<TabBar />);

    expect(screen.getAllByRole("tab").map((el) => el.textContent)).toEqual([
      "alpha",
      "beta",
    ]);
    expect(tab("beta").getAttribute("aria-selected")).toBe("true");
    expect(tab("alpha").getAttribute("aria-selected")).toBe("false");
    // Only the selected tab is in the tab order, as a tab list is meant to be.
    expect(tab("beta").tabIndex).toBe(0);
    expect(tab("alpha").tabIndex).toBe(-1);
    expect(
      screen.getByRole("tablist", { name: "Proyectos abiertos" }),
    ).toBeTruthy();
  });

  it("activates a project when its tab is chosen", async () => {
    openTestProject(ALPHA);
    openTestProject(BETA);
    render(<TabBar />);

    await userEvent.click(tab("alpha"));

    expect(activeRoot()).toBe(ALPHA.path);
    expect(tab("alpha").getAttribute("aria-selected")).toBe("true");
  });

  it("closes a tab and hands over to its neighbor", async () => {
    openTestProject(ALPHA);
    openTestProject(BETA);
    render(<TabBar />);

    await userEvent.click(screen.getByRole("button", { name: "Cerrar beta" }));

    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(activeRoot()).toBe(ALPHA.path);
  });

  it("will not close a tab whose project is being written to", () => {
    openTestProject(ALPHA);
    act(() => {
      useWorkspace.getState().updateGitActions(ALPHA.path, (state) => ({
        ...state,
        running: "pull",
      }));
    });
    render(<TabBar />);

    const close = screen.getByRole<HTMLButtonElement>("button", {
      name: "Cerrar alpha",
    });
    expect(close.disabled).toBe(true);
    expect(close.title).toBe("Todavía se está escribiendo en alpha");
    expect(tab("alpha").getAttribute("aria-busy")).toBe("true");
    expect(
      screen.getByRole("img", { name: "Escribiendo en el repositorio" }),
    ).toBeTruthy();
  });

  it.each([
    [
      "unverified",
      { status: "unverified" } as const,
      "Sin comprobar desde que se restauró",
    ],
    [
      "unreachable",
      { status: "unreachable", error: new Error("gone") } as const,
      "No se pudo abrir",
    ],
  ])("marks a %s project", (_name, verification, label) => {
    openTestProject(ALPHA);
    act(() => {
      useWorkspace.getState().setVerification(ALPHA.path, verification);
    });
    render(<TabBar />);

    expect(screen.getByRole("img", { name: label })).toBeTruthy();
  });

  it("marks nothing on a project that is fine, or while one is being checked", () => {
    openTestProject(ALPHA);
    act(() => {
      useWorkspace
        .getState()
        .setVerification(ALPHA.path, { status: "verifying" });
    });
    render(<TabBar />);

    expect(screen.queryByRole("img")).toBeNull();
  });

  it("tells namesakes apart and always carries the full path", () => {
    openTestProject({ path: "/work/app", name: "app" });
    openTestProject({ path: "/clients/acme/app", name: "app" });
    render(<TabBar />);

    expect(screen.getAllByRole("tab").map((el) => el.textContent)).toEqual([
      "app — work",
      "app — acme",
    ]);
    expect(screen.getAllByRole("tab").map((el) => el.title)).toEqual([
      "/work/app",
      "/clients/acme/app",
    ]);
  });

  it("lists every project in a menu once there is more than one, and switches from it", async () => {
    openTestProject(ALPHA);
    render(<TabBar />);
    expect(
      screen.queryByRole("button", { name: "Todos los proyectos abiertos" }),
    ).toBeNull();

    act(() => {
      openTestProject(BETA);
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Todos los proyectos abiertos" }),
    );
    await userEvent.click(screen.getByRole("menuitem", { name: "alpha" }));

    expect(activeRoot()).toBe(ALPHA.path);
  });

  describe("opening a project", () => {
    it("offers a folder or GitHub from the plus menu", async () => {
      openTestProject(ALPHA);
      render(<TabBar />);

      await userEvent.click(
        screen.getByRole("button", { name: "Abrir un proyecto" }),
      );

      expect(
        screen.getAllByRole("menuitem").map((item) => item.textContent),
      ).toEqual(["Abrir carpeta…", "Clonar de GitHub…"]);
    });

    it("opens the chosen folder as another tab", async () => {
      openTestProject(ALPHA);
      open.mockResolvedValue("/work/beta");
      openRepository.mockResolvedValue(BETA);
      render(<TabBar />);

      await userEvent.click(
        screen.getByRole("button", { name: "Abrir un proyecto" }),
      );
      await userEvent.click(
        screen.getByRole("menuitem", { name: "Abrir carpeta…" }),
      );

      await waitFor(() => {
        expect(activeRoot()).toBe(BETA.path);
      });
      expect(screen.getAllByRole("tab")).toHaveLength(2);
    });

    it("shows the GitHub view from the menu", async () => {
      openTestProject(ALPHA);
      render(<TabBar />);

      await userEvent.click(
        screen.getByRole("button", { name: "Abrir un proyecto" }),
      );
      await userEvent.click(
        screen.getByRole("menuitem", { name: "Clonar de GitHub…" }),
      );

      expect(useWorkspace.getState().githubOpen).toBe(true);
    });

    it("says why a folder could not be opened and lets the person dismiss it", async () => {
      openTestProject(ALPHA);
      open.mockResolvedValue("/tmp/plain");
      openRepository.mockRejectedValue(new Error("not a repository"));
      render(<TabBar />);

      await userEvent.click(
        screen.getByRole("button", { name: "Abrir un proyecto" }),
      );
      await userEvent.click(
        screen.getByRole("menuitem", { name: "Abrir carpeta…" }),
      );

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("not a repository");
      await userEvent.click(screen.getByRole("button", { name: "Descartar" }));
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("cannot be started twice while the folder panel is up", async () => {
      openTestProject(ALPHA);
      open.mockReturnValue(new Promise(() => undefined));
      render(<TabBar />);

      await userEvent.click(
        screen.getByRole("button", { name: "Abrir un proyecto" }),
      );
      await userEvent.click(
        screen.getByRole("menuitem", { name: "Abrir carpeta…" }),
      );

      await waitFor(() => {
        expect(
          screen.getByRole<HTMLButtonElement>("button", {
            name: "Abrir un proyecto",
          }).disabled,
        ).toBe(true);
      });
    });
  });
});
