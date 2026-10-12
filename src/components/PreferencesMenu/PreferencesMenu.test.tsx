// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { changeLanguage } from "../../i18n";
import { useLanguagePreferences } from "../../state/languagePreferences";

import { PreferencesMenu } from "./PreferencesMenu";

beforeEach(() => {
  localStorage.clear();
  useLanguagePreferences.getState().setPreference("es");
});

afterEach(async () => {
  cleanup();
  localStorage.clear();
  await act(async () => {
    await changeLanguage("es");
  });
});

function toggle() {
  return screen.getByRole("button", { name: "Preferencias" });
}

it("keeps the preferences out of the way until asked for", () => {
  render(<PreferencesMenu />);

  expect(toggle().getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("combobox")).toBeNull();
});

it("offers theme and language once opened", async () => {
  render(<PreferencesMenu />);

  await userEvent.click(toggle());

  expect(toggle().getAttribute("aria-expanded")).toBe("true");
  expect(
    screen.getByRole("combobox", { name: "Tema de la aplicación" }),
  ).toBeInstanceOf(HTMLElement);
  expect(
    screen.getByRole("combobox", { name: "Idioma de la aplicación" }),
  ).toBeInstanceOf(HTMLElement);
});

it("closes with Escape, gives focus back and leaves the key to itself", async () => {
  const outside = vi.fn();
  window.addEventListener("keydown", outside);
  render(<PreferencesMenu />);
  await userEvent.click(toggle());
  screen.getByRole("combobox", { name: "Idioma de la aplicación" }).focus();

  await userEvent.keyboard("{Escape}");

  expect(toggle().getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(toggle());
  // The file view also closes on Escape; it must not hear this one.
  expect(outside).not.toHaveBeenCalled();
  window.removeEventListener("keydown", outside);
});

it("closes when something outside is pressed, and not when inside is", async () => {
  render(
    <>
      <PreferencesMenu />
      <button type="button">elsewhere</button>
    </>,
  );
  await userEvent.click(toggle());

  fireEvent.pointerDown(
    screen.getByRole("combobox", { name: "Tema de la aplicación" }),
  );
  expect(toggle().getAttribute("aria-expanded")).toBe("true");

  fireEvent.pointerDown(screen.getByRole("button", { name: "elsewhere" }));
  expect(toggle().getAttribute("aria-expanded")).toBe("false");
});

it("is named in the active language", async () => {
  render(<PreferencesMenu />);

  await act(async () => {
    await changeLanguage("en");
  });

  expect(screen.getByRole("button", { name: "Preferences" })).toBeInstanceOf(
    HTMLElement,
  );
});
