// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CommitDiff, CommitInfo, FileDiff } from "../../bindings";

const getCommitDiff =
  vi.fn<(path: string, request: unknown) => Promise<CommitDiff>>();

vi.mock("../../lib/ipc", () => ({
  getCommitDiff: (path: string, request: unknown) =>
    getCommitDiff(path, request),
}));

const { CommitDetailPanel } = await import("./CommitDetailPanel");
const { useSession } = await import("../../state/session");

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

function file(overrides: Partial<FileDiff> = {}): FileDiff {
  return {
    path: "src/app.ts",
    old_path: null,
    change: "Modified",
    insertions: 3,
    deletions: 1,
    omitted: null,
    patch: "@@ -1 +1 @@\n-a\n+b\n",
    ...overrides,
  };
}

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
  useSession.setState({ selectedFilePath: null, expandedFilePath: null });
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

  it("lists the changed files as choices, not as inline diffs", async () => {
    getCommitDiff.mockResolvedValue(
      diff({
        files: [file(), file({ path: "README.md", change: "Added" })],
        insertions: 6,
        deletions: 1,
      }),
    );
    renderPanel();

    const list = await screen.findByRole("list", {
      name: "Archivos modificados",
    });
    expect(list).toBeDefined();
    expect(screen.getAllByRole("button")).toHaveLength(2);

    // The panel is navigation now; the patch belongs to the centre view.
    expect(screen.queryByText("+b")).toBeNull();
  });

  it("opens the chosen file in the centre panel", async () => {
    getCommitDiff.mockResolvedValue(diff({ files: [file()] }));
    renderPanel();

    await userEvent.click(await screen.findByRole("button"));

    expect(useSession.getState().selectedFilePath).toBe("src/app.ts");
  });

  it("marks a file the engine withheld instead of showing a line count", async () => {
    getCommitDiff.mockResolvedValue(
      diff({
        files: [
          file({ path: "logo.png", omitted: "Binary", patch: null }),
          file({ path: "bundle.js", omitted: "TooLarge", patch: null }),
        ],
      }),
    );
    renderPanel();

    expect(await screen.findByText("binario")).toBeDefined();
    expect(screen.getByText("grande")).toBeDefined();
  });

  it("labels each change kind for assistive technology", async () => {
    getCommitDiff.mockResolvedValue(
      diff({ files: [file({ change: "Deleted", path: "gone.txt" })] }),
    );
    renderPanel();

    expect(await screen.findByLabelText("Eliminado")).toBeDefined();
  });

  it("reports a diff failure instead of showing nothing", async () => {
    getCommitDiff.mockRejectedValue(new Error("no se pudo leer el diff"));
    renderPanel();

    expect(await screen.findByRole("alert")).toBeDefined();
  });
});
