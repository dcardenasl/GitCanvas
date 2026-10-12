// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { afterEach, beforeEach, expect, it } from "vitest";

import { changeLanguage } from "../../i18n";
import { LANGUAGES } from "../../i18n/languages";
import { useLanguagePreferences } from "../../state/languagePreferences";

import { LanguageSelector } from "./LanguageSelector";

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

/** A draft and a translated label, standing in for work that must survive. */
function Workspace() {
  const { t } = useTranslation("shell");
  const [draft, setDraft] = useState("");
  return (
    <>
      <LanguageSelector />
      <label>
        <span>{t("toolbar.refresh")}</span>
        <input
          value={draft}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
          }}
        />
      </label>
    </>
  );
}

it("offers the system choice and every registered language by its own name", () => {
  render(<LanguageSelector />);

  const options = screen
    .getAllByRole("option")
    .map((option) => option.textContent);

  expect(options).toEqual([
    "Sistema",
    ...LANGUAGES.map((language) => language.nativeName),
  ]);
});

it("changes the language at once and keeps the work in progress", async () => {
  render(<Workspace />);
  await userEvent.type(screen.getByRole("textbox"), "wip message");

  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Idioma de la aplicación" }),
    "en",
  );

  expect(await screen.findByText("Refresh")).toBeInstanceOf(HTMLElement);
  expect(screen.getByRole<HTMLInputElement>("textbox").value).toBe(
    "wip message",
  );
  expect(
    screen.getByRole("combobox", { name: "Application language" }),
  ).toBeInstanceOf(HTMLElement);
  expect(localStorage.getItem("gitcanvas.language.v1")).toBe("en");
});

it("selects system and shows the stored choice on a later render", async () => {
  render(<LanguageSelector />);
  const selector = screen.getByRole("combobox");

  await userEvent.selectOptions(selector, "system");

  expect((selector as HTMLSelectElement).value).toBe("system");
  expect(useLanguagePreferences.getState().preference).toBe("system");
});
