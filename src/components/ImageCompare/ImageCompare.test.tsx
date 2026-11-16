// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ImageOutcome } from "../../bindings";
import { ImageCompare } from "./ImageCompare";

const previous: ImageOutcome = {
  kind: "image",
  image: {
    format: "png",
    width: 12,
    height: 8,
    bytes: "80",
    animated: false,
    data: "AA==",
  },
};
const saved: ImageOutcome = {
  kind: "image",
  image: {
    format: "png",
    width: 16,
    height: 8,
    bytes: "96",
    animated: false,
    data: "AQ==",
  },
};

afterEach(() => vi.restoreAllMocks());

describe("ImageCompare", () => {
  it("offers two layouts, an accessible slider, and fit/actual-size settings", () => {
    render(
      <ImageCompare
        path="logo.png"
        previous={previous}
        saved={saved}
        onExpand={vi.fn()}
      />,
    );
    expect(
      screen
        .getByRole("button", { name: "Lado a lado" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Deslizador" }));
    const slider = screen.getByRole("slider", {
      name: "Revelar versión guardada",
    });
    fireEvent.change(slider, { target: { value: "75" } });
    expect(slider.getAttribute("aria-valuetext")).toBe("75 % guardada");
    fireEvent.click(screen.getByRole("button", { name: "Tamaño real" }));
    expect(
      screen
        .getByRole("button", { name: "Tamaño real" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("requests expansion only for an oversized version", () => {
    const onExpand = vi.fn();
    render(
      <ImageCompare
        path="large.png"
        previous={{ kind: "missing" }}
        saved={{ kind: "too_large", bytes: "3145728" }}
        onExpand={onExpand}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Cargar imagen completa" }),
    );
    expect(onExpand).toHaveBeenCalledTimes(1);
    expect(onExpand).toHaveBeenCalledWith("saved");
  });

  it("keeps hostile SVG bytes in an isolated img and never inserts markup", () => {
    const hostile: ImageOutcome = {
      kind: "image",
      image: {
        format: "svg",
        width: null,
        height: null,
        bytes: "18",
        animated: false,
        data: "PHN2Zy8+",
      },
    };
    const fetchSpy = vi.spyOn(window, "fetch");
    const { container } = render(
      <ImageCompare
        path="unsafe.svg"
        previous={{ kind: "missing" }}
        saved={hostile}
        onExpand={vi.fn()}
      />,
    );
    const image = screen.getByRole("img", { name: /unsafe.svg/ });
    expect(image.getAttribute("src")).toBe(
      "data:image/svg+xml;base64,PHN2Zy8+",
    );
    expect(
      container.querySelector("script, object, embed, iframe, svg"),
    ).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("starts animated images paused when reduced motion is requested", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    const animated: ImageOutcome = {
      kind: "image",
      image: {
        format: "gif",
        width: 4,
        height: 4,
        bytes: "50",
        animated: true,
        data: "R0lGODlh",
      },
    };
    render(
      <ImageCompare
        path="anim.gif"
        previous={{ kind: "missing" }}
        saved={animated}
        onExpand={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Reproducir" })).toBeTruthy();
  });

  it("replaces a failed decode with a visible error", () => {
    const { container } = render(
      <ImageCompare
        path="broken.png"
        previous={{ kind: "missing" }}
        saved={saved}
        onExpand={vi.fn()}
      />,
    );
    const image = container.querySelector("img");
    if (image === null) throw new Error("image element was not rendered");
    fireEvent.error(image);
    expect(screen.getByRole("alert").textContent).toContain(
      "No se pudo decodificar la imagen broken.png.",
    );
    expect(container.querySelector("img")).toBeNull();
  });
});
