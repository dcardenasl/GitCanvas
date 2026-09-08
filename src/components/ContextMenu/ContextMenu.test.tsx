// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContextMenu } from "./ContextMenu";

afterEach(cleanup);

function renderMenu(onClose = vi.fn(), onSelect = vi.fn()) {
  render(
    <ContextMenu
      x={100}
      y={100}
      onClose={onClose}
      items={[{ label: "Copiar hash", onSelect }]}
    />,
  );
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
