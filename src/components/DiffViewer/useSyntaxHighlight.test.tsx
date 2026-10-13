// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { HighlightClient } from "./highlightClient";
import { parseWholeFile } from "./parse";
import { SYNTAX_HIGHLIGHT_LINE_LIMIT } from "./language";

const highlighter = vi.hoisted(() => ({
  current: null as unknown as HighlightClient,
}));
vi.mock("./highlighter", () => ({
  syntaxHighlighter: {
    highlight: (...args: Parameters<HighlightClient["highlight"]>) =>
      highlighter.current.highlight(...args),
  },
}));

const { useSyntaxHighlight } = await import("./useSyntaxHighlight");
const { inlineHighlighter } = await import("../../test/inlineHighlighter");

describe("useSyntaxHighlight", () => {
  it("returns tokens for the lines it was given", async () => {
    highlighter.current = inlineHighlighter;
    const lines = parseWholeFile("const a = 1;");
    const { result } = renderHook(() =>
      useSyntaxHighlight(lines, { path: "a.ts", mode: "source" }),
    );

    expect(result.current).toBeNull();
    await waitFor(() => {
      expect(result.current?.[0]?.length).toBeGreaterThan(0);
    });
  });

  it("never offers tokens computed for different lines", async () => {
    highlighter.current = inlineHighlighter;
    const first = parseWholeFile("const a = 1;");
    const second = parseWholeFile("const b = 2;");
    const { result, rerender } = renderHook(
      ({ lines }) =>
        useSyntaxHighlight(lines, { path: "a.ts", mode: "source" }),
      { initialProps: { lines: first } },
    );
    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });

    rerender({ lines: second });

    expect(result.current).toBeNull();
    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });
  });

  it("aborts the request when the lines change or the view unmounts", () => {
    const signals: AbortSignal[] = [];
    highlighter.current = {
      highlight: (_job, signal) => {
        signals.push(signal);
        return new Promise(() => undefined);
      },
    };
    const { unmount } = renderHook(() =>
      useSyntaxHighlight(parseWholeFile("a"), {
        path: "a.ts",
        mode: "source",
      }),
    );

    unmount();

    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it("stays plain text when the highlighter is unavailable", async () => {
    const rejected = vi.fn(() => Promise.reject(new Error("no worker")));
    highlighter.current = { highlight: rejected };
    const lines = parseWholeFile("const a = 1;");
    const { result } = renderHook(() =>
      useSyntaxHighlight(lines, { path: "a.ts", mode: "source" }),
    );

    await waitFor(() => {
      expect(rejected).toHaveBeenCalled();
    });
    expect(result.current).toBeNull();
  });

  it.each([
    ["a path without a grammar", "Dockerfile", 1],
    ["more lines than the budget", "a.ts", SYNTAX_HIGHLIGHT_LINE_LIMIT + 1],
  ])("does not ask the highlighter for %s", (_label, path, count) => {
    const highlight = vi.fn(() => new Promise<never>(() => undefined));
    highlighter.current = { highlight };
    const lines = parseWholeFile(
      Array.from({ length: count }, () => "x").join("\n"),
    );

    const { result } = renderHook(() =>
      useSyntaxHighlight(lines, { path, mode: "source" }),
    );

    expect(highlight).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it("does nothing without a target", () => {
    const highlight = vi.fn(() => new Promise<never>(() => undefined));
    highlighter.current = { highlight };

    const { result } = renderHook(() =>
      useSyntaxHighlight(parseWholeFile("x"), undefined),
    );

    expect(highlight).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });
});
