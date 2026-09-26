// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it } from "vitest";

import { ThemeSelector } from "./ThemeSelector";
import { useThemePreferences } from "../../state/themePreferences";

beforeEach(() => {
  localStorage.clear();
  useThemePreferences.getState().setPreference("dark");
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

it("exposes all appearance choices and persists the selected one", async () => {
  render(<ThemeSelector />);

  const selector = screen.getByRole("combobox", {
    name: "Tema de la aplicación",
  });
  expect((selector as HTMLSelectElement).value).toBe("dark");
  await userEvent.selectOptions(selector, "system");

  expect((selector as HTMLSelectElement).value).toBe("system");
  expect(localStorage.getItem("gitcanvas.theme.v1")).toBe("system");
});
