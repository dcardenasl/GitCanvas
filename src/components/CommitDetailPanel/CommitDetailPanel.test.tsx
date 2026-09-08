// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CommitDiff, CommitInfo } from "../../bindings";

const getCommitDiff =
  vi.fn<(path: string, request: unknown) => Promise<CommitDiff>>();

vi.mock("../../lib/ipc", () => ({
  getCommitDiff: (path: string, request: unknown) =>
    getCommitDiff(path, request),
}));

const { CommitDetailPanel } = await import("./CommitDetailPanel");

const COMMIT: CommitInfo = {
  id: "a".repeat(40),
  parents: ["b".repeat(40)],
  summary: "feat(site): add referrer policy header",
  message: "feat(site): add referrer policy header\n\nMore detail here.",
  author_name: "David Cardenas",
  author_email: "david@example.com",
  author_time: "1788815520",
  commit_time: "1788815520",
};

function diff(overrides: Partial<CommitDiff> = {}): CommitDiff {
  return {
    commit_id: COMMIT.id,
    parent_id: COMMIT.parents[0] ?? null,
    files: [],
    insertions: 0,
    deletions: 0,
    is_merge: false,
    ...overrides,
  };
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CommitDetailPanel repositoryPath="/tmp/repo" commit={COMMIT} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getCommitDiff.mockReset();
});
afterEach(cleanup);

describe("CommitDetailPanel", () => {
  it("shows the commit identity and body", async () => {
    getCommitDiff.mockResolvedValue(diff());
    renderPanel();

    expect(screen.getByText(COMMIT.summary)).toBeDefined();
    expect(
      screen.getByText("More detail here.", { exact: false }),
    ).toBeDefined();
    // The label interleaves the file count with the +/- stat spans, so it is
    // matched on the element rather than on an exact text node.
    expect(
      await screen.findByText(
        (_, element) =>
          (element?.className ?? "") === "detail-panel__files-label",
      ),
    ).toBeDefined();
  });

  it("says when a merge diff only covers the first parent", async () => {
    getCommitDiff.mockResolvedValue(diff({ is_merge: true }));
    renderPanel();

    expect(
      await screen.findByText(
        "Commit de merge: se muestran los cambios contra el primer padre.",
      ),
    ).toBeDefined();
  });

  it("explains a binary file instead of rendering an empty box", async () => {
    getCommitDiff.mockResolvedValue(
      diff({
        files: [
          {
            path: "logo.png",
            old_path: null,
            change: "Added",
            insertions: 0,
            deletions: 0,
            omitted: "Binary",
            patch: null,
          },
        ],
      }),
    );
    renderPanel();

    expect(
      await screen.findByText(
        "Archivo binario. No hay diferencias de texto que mostrar.",
      ),
    ).toBeDefined();
  });

  it("loads an oversized diff only when it is asked for", async () => {
    const held: CommitDiff = diff({
      files: [
        {
          path: "bundle.js",
          old_path: null,
          change: "Modified",
          insertions: 5000,
          deletions: 100,
          omitted: "TooLarge",
          patch: null,
        },
      ],
    });
    getCommitDiff.mockResolvedValue(held);
    renderPanel();

    const button = await screen.findByRole("button", {
      name: "Ver diff completo",
    });
    expect(getCommitDiff.mock.calls[0]?.[1]).toMatchObject({
      expand_path: null,
    });

    await userEvent.click(button);

    expect(getCommitDiff.mock.calls.at(-1)?.[1]).toMatchObject({
      expand_path: "bundle.js",
    });
  });

  it("reports a diff failure instead of showing nothing", async () => {
    getCommitDiff.mockRejectedValue(new Error("no se pudo leer el diff"));
    renderPanel();

    expect(await screen.findByRole("alert")).toBeDefined();
  });
});
