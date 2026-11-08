import type * as Ipc from "../../lib/ipc";
// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "../../test/test-utils";
import {
  stashEntry,
  stashFile,
  stashFilesPage,
  stashPage,
} from "../../test/stash";
import {
  activeNavigation,
  openTestProject,
  resetWorkspace,
} from "../../test/workspace";
import { navigationActionsFor, useNavigation } from "../../state/workspace";
import { StashSection } from "./StashSection";
import { StashDetailPanel } from "./StashDetailPanel";
import { StashFileView } from "./StashFileView";
import { stashDate } from "./metadata";

const ipc = vi.hoisted(() => ({
  getStashes: vi.fn<typeof Ipc.getStashes>(),
  getStashFiles: vi.fn<typeof Ipc.getStashFiles>(),
  getStashFileDiff: vi.fn<typeof Ipc.getStashFileDiff>(),
  getStashFileContent: vi.fn<typeof Ipc.getStashFileContent>(),
}));
vi.mock("../../lib/ipc", async (original) => ({
  ...(await original<typeof Ipc>()),
  ...ipc,
}));
const root = "/tmp/repo";

/** Exercises the same reactive tab state as the shell without unrelated graph IO. */
function Inspection() {
  const view = useNavigation((nav) => nav.stash);
  return view === null ? null : (
    <>
      <StashDetailPanel root={root} view={view} />
      {view.center === "file" && <StashFileView root={root} view={view} />}
      {view.center === "choose_file" && (
        <p>{"Selecciona un archivo de esta vista"}</p>
      )}
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  resetWorkspace();
  openTestProject();
  ipc.getStashes.mockResolvedValue(stashPage());
  ipc.getStashFiles.mockResolvedValue(stashFilesPage());
  ipc.getStashFileDiff.mockResolvedValue({
    inspection: stashFilesPage().inspection,
    entry: stashFile(),
    patch: "@@ -1 +1 @@\n-base\n+saved\n",
    limits: stashFilesPage().limits,
  });
  ipc.getStashFileContent.mockImplementation((_root, request) =>
    Promise.resolve({
      inspection: stashFilesPage().inspection,
      file_key: request.file.file_key,
      side: request.side,
      version: stashFile().saved,
      outcome: {
        kind: "available",
        content: {
          path: "notes.txt",
          text: request.side === "saved" ? "saved\n" : "base\n",
          bytes: "6",
          lines: 1,
          omitted: null,
        },
      },
      limits: stashFilesPage().limits,
    }),
  );
});
afterEach(cleanup);

describe("stash inventory and saved readers", () => {
  it("keeps the section visible at zero, retries errors and temporarily expands a search", async () => {
    const toggle = vi.fn();
    const { rerender } = renderWithQueryClient(
      <StashSection
        root={root}
        search=""
        collapsed={false}
        onCollapse={toggle}
      />,
    );
    expect(await screen.findByText("No hay stashes guardados.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Stashes" }));
    expect(toggle).toHaveBeenCalledOnce();
    ipc.getStashes.mockRejectedValueOnce(new Error("permission denied"));
    await userEvent.click(
      screen.getByRole("button", { name: "Actualizar stashes" }),
    );
    expect(await screen.findByRole("alert")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
    rerender(
      <StashSection
        root={root}
        search="needle"
        collapsed
        onCollapse={toggle}
      />,
    );
    await waitFor(() => {
      expect(ipc.getStashes).toHaveBeenCalledWith(
        root,
        expect.objectContaining({ search: "needle", cursor: null }),
      );
    });
    expect(
      screen
        .getByRole("button", { name: "Stashes" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    rerender(
      <StashSection root={root} search="" collapsed onCollapse={toggle} />,
    );
    expect(
      screen
        .getByRole("button", { name: "Stashes" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("paginates and opens metadata without choosing a file, retaining global selected metadata", async () => {
    const entry = stashEntry();
    ipc.getStashes.mockImplementation((_root, request) =>
      Promise.resolve(
        stashPage({
          entries:
            request.cursor === null ? [entry] : [stashEntry({ index: 51 })],
          total: 52,
          total_matches: 52,
          selected_present: request.selected_stash_id === null ? null : true,
          selected_entry:
            request.selected_stash_id === null ? null : { ...entry, index: 4 },
          next_cursor: request.cursor === null ? "next" : null,
        }),
      ),
    );
    renderWithQueryClient(
      <>
        <StashSection
          root={root}
          search=""
          collapsed={false}
          onCollapse={() => undefined}
        />
        <Inspection />
      </>,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Cargar más" }),
    );
    expect(await screen.findByText("stash@{51}")).toBeTruthy();
    await userEvent.click(screen.getByText("stash@{0}"));
    expect(await screen.findByText("Solo lectura")).toBeTruthy();
    await waitFor(() => {
      expect(activeNavigation().stash?.entry.index).toBe(4);
    });
    expect(activeNavigation().stash?.center).toBe("graph");
    expect(ipc.getStashFileDiff).not.toHaveBeenCalled();
    expect(ipc.getStashFileContent).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Cerrar stash" }));
    expect(activeNavigation().stash).toBeNull();
  });

  it("reads both versions only on demand and uses saved identity across modes and partial pages", async () => {
    navigationActionsFor(root).openStash(stashEntry());
    ipc.getStashFiles.mockImplementation((_root, request) =>
      Promise.resolve(
        stashFilesPage({
          files:
            request.mode === "unstaged" && request.cursor === null
              ? []
              : [stashFile({ key: `${request.mode}-key` })],
          next_cursor:
            request.mode === "unstaged" && request.cursor === null
              ? "more-files"
              : null,
        }),
      ),
    );
    renderWithQueryClient(<Inspection />);
    await userEvent.click(
      await screen.findByRole("button", { name: /notes.txt/ }),
    );
    expect(await screen.findByText("saved")).toBeTruthy();
    expect(ipc.getStashFileContent).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Versión anterior" }),
    );
    await waitFor(() => {
      expect(ipc.getStashFileContent).toHaveBeenCalledWith(
        root,
        expect.objectContaining({
          side: "previous",
          file: {
            stash_id: stashEntry().stash_id,
            mode: "all",
            file_key: "all-key",
          },
        }),
      );
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Versión guardada" }),
    );
    await waitFor(() => {
      expect(ipc.getStashFileContent).toHaveBeenLastCalledWith(
        root,
        expect.objectContaining({ side: "saved" }),
      );
    });
    await userEvent.click(screen.getByRole("button", { name: "Sin preparar" }));
    await waitFor(() => {
      expect(activeNavigation().stash?.file?.key).toBe("unstaged-key");
    });
    expect(activeNavigation().stash?.center).toBe("file");
    expect(
      ipc.getStashFileDiff.mock.calls.every(
        ([, request]) => request.file.file_key === `${request.file.mode}-key`,
      ),
    ).toBe(true);
    await userEvent.click(
      screen.getByRole("button", { name: "Volver al gráfico" }),
    );
    expect(activeNavigation().stash?.center).toBe("graph");
  });

  it("does not select another file when a comparison excludes the selected path", async () => {
    navigationActionsFor(root).openStash(stashEntry());
    ipc.getStashFiles.mockImplementation((_root, request) =>
      Promise.resolve(
        stashFilesPage({
          files:
            request.mode === "staged"
              ? [stashFile({ key: "different", path_identity: "other" })]
              : [stashFile()],
        }),
      ),
    );
    renderWithQueryClient(<Inspection />);
    await userEvent.click(
      await screen.findByRole("button", { name: /notes.txt/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Preparados" }));
    expect(
      await screen.findByText("Selecciona un archivo de esta vista"),
    ).toBeTruthy();
    expect(activeNavigation().stash?.file).toBeNull();
  });

  it("keeps an externally removed stash inspectable, then reports unavailable objects", async () => {
    navigationActionsFor(root).openStash(stashEntry());
    ipc.getStashes.mockResolvedValue(stashPage({ selected_present: false }));
    ipc.getStashFileDiff.mockRejectedValue(new Error("object not found"));
    renderWithQueryClient(
      <>
        <StashSection
          root={root}
          search=""
          collapsed={false}
          onCollapse={() => undefined}
        />
        <Inspection />
      </>,
    );
    expect(await screen.findByText(/Este stash se eliminó/)).toBeTruthy();
    await userEvent.click(
      await screen.findByRole("button", { name: /notes.txt/ }),
    );
    expect(
      await screen.findByText("Esta versión guardada no está disponible."),
    ).toBeTruthy();
    expect(activeNavigation().stash?.entry.stash_id).toBe(
      stashEntry().stash_id,
    );
    ipc.getStashFileDiff.mockResolvedValue({
      inspection: stashFilesPage().inspection,
      entry: stashFile(),
      patch: "",
      limits: stashFilesPage().limits,
    });
    await userEvent.click(
      within(screen.getByRole("alert")).getByRole("button", {
        name: "Reintentar",
      }),
    );
    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
    act(() => {
      navigationActionsFor(root).closeStash();
    });
    expect(activeNavigation().stash).toBeNull();
  });

  it("formats recorded offsets and rejects unrepresentable dates", () => {
    expect(stashDate(stashEntry())).toContain("-03:00");
    expect(
      stashDate(stashEntry({ recorded_at: "999999999999999999" })),
    ).toBeNull();
  });
});
