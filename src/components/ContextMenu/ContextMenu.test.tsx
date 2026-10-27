// @vitest-environment jsdom
import {
  act,
  fireEvent,
  cleanup,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContextMenu, type MenuItem } from "./ContextMenu";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderMenu(
  onClose = vi.fn(),
  onSelect = vi.fn(),
  items: readonly MenuItem[] = [{ label: "Copiar hash", onSelect }],
) {
  render(<ContextMenu x={100} y={100} onClose={onClose} items={items} />);
  return { onClose, onSelect };
}

async function waitForMenuSetup(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        resolve();
      });
    });
  });
}

describe("ContextMenu", () => {
  it("runs the chosen item and then closes", async () => {
    const { onClose, onSelect } = renderMenu();

    await userEvent.click(
      screen.getByRole("menuitem", { name: "Copiar hash" }),
    );

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", async () => {
    const { onClose } = renderMenu();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("updates its close callback without reinstalling the event handlers", async () => {
    const oldClose = vi.fn();
    const currentClose = vi.fn();
    const { rerender } = render(
      <ContextMenu
        x={100}
        y={100}
        onClose={oldClose}
        items={[{ label: "Copiar hash", onSelect: vi.fn() }]}
      />,
    );
    rerender(
      <ContextMenu
        x={100}
        y={100}
        onClose={currentClose}
        items={[{ label: "Copiar hash", onSelect: vi.fn() }]}
      />,
    );

    await waitForMenuSetup();
    window.dispatchEvent(new Event("scroll"));

    expect(oldClose).not.toHaveBeenCalled();
    expect(currentClose).toHaveBeenCalledTimes(1);
  });

  it("moves through menu items with arrow, Home, and End keys", async () => {
    const firstSelect = vi.fn();
    const secondSelect = vi.fn();
    const thirdSelect = vi.fn();
    renderMenu(vi.fn(), vi.fn(), [
      { label: "First", onSelect: firstSelect },
      { label: "Second", onSelect: secondSelect },
      { label: "Third", onSelect: thirdSelect },
    ]);

    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Second" }),
    );
    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Third" }),
    );
    await userEvent.keyboard("{Home}");
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "First" }),
    );
    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Third" }),
    );
  });

  it("returns focus to the opener after Escape", async () => {
    render(<button type="button">Open menu</button>);
    const opener = screen.getByRole("button", { name: "Open menu" });
    opener.focus();
    renderMenu();

    await userEvent.keyboard("{Escape}");

    expect(document.activeElement).toBe(opener);
  });

  it("ignores opening focus scroll and closes when the list scrolls later", async () => {
    // A menu anchored to a point while the rows move is pointing at the wrong
    // commit by the time it is used.
    const { onClose } = renderMenu();

    fireEvent.scroll(window);
    expect(onClose).not.toHaveBeenCalled();

    await waitForMenuSetup();
    window.dispatchEvent(new Event("scroll"));
    expect(onClose).toHaveBeenCalled();
  });

  it("takes focus so it can be driven from the keyboard", () => {
    renderMenu();
    expect(document.activeElement?.textContent).toBe("Copiar hash");
  });

  it("stays inside the window when opened near an edge", () => {
    render(
      <ContextMenu
        x={99999}
        y={99999}
        onClose={vi.fn()}
        items={[{ label: "Copiar", onSelect: vi.fn() }]}
      />,
    );

    const menu = screen.getAllByRole("menu").at(-1);
    expect(Number.parseInt(menu?.style.left ?? "0", 10)).toBeLessThan(
      window.innerWidth,
    );
  });
  it("bounds a long menu by its measured height and stays open when its own items scroll", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 240,
      bottom: 752,
      width: 240,
      height: 752,
      toJSON: () => ({}),
    });
    const onClose = vi.fn();
    const items = Array.from({ length: 30 }, (_, i) => ({
      label: `Project ${String(i)}`,
      onSelect: vi.fn(),
    }));
    render(<ContextMenu x={99999} y={99999} items={items} onClose={onClose} />);
    await waitForMenuSetup();
    const menu = screen.getByRole("menu");
    expect(Number.parseInt(menu.style.top, 10)).toBe(8);
    expect(Number.parseInt(menu.style.left, 10) + 240).toBeLessThanOrEqual(
      window.innerWidth - 8,
    );
    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Project 29" }),
    );
    fireEvent.scroll(menu);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.scroll(window);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("draws a rule where a group starts, never before the first item", () => {
    renderMenu(vi.fn(), vi.fn(), [
      { label: "One", onSelect: vi.fn(), startsGroup: true },
      { label: "Two", onSelect: vi.fn() },
      { label: "Three", onSelect: vi.fn(), startsGroup: true },
    ]);

    const rules = screen.getAllByRole("separator");
    expect(rules).toHaveLength(1);
    expect(rules[0]?.previousElementSibling?.textContent).toBe("Two");
    expect(rules[0]?.nextElementSibling?.textContent).toContain("Three");
  });

  it("shows a shortcut beside its label and names it to assistive technology", () => {
    renderMenu(vi.fn(), vi.fn(), [
      { label: "Open", onSelect: vi.fn(), shortcut: "Ctrl+O" },
      { label: "Plain", onSelect: vi.fn() },
    ]);

    const open = screen.getByRole("menuitem", { name: /Open/ });
    expect(open.querySelector("kbd")?.textContent).toBe("Ctrl+O");
    expect(open.getAttribute("aria-keyshortcuts")).toBe("Ctrl+O");
    const plain = screen.getByRole("menuitem", { name: "Plain" });
    expect(plain.querySelector("kbd")).toBeNull();
    expect(plain.hasAttribute("aria-keyshortcuts")).toBe(false);
  });

  it("keeps arrow-key navigation to the items, skipping the rules", async () => {
    renderMenu(vi.fn(), vi.fn(), [
      { label: "One", onSelect: vi.fn() },
      { label: "Two", onSelect: vi.fn(), startsGroup: true },
    ]);

    await userEvent.keyboard("{ArrowDown}");

    expect(document.activeElement?.textContent).toContain("Two");
  });
});
