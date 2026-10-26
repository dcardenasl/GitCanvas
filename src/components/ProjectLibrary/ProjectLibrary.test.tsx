// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "../../test/test-utils";
import { resetWorkspace, openTestProject } from "../../test/workspace";
import { useWorkspace } from "../../state/workspace";
import { workspaceRecord } from "../../state/workspaceRecords";
import { ProjectLibrary } from "./ProjectLibrary";

const openRepository = vi.hoisted(() => vi.fn());
vi.mock("../../lib/ipc", () => ({ openRepository }));
beforeEach(() => {
  resetWorkspace();
  vi.clearAllMocks();
});
afterEach(cleanup);

it("sorts favorites by name, disambiguates duplicates, and excludes them from recents", () => {
  useWorkspace.setState({
    favorites: ["/z/app", "/a/app", "/b/alpha"],
    recents: ["/c/recent", "/z/app"],
  });
  renderWithQueryClient(<ProjectLibrary />);
  const favorites = within(screen.getByRole("region", { name: "Favoritos" }));
  expect(
    favorites.getAllByRole("listitem").map((item) => item.textContent),
  ).toEqual(["alpha/b/alpha", "app — a/a/app", "app — z/z/app"]);
  const recents = within(
    screen.getByRole("region", { name: "Proyectos recientes" }),
  );
  expect(recents.getAllByRole("listitem")).toHaveLength(1);
  expect(recents.getByRole("button", { name: /^recent/ })).toBeInstanceOf(
    HTMLElement,
  );
});

it("keeps favorites independent of tabs and round trips them in the durable projection", () => {
  openTestProject();
  const store = useWorkspace.getState();
  store.toggleFavorite("/tmp/repo");
  store.closeTab("/tmp/repo");
  const saved = workspaceRecord(useWorkspace.getState());
  store.restore(saved);
  expect(useWorkspace.getState().favorites).toEqual(["/tmp/repo"]);
  expect(useWorkspace.getState().tabs).toHaveLength(0);
  store.toggleFavorite("/tmp/repo");
  expect(useWorkspace.getState().favorites).toEqual([]);
});

it("bounds and deduplicates recents by last use, including reactivation", () => {
  for (let i = 0; i < 25; i += 1)
    openTestProject({
      path: `/tmp/repo-${String(i)}`,
      name: `repo-${String(i)}`,
    });
  const store = useWorkspace.getState();
  expect(store.recents).toHaveLength(20);
  expect(store.recents[0]).toBe("/tmp/repo-24");
  store.activate("/tmp/repo-5");
  expect(useWorkspace.getState().recents[0]).toBe("/tmp/repo-5");
  store.openProject({ path: "/tmp/repo-5", name: "repo-5" });
  expect(
    useWorkspace.getState().recents.filter((path) => path === "/tmp/repo-5"),
  ).toHaveLength(1);
});

it("reports the favorite limit without dropping an existing favorite", () => {
  useWorkspace.setState({
    limits: {
      max_tabs: 30,
      max_favorites: 1,
      max_recents: 20,
      max_graph_projects: 200,
      max_graph_references: 10000,
      max_reference_filter_worktrees: 200,
      max_excluded_references: 20001,
      max_reference_search_bytes: 4096,
      max_reference_tree_worktrees: 200,
      max_collapsed_reference_folders: 500,
    },
    favorites: ["/old"],
  });
  useWorkspace.getState().toggleFavorite("/new");
  expect(useWorkspace.getState().favorites).toEqual(["/old"]);
  expect(useWorkspace.getState().notice).toEqual({
    code: "favoriteLimit",
    max: 1,
  });
});

it("surfaces an inaccessible recent and lets the person remove it", async () => {
  useWorkspace.setState({ recents: ["/tmp/missing"] });
  openRepository.mockRejectedValue(new Error("missing repository"));
  renderWithQueryClient(<ProjectLibrary />);
  await userEvent.click(screen.getByRole("button", { name: /^missing/ }));
  expect(await screen.findByRole("alert")).toBeInstanceOf(HTMLElement);
  expect(
    screen.getByRole("button", { name: /^missing/ }).textContent,
  ).toContain("No se pudo abrir");
  expect(useWorkspace.getState().tabs).toHaveLength(0);
  await userEvent.click(
    screen.getByRole("button", { name: "Quitar missing de recientes" }),
  );
  expect(useWorkspace.getState().recents).toHaveLength(0);
});

it("opens through authorization and never duplicates an already open root", async () => {
  openTestProject();
  useWorkspace.getState().toggleFavorite("/tmp/repo");
  openRepository.mockResolvedValue({ path: "/tmp/repo", name: "repo" });
  renderWithQueryClient(<ProjectLibrary />);
  await userEvent.click(screen.getByRole("button", { name: /^repo/ }));
  expect(openRepository).toHaveBeenCalledWith("/tmp/repo");
  expect(useWorkspace.getState().tabs).toHaveLength(1);
});
