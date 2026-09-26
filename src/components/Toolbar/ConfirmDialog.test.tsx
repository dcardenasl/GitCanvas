// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "./ConfirmDialog";

const showModal = vi.fn();

beforeEach(() => {
  showModal.mockClear();
  HTMLDialogElement.prototype.showModal = showModal;
});
afterEach(cleanup);

function renderDialog(destructive = false) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const { container } = render(
    <ConfirmDialog
      title="¿Seguro?"
      body={<p>Esto no se puede deshacer.</p>}
      confirmLabel="Hacerlo"
      destructive={destructive}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { onConfirm, onCancel, container };
}

describe("ConfirmDialog", () => {
  it("opens modally with the safe answer focused", () => {
    renderDialog();

    expect(showModal).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Cancelar", hidden: true }),
    );
  });

  it("confirms and cancels through their own buttons", async () => {
    const { onConfirm, onCancel } = renderDialog();

    await userEvent.click(
      screen.getByRole("button", { name: "Hacerlo", hidden: true }),
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: "Cancelar", hidden: true }),
    );
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("treats Escape as a cancel instead of closing the dialog itself", () => {
    const { onCancel, container } = renderDialog();
    const dialog = container.querySelector("dialog");

    const event = new Event("cancel", { cancelable: true });
    dialog?.dispatchEvent(event);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("styles a destructive confirmation as such", () => {
    renderDialog(true);

    expect(
      screen
        .getByRole("button", { name: "Hacerlo", hidden: true })
        .classList.contains("button--destructive"),
    ).toBe(true);
  });
});
