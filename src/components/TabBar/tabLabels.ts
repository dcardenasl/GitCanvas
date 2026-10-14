import type { RepositoryInfo } from "../../bindings";

/** What to show for one open project. */
export interface TabLabel {
  /** The label: the project's name, with whatever tells it apart from a namesake. */
  readonly text: string;
  /** The full path, for the tooltip. */
  readonly title: string;
}

/** The folder a path sits in, without separators; `null` at the filesystem root. */
function parentName(path: string): string | null {
  const parts = path.split(/[\\/]/).filter((part) => part !== "");
  return parts.at(-2) ?? null;
}

/**
 * Labels for a row of projects, telling apart any that share a name.
 *
 * A name that is unique stands alone. Projects with the same name are shown with
 * the folder they live in, and if even that repeats the full path is shown, so
 * no two labels are ever identical. The tooltip always carries the full path.
 * Labels are decided over the whole row because whether `app` needs a hint
 * depends on what else is open.
 *
 * @param repositories - The open projects, in tab order.
 * @returns One label per project, in the same order.
 */
export function labelTabs(
  repositories: readonly RepositoryInfo[],
): readonly TabLabel[] {
  const byName = new Map<string, number>();
  for (const { name } of repositories) {
    byName.set(name, (byName.get(name) ?? 0) + 1);
  }

  const withParent = repositories.map(({ name, path }) => {
    if ((byName.get(name) ?? 0) < 2) return name;
    const parent = parentName(path);
    return parent === null ? name : `${name} — ${parent}`;
  });
  const byLabel = new Map<string, number>();
  for (const label of withParent) {
    byLabel.set(label, (byLabel.get(label) ?? 0) + 1);
  }

  return repositories.map(({ path }, index) => {
    const label = withParent[index] ?? path;
    return {
      text: (byLabel.get(label) ?? 0) < 2 ? label : path,
      title: path,
    };
  });
}
