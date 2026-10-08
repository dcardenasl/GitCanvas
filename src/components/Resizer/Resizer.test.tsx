// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Resizer } from "./Resizer";

afterEach(cleanup);

function renderResizer(
  overrides: Partial<React.ComponentProps<typeof Resizer>> = {},
) {
  const onResize = vi.fn();
  const view = render(
    <Resizer
      label="Ancho de la barra lateral"
      width={200}
      initialWidth={220}
      min={100}
      max={300}
      grows="right"
      onResize={onResize}
      {...overrides}
    />,
  );
  return {
    ...view,
    onResize,
    separator: screen.getByRole("separator", { hidden: true }),
  };
}

/** jsdom has no pointer capture; the divider needs the three calls to exist. */
function withPointerCapture(element: HTMLElement) {
  let captured = false;
  element.setPointerCapture = () => {
    captured = true;
  };
  element.hasPointerCapture = () => captured;
  element.releasePointerCapture = () => {
    captured = false;
  };
}

describe("Resizer", () => {
  it("announces its value and limits", () => {
    const { separator } = renderResizer();

    expect(separator.getAttribute("aria-valuenow")).toBe("200");
    expect(separator.getAttribute("aria-valuemin")).toBe("100");
    expect(separator.getAttribute("aria-valuemax")).toBe("300");
    expect(separator.getAttribute("aria-label")).toBe(
      "Ancho de la barra lateral",
    );
  });

  it("moves by a step with the arrow keys, in the direction the panel grows", () => {
    const right = renderResizer();
    fireEvent.keyDown(right.separator, { key: "ArrowRight" });
    expect(right.onResize).toHaveBeenLastCalledWith(216);
    fireEvent.keyDown(right.separator, { key: "ArrowLeft" });
    expect(right.onResize).toHaveBeenLastCalledWith(184);
    cleanup();

    // A panel on the right grows when the divider moves left.
    const left = renderResizer({ grows: "left" });
    fireEvent.keyDown(left.separator, { key: "ArrowLeft" });
    expect(left.onResize).toHaveBeenLastCalledWith(216);
  });

  it("ignores other keys and never leaves its limits", () => {
    const { onResize, separator } = renderResizer({ width: 300 });

    fireEvent.keyDown(separator, { key: "a" });
    expect(onResize).not.toHaveBeenCalled();

    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(onResize).toHaveBeenLastCalledWith(300);
  });

  it("follows a drag and stops when the pointer is released", () => {
    const { onResize, separator } = renderResizer();
    withPointerCapture(separator);

    fireEvent.pointerDown(separator, { pointerId: 1, clientX: 500 });
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 530 });
    expect(onResize).toHaveBeenLastCalledWith(230);
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 900 });
    expect(onResize).toHaveBeenLastCalledWith(300);

    fireEvent.pointerUp(separator, { pointerId: 1 });
    onResize.mockClear();
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 400 });
    expect(onResize).not.toHaveBeenCalled();
  });

  it("does nothing on pointer movement when no drag started", () => {
    const { onResize, separator } = renderResizer();

    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 400 });

    expect(onResize).not.toHaveBeenCalled();
  });

  it("drags the other way for a panel that grows leftwards", () => {
    const { onResize, separator } = renderResizer({ grows: "left" });
    withPointerCapture(separator);

    fireEvent.pointerDown(separator, { pointerId: 1, clientX: 500 });
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 470 });

    expect(onResize).toHaveBeenLastCalledWith(230);
  });

  it("restores the initial width on double click", () => {
    const { onResize, separator } = renderResizer({
      width: 250,
      initialWidth: 180,
    });

    fireEvent.doubleClick(separator);

    expect(onResize).toHaveBeenCalledWith(180);
  });

  it("restores the previous text selection style after a drag", () => {
    const { separator } = renderResizer();
    withPointerCapture(separator);
    document.body.style.userSelect = "text";

    fireEvent.pointerDown(separator, { pointerId: 1, clientX: 500 });
    expect(document.body.style.userSelect).toBe("none");
    fireEvent.pointerCancel(separator, { pointerId: 1 });

    expect(document.body.style.userSelect).toBe("text");
    document.body.style.userSelect = "";
  });

  it("ignores non-primary pointer buttons", () => {
    const { onResize, separator } = renderResizer();
    withPointerCapture(separator);

    fireEvent.pointerDown(separator, {
      pointerId: 1,
      clientX: 500,
      button: 2,
    });
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 530 });

    expect(onResize).not.toHaveBeenCalled();
  });

  it("restores text selection when unmounted during a drag", () => {
    const { separator, unmount } = renderResizer();
    withPointerCapture(separator);
    document.body.style.userSelect = "text";

    fireEvent.pointerDown(separator, { pointerId: 1, clientX: 500 });
    unmount();

    expect(document.body.style.userSelect).toBe("text");
    document.body.style.userSelect = "";
  });

  it("leaves the tab order when hidden", () => {
    const { separator } = renderResizer({ hidden: true });

    expect(separator.getAttribute("tabindex")).toBe("-1");
  });
});
