import { useQuery } from "@tanstack/react-query";

import { getBranches, getTags } from "../../lib/ipc";
import { useSession } from "../../state/session";

import "./Sidebar.css";

/** Branch and tag navigation for the open repository. */
export function Sidebar() {
  const repository = useSession((state) => state.repository);
  const path = repository?.path ?? null;

  const branches = useQuery({
    queryKey: ["branches", path],
    enabled: path !== null,
    queryFn: () => {
      if (path === null) throw new Error("No repository is open");
      return getBranches(path);
    },
  });

  const tags = useQuery({
    queryKey: ["tags", path],
    enabled: path !== null,
    queryFn: () => {
      if (path === null) throw new Error("No repository is open");
      return getTags(path);
    },
  });

  const local = branches.data?.filter((branch) => !branch.is_remote) ?? [];
  const remote = branches.data?.filter((branch) => branch.is_remote) ?? [];

  return (
    <aside className="sidebar" aria-label="Ramas y etiquetas">
      <p className="sidebar__label">Local</p>
      <ul className="sidebar__list">
        {local.map((branch) => (
          <li
            key={branch.full_name}
            className={
              branch.is_head
                ? "sidebar__item sidebar__item--head"
                : "sidebar__item"
            }
          >
            {branch.name}
            {branch.is_head && (
              <span className="sidebar__badge" aria-label="Rama activa">
                HEAD
              </span>
            )}
          </li>
        ))}
      </ul>

      {remote.length > 0 && (
        <>
          <p className="sidebar__label">Remotas</p>
          <ul className="sidebar__list">
            {remote.map((branch) => (
              <li key={branch.full_name} className="sidebar__item">
                {branch.name}
              </li>
            ))}
          </ul>
        </>
      )}

      {tags.data !== undefined && tags.data.length > 0 && (
        <>
          <p className="sidebar__label">Etiquetas</p>
          <ul className="sidebar__list">
            {tags.data.map((tag) => (
              <li key={tag.name} className="sidebar__item sidebar__item--tag">
                {tag.name}
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
