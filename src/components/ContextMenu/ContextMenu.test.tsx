// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContextMenu, type MenuItem } from "./ContextMenu";

afterEach(cleanup);

function renderMenu(
  onClose = vi.fn(),
  onSelect = vi.fn(),
  items: readonly MenuItem[] = [{ label: "Copiar hash", onSelect }],
) {
  render(<ContextMenu x={100} y={100} onClose={onClose} items={items} />);
  return { onClose, onSelect };
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

  it("updates its close callback without reinstalling the event handlers", () => {
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

  it("closes when the list scrolls out from under it", () => {
    // A menu anchored to a point while the rows move is pointing at the wrong
    // commit by the time it is used.
    const { onClose } = renderMenu();
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
});
