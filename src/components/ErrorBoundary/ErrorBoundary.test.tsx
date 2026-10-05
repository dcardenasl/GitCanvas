// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "./ErrorBoundary";

function BrokenView(): never {
  throw new Error("internal repository path should not be shown");
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("shows a localized safe fallback when a child render fails", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <ErrorBoundary>
        <BrokenView />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeDefined();
    expect(
      screen.getByRole("heading", { name: "GitCanvas encontró un problema" }),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Reiniciar GitCanvas" }),
    ).toBeDefined();
    expect(
      screen.queryByText("internal repository path should not be shown"),
    ).toBeNull();
  });
});
