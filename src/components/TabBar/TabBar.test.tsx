// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
const { useOpenFolder } = await import("../AppShell/useOpenFolder");
const { useWorkspace } = await import("../../state/workspace");
const { openTestProject, resetWorkspace, activeRoot } =
  await import("../../test/workspace");

/** Wires the bar to a folder opener the way the shell does. */
function Harness() {
  const folder = useOpenFolder();
  return <TabBar folder={folder} />;
}

const ALPHA = { path: "/work/alpha", name: "alpha" };
const BETA = { path: "/work/beta", name: "beta" };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetWorkspace();
  HTMLDialogElement.prototype.showModal = vi.fn();
});
afterEach(() => {
  cleanup();
  document.documentElement.dir = "ltr";
  vi.restoreAllMocks();
});

function tab(name: string): HTMLElement {
  return screen.getByRole("tab", { name: new RegExp(`^${name}`) });
}

describe("TabBar", () => {
  it("shows a tab per open project and marks the active one", () => {
    openTestProject(ALPHA);
    openTestProject(BETA);
    render(<Harness />);

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
    render(<Harness />);

    await userEvent.click(tab("alpha"));

    expect(activeRoot()).toBe(ALPHA.path);
    expect(tab("alpha").getAttribute("aria-selected")).toBe("true");
  });

  it("closes a tab and hands over to its neighbor", async () => {
    openTestProject(ALPHA);
    openTestProject(BETA);
    render(<Harness />);

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
    render(<Harness />);

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

  it("marks a project whose folder could not be opened", () => {
    openTestProject(ALPHA);
    act(() => {
      useWorkspace.getState().setVerification(ALPHA.path, {
        status: "unreachable",
        error: new Error("gone"),
      });
    });
    render(<Harness />);

    expect(screen.getByRole("img", { name: "No se pudo abrir" })).toBeTruthy();
  });

  it("does not mark a project that merely has not been checked yet", () => {
    openTestProject(ALPHA);
    openTestProject(BETA);
    act(() => {
      useWorkspace
        .getState()
        .setVerification(ALPHA.path, { status: "unverified" });
    });
    render(<Harness />);

    // Every restored tab is in this state until it is shown; it is not news.
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("marks nothing on a project that is fine, or while one is being checked", () => {
    openTestProject(ALPHA);
    act(() => {
      useWorkspace
        .getState()
        .setVerification(ALPHA.path, { status: "verifying" });
    });
    render(<Harness />);

    expect(screen.queryByRole("img")).toBeNull();
  });

  it("tells namesakes apart and always carries the full path", () => {
    openTestProject({ path: "/work/app", name: "app" });
    openTestProject({ path: "/clients/acme/app", name: "app" });
    render(<Harness />);

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
    render(<Harness />);
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
      render(<Harness />);

      await userEvent.click(
        screen.getByRole("button", { name: "Abrir un proyecto" }),
      );

      expect(
        screen
          .getAllByRole("menuitem")
          .map((item) => item.querySelector("span")?.textContent),
      ).toEqual([
        "Abrir carpeta…",
        "Clonar de GitHub…",
        "Favoritos",
        "Proyectos recientes",
        "Agregar alpha a favoritos",
      ]);
    });

    it("offers Reopen Closed Tab only once a tab has been closed, and reopens it", async () => {
      openTestProject(ALPHA);
      openTestProject(BETA);
      render(<Harness />);
      await userEvent.click(
        screen.getByRole("button", { name: "Abrir un proyecto" }),
      );
      expect(
        screen.queryByRole("menuitem", { name: "Reabrir pestaña cerrada" }),
      ).toBeNull();
      await userEvent.keyboard("{Escape}");

      act(() => {
        useWorkspace.getState().closeTab(BETA.path);
      });
      await userEvent.click(
        screen.getByRole("button", { name: "Abrir un proyecto" }),
      );
      const reopen = screen.getByRole("menuitem", {
        name: "Reabrir pestaña cerrada",
      });
      expect(reopen.querySelector("kbd")?.textContent).toBe("Ctrl+Shift+T");
      await userEvent.click(reopen);

      expect(activeRoot()).toBe(BETA.path);
      expect(screen.getAllByRole("tab")).toHaveLength(2);
    });

    it("groups the menu: opening, then the library, then starring this project", async () => {
      openTestProject(ALPHA);
      render(<Harness />);

      await userEvent.click(
        screen.getByRole("button", { name: "Abrir un proyecto" }),
      );

      const menu = screen.getByRole("menu");
      const order = Array.from(menu.children).map((child) =>
        child.getAttribute("role") === "separator"
          ? "—"
          : (child.querySelector("span")?.textContent ?? ""),
      );
      expect(order).toEqual([
        "Abrir carpeta…",
        "Clonar de GitHub…",
        "—",
        "Favoritos",
        "Proyectos recientes",
        "—",
        "Agregar alpha a favoritos",
      ]);
    });

    it("shows the shortcut that opens a folder, as the platform writes it", async () => {
      openTestProject(ALPHA);
      render(<Harness />);

      await userEvent.click(
        screen.getByRole("button", { name: "Abrir un proyecto" }),
      );

      const open = screen.getByRole("menuitem", { name: "Abrir carpeta…" });
      expect(open.querySelector("kbd")?.textContent).toBe("Ctrl+O");
      expect(open.getAttribute("aria-keyshortcuts")).toBe("Ctrl+O");
    });

    it("writes the shortcut with the Command key on macOS", async () => {
      vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      );
      openTestProject(ALPHA);
      render(<Harness />);

      await userEvent.click(
        screen.getByRole("button", { name: "Abrir un proyecto" }),
      );

      expect(
        screen
          .getByRole("menuitem", { name: /Abrir carpeta/ })
          .querySelector("kbd")?.textContent,
      ).toBe("⌘O");
    });

    it("opens the chosen folder as another tab", async () => {
      openTestProject(ALPHA);
      open.mockResolvedValue("/work/beta");
      openRepository.mockResolvedValue(BETA);
      render(<Harness />);

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
      render(<Harness />);

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
      render(<Harness />);

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
      render(<Harness />);

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

  describe("from the keyboard", () => {
    function openThree() {
      openTestProject(ALPHA);
      openTestProject(BETA);
      openTestProject({ path: "/work/gamma", name: "gamma" });
      render(<Harness />);
      tab("gamma").focus();
    }

    it("moves focus along the row with the arrow keys, wrapping, without activating", async () => {
      openThree();

      await userEvent.keyboard("{ArrowRight}");
      expect(document.activeElement).toBe(tab("alpha"));
      await userEvent.keyboard("{ArrowLeft}");
      expect(document.activeElement).toBe(tab("gamma"));
      await userEvent.keyboard("{ArrowLeft}");
      expect(document.activeElement).toBe(tab("beta"));
      // Moving focus is not choosing: that takes Enter, since choosing a
      // project checks its folder.
      expect(activeRoot()).toBe("/work/gamma");
    });

    it("reaches the first and last tab with Home and End", async () => {
      openThree();

      await userEvent.keyboard("{Home}");
      expect(document.activeElement).toBe(tab("alpha"));
      await userEvent.keyboard("{End}");
      expect(document.activeElement).toBe(tab("gamma"));
    });

    it("activates the focused tab with Enter", async () => {
      openThree();
      await userEvent.keyboard("{Home}{Enter}");

      expect(activeRoot()).toBe(ALPHA.path);
    });

    it("reverses the arrows for a right-to-left language", async () => {
      document.documentElement.dir = "rtl";
      openThree();

      await userEvent.keyboard("{ArrowRight}");

      expect(document.activeElement).toBe(tab("beta"));
    });

    it("moves the focused tab with Alt and the arrows, keeping focus on it", async () => {
      openThree();

      await userEvent.keyboard("{Alt>}{ArrowLeft}{ArrowLeft}{/Alt}");

      expect(
        useWorkspace.getState().tabs.map((entry) => entry.repository.name),
      ).toEqual(["gamma", "alpha", "beta"]);
      expect(document.activeElement).toBe(tab("gamma"));
      expect(activeRoot()).toBe("/work/gamma");
    });

    it("closes the focused tab with Delete and lands on the active one", async () => {
      openThree();
      await userEvent.keyboard("{Home}{Delete}");

      expect(screen.queryByRole("tab", { name: /^alpha/ })).toBeNull();
      await waitFor(() => {
        expect(document.activeElement).toBe(tab("gamma"));
      });
    });

    it("will not close a tab that is being written to", async () => {
      openThree();
      act(() => {
        useWorkspace.getState().updateGitActions("/work/gamma", (state) => ({
          ...state,
          running: "pull",
        }));
      });

      await userEvent.keyboard("{Delete}");

      expect(screen.getAllByRole("tab")).toHaveLength(3);
    });

    it("keeps the close buttons out of the tab order, one stop per row", () => {
      openThree();

      for (const close of screen.getAllByRole("button", { name: /^Cerrar/ })) {
        expect(close.tabIndex).toBe(-1);
      }
    });
  });

  describe("by dragging", () => {
    /** Lays the tabs out 100px wide in their current order. */
    function layOutTabs() {
      vi.spyOn(
        HTMLElement.prototype,
        "getBoundingClientRect",
      ).mockImplementation(function (this: HTMLElement) {
        const row = Array.from(
          document.querySelectorAll<HTMLElement>('[role="tab"]'),
        );
        const index = row.indexOf(this);
        const left = index < 0 ? 0 : index * 100;
        return {
          left,
          right: left + 100,
          top: 0,
          bottom: 30,
          width: 100,
          height: 30,
          x: left,
          y: 0,
          toJSON: () => ({}),
        };
      });
      Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
        configurable: true,
        value: vi.fn(),
      });
      Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
        configurable: true,
        value: vi.fn(),
      });
    }

    function names(): string[] {
      return useWorkspace.getState().tabs.map((entry) => entry.repository.name);
    }

    function pointer(
      target: HTMLElement,
      type: "pointerDown" | "pointerMove" | "pointerUp",
      x: number,
    ) {
      fireEvent[type](target, { pointerId: 1, clientX: x, button: 0 });
    }

    function openThreeLaidOut() {
      openTestProject(ALPHA);
      openTestProject(BETA);
      openTestProject({ path: "/work/gamma", name: "gamma" });
      render(<Harness />);
      layOutTabs();
    }

    afterEach(() => {
      Reflect.deleteProperty(HTMLElement.prototype, "setPointerCapture");
      Reflect.deleteProperty(HTMLElement.prototype, "releasePointerCapture");
    });

    it("moves a tab once the pointer passes the middle of its neighbor", () => {
      openThreeLaidOut();
      const alpha = tab("alpha");

      pointer(alpha, "pointerDown", 50);
      pointer(alpha, "pointerMove", 120);
      expect(names()).toEqual(["alpha", "beta", "gamma"]);
      pointer(alpha, "pointerMove", 160);
      expect(names()).toEqual(["beta", "alpha", "gamma"]);
      pointer(alpha, "pointerUp", 160);
    });

    it("does not swap back and forth under a pointer that has stopped", () => {
      openThreeLaidOut();
      const alpha = tab("alpha");

      pointer(alpha, "pointerDown", 50);
      pointer(alpha, "pointerMove", 160);
      const after = names();
      for (let step = 0; step < 5; step += 1)
        pointer(alpha, "pointerMove", 160);

      expect(names()).toEqual(after);
    });

    it("moves a tab toward the start too", () => {
      openThreeLaidOut();
      const gamma = tab("gamma");

      pointer(gamma, "pointerDown", 250);
      pointer(gamma, "pointerMove", 140);

      expect(names()).toEqual(["alpha", "gamma", "beta"]);
    });

    it("does not take a small movement for a drag, and still selects on click", async () => {
      openThreeLaidOut();
      const alpha = tab("alpha");

      pointer(alpha, "pointerDown", 50);
      pointer(alpha, "pointerMove", 53);
      pointer(alpha, "pointerUp", 53);
      await userEvent.click(alpha);

      expect(names()).toEqual(["alpha", "beta", "gamma"]);
      expect(activeRoot()).toBe(ALPHA.path);
    });

    it("does not select the tab that was dragged when the drag ends", () => {
      openThreeLaidOut();
      const alpha = tab("alpha");

      pointer(alpha, "pointerDown", 50);
      pointer(alpha, "pointerMove", 160);
      pointer(alpha, "pointerUp", 160);
      fireEvent.click(alpha);

      expect(activeRoot()).toBe("/work/gamma");
      // The next, ordinary click selects as usual.
      fireEvent.click(alpha);
      expect(activeRoot()).toBe(ALPHA.path);
    });

    it("ignores a press of another button and another pointer", () => {
      openThreeLaidOut();
      const alpha = tab("alpha");

      fireEvent.pointerDown(alpha, { pointerId: 1, clientX: 50, button: 2 });
      pointer(alpha, "pointerMove", 160);
      expect(names()).toEqual(["alpha", "beta", "gamma"]);

      pointer(alpha, "pointerDown", 50);
      fireEvent.pointerMove(alpha, { pointerId: 2, clientX: 160 });
      expect(names()).toEqual(["alpha", "beta", "gamma"]);
    });
  });
});
