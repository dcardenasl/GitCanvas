// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { changeLanguage } from "../../i18n";

import { UpdateControl } from "./UpdateControl";

const updater = vi.hoisted(() => ({
  check: vi.fn(),
  getVersion: vi.fn(),
  relaunch: vi.fn(),
  isTauri: vi.fn(() => true),
}));

vi.mock("@tauri-apps/api/app", () => ({ getVersion: updater.getVersion }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: updater.isTauri }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: updater.relaunch }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: updater.check }));

beforeEach(async () => {
  updater.check.mockReset();
  updater.getVersion.mockReset();
  updater.relaunch.mockReset();
  updater.isTauri.mockReturnValue(true);
  updater.getVersion.mockResolvedValue("0.5.0");
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

  expect(
    await screen.findByText("Tienes la versión más reciente (0.5.0)."),
  ).toBeInstanceOf(HTMLElement);
  expect(screen.getByText("0.5.0")).toBeInstanceOf(HTMLElement);
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
    await screen.findByRole("button", { name: "Descargar e instalar" }),
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
      "No se pudo consultar la información de la última versión. Inténtalo de nuevo más tarde.",
    ),
  ).toBeInstanceOf(HTMLElement);
  expect(
    screen
      .getByRole("button", { name: "Volver a comprobar" })
      .hasAttribute("disabled"),
  ).toBe(false);
});

it("shows the installed version even before checking for updates", async () => {
  render(<UpdateControl />);

  expect(await screen.findByText("0.5.0")).toBeInstanceOf(HTMLElement);
  expect(screen.getByText("Versión instalada")).toBeInstanceOf(HTMLElement);
  expect(updater.check).not.toHaveBeenCalled();
});
