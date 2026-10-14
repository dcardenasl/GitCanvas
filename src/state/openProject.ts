import { openRepository } from "../lib/ipc";
import { useWorkspace, type OpenOutcome } from "./workspace";

/**
 * Opens the project at `path`: the one way a folder becomes a tab.
 *
 * The backend validates the folder and answers with its canonical root, and
 * only that root — never the text that was typed or picked — names the tab, so
 * two aliases of one repository land on the same tab. Opening one that is
 * already open activates it, and a worktree of the same repository is another
 * project with its own root and its own tab.
 *
 * @param path - A folder the person chose, or one a clone just produced.
 * @returns What happened to the tabs.
 * @throws The backend's error when the folder is not a repository.
 */
export async function openProjectAt(path: string): Promise<OpenOutcome> {
  const repository = await openRepository(path);
  return useWorkspace.getState().openProject(repository);
}
