// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CommitInfo } from "../../bindings";

import { CommitSearch } from "./CommitSearch";

afterEach(cleanup);

function commit(id: string, summary: string): CommitInfo {
  return {
    id: id.padEnd(40, "0"),
    parents: [],
    summary,
    message: summary,
    author_name: "David",
    author_email: "david@example.com",
    author_time: "0",
    commit_time: "0",
  };
}

const COMMITS = [
  commit("a", "fix: login redirect"),
  commit("b", "feat: login page"),
  commit("c", "docs: readme"),
];

/** Holds the query the way the shell does, so typing changes what is shown. */
function Held({ onGo, initial = "" }: { onGo: () => void; initial?: string }) {
  const [query, setQuery] = useState(initial);
  return (
    <CommitSearch
      commits={COMMITS}
      query={query}
      onQueryChange={setQuery}
      onGo={onGo}
    />
  );
}

function renderSearch(initial = "") {
  const onGo = vi.fn();
  render(<Held onGo={onGo} initial={initial} />);
  return {
    onGo,
    input: screen.getByRole("searchbox", {
      name: "Buscar en el historial cargado",
    }),
  };
}

describe("CommitSearch", () => {
  it("counts the matches and starts from the first", async () => {
    const { input } = renderSearch();

    await userEvent.type(input, "login");

    expect((await screen.findByRole("status")).textContent).toBe("1 de 2");
  });

  it("walks the matches with Enter and back with Shift+Enter", async () => {
    const { input, onGo } = renderSearch();
    await userEvent.type(input, "login");

    await userEvent.keyboard("{Enter}");
    expect(onGo).toHaveBeenLastCalledWith(COMMITS[1]?.id);
    expect(screen.getByRole("status").textContent).toBe("2 de 2");

    // Wraps around.
    await userEvent.keyboard("{Enter}");
    expect(onGo).toHaveBeenLastCalledWith(COMMITS[0]?.id);

    await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
    expect(onGo).toHaveBeenLastCalledWith(COMMITS[1]?.id);
  });

  it("says so when nothing matches, and does not navigate", async () => {
    const { input, onGo } = renderSearch();

    await userEvent.type(input, "zzz{Enter}");

    expect(screen.getByRole("status").textContent).toBe("sin coincidencias");
    expect(onGo).not.toHaveBeenCalled();
  });

  it("shows no status for an empty query", () => {
    renderSearch();

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("starts from the top again when the query changes", async () => {
    const { input } = renderSearch();
    await userEvent.type(input, "login{Enter}");
    expect(screen.getByRole("status").textContent).toBe("2 de 2");

    await userEvent.clear(input);
    await userEvent.type(input, "fix");

    expect(screen.getByRole("status").textContent).toBe("1 de 1");
  });

  it("shows a query the caller already holds, as when returning to a project", () => {
    const { input } = renderSearch("login");

    expect((input as HTMLInputElement).value).toBe("login");
    expect(screen.getByRole("status").textContent).toBe("1 de 2");
  });

  it("clears and leaves the field on Escape", async () => {
    const { input } = renderSearch();
    await userEvent.type(input, "login");

    await userEvent.keyboard("{Escape}");

    expect((input as HTMLInputElement).value).toBe("");
    expect(document.activeElement).not.toBe(input);
  });

  it("takes focus on Ctrl+F", () => {
    const { input } = renderSearch();

    fireEvent.keyDown(window, { key: "f", ctrlKey: true });

    expect(document.activeElement).toBe(input);
  });
});
