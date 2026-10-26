// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { changeLanguage } from "../../i18n";

import { UpdateControl } from "./UpdateControl";

const updater = vi.hoisted(() => ({
  check: vi.fn(),
  relaunch: vi.fn(),
  isTauri: vi.fn(() => true),
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: updater.isTauri }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: updater.relaunch }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: updater.check }));

beforeEach(async () => {
  updater.check.mockReset();
  updater.relaunch.mockReset();
  updater.isTauri.mockReturnValue(true);
  await act(async () => {
    await changeLanguage("es");
  });
});

afterEach(async () => {
  cleanup();
  await act(async () => {
    await changeLanguage("es");
  });
});

it("offers update checks only in the desktop app", () => {
  updater.isTauri.mockReturnValue(false);
  const { container } = render(<UpdateControl />);
  expect(container.firstChild).toBeNull();
});

it("reports when there is no newer release", async () => {
  updater.check.mockResolvedValue(null);
  render(<UpdateControl />);

  await userEvent.click(
    screen.getByRole("button", { name: "Buscar actualizaciones" }),
  );

  expect(await screen.findByText("GitCanvas está actualizado.")).toBeInstanceOf(
    HTMLElement,
  );
});

it("installs the signed update and restarts after download", async () => {
  const update = {
    version: "0.6.0",
    close: vi.fn(),
    downloadAndInstall: vi.fn((onEvent: (event: unknown) => void) => {
      onEvent({ event: "Started", data: { contentLength: 100 } });
      onEvent({ event: "Progress", data: { chunkLength: 50 } });
      return Promise.resolve();
    }),
  };
  updater.check.mockResolvedValue(update);
  updater.relaunch.mockResolvedValue(undefined);
  render(<UpdateControl />);

  await userEvent.click(
    screen.getByRole("button", { name: "Buscar actualizaciones" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Instalar y reiniciar" }),
  );

  expect(
    await screen.findByText("Descargando e instalando… 50%"),
  ).toBeInstanceOf(HTMLElement);
  expect(update.downloadAndInstall).toHaveBeenCalledOnce();
  expect(updater.relaunch).toHaveBeenCalledOnce();
});

it("shows a recoverable error and allows another check", async () => {
  updater.check.mockRejectedValueOnce(new Error("offline"));
  render(<UpdateControl />);

  await userEvent.click(
    screen.getByRole("button", { name: "Buscar actualizaciones" }),
  );

  expect(
    await screen.findByText(
      "No se pudo comprobar o instalar la actualización.",
    ),
  ).toBeInstanceOf(HTMLElement);
  expect(
    screen.getByRole("button", { name: "Reintentar" }).hasAttribute("disabled"),
  ).toBe(false);
});
