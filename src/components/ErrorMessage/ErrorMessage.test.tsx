// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { changeLanguage } from "../../i18n";
import { IpcError } from "../../lib/ipc";

import { ErrorMessage } from "./ErrorMessage";

const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  writeText.mockReset().mockResolvedValue();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
});

afterEach(async () => {
  cleanup();
  await act(async () => {
    await changeLanguage("es");
  });
});

const failure = new IpcError({
  kind: "Network",
  message: "connection reset by peer",
});

it("shows the translated category and keeps the diagnostic behind a disclosure", () => {
  render(<ErrorMessage error={failure} />);

  expect(
    screen.getByText("No se pudo completar la operación de red"),
  ).toBeInstanceOf(HTMLElement);
  expect(screen.getByText("Detalles técnicos")).toBeInstanceOf(HTMLElement);
  const detail = screen.getByText("connection reset by peer");
  expect(detail.closest("details")?.open).toBe(false);
  // The diagnostic is English whatever the interface language is.
  expect(detail.getAttribute("lang")).toBe("en");
});

it("puts a lead sentence before the summary", () => {
  render(<ErrorMessage error={failure} lead="No se pudo cargar" />);

  expect(
    screen.getByText(
      "No se pudo cargar: No se pudo completar la operación de red",
    ),
  ).toBeInstanceOf(HTMLElement);
});

it("copies the original diagnostic and says so", async () => {
  render(<ErrorMessage error={failure} />);

  await userEvent.click(
    screen.getByRole("button", { name: "Copiar detalles" }),
  );

  expect(writeText).toHaveBeenCalledWith("connection reset by peer");
  expect(await screen.findByText("Detalles técnicos copiados")).toBeInstanceOf(
    HTMLElement,
  );
});

it("reports a copy that could not be made", async () => {
  writeText.mockRejectedValue(new Error("denied"));
  render(<ErrorMessage error={failure} />);

  await userEvent.click(
    screen.getByRole("button", { name: "Copiar detalles" }),
  );

  expect(
    await screen.findByText("No se pudieron copiar los detalles técnicos"),
  ).toBeInstanceOf(HTMLElement);
});

it("offers no disclosure for an error the code raised itself", () => {
  render(<ErrorMessage error={new Error("No repository is open")} />);

  expect(screen.getByText("No repository is open")).toBeInstanceOf(HTMLElement);
  expect(screen.queryByText("Detalles técnicos")).toBeNull();
});

it("follows a language change while it is on screen", async () => {
  render(<ErrorMessage error={failure} />);

  await act(async () => {
    await changeLanguage("en");
  });

  expect(
    screen.getByText("The network operation could not be completed"),
  ).toBeInstanceOf(HTMLElement);
  expect(screen.getByText("Technical details")).toBeInstanceOf(HTMLElement);
});
