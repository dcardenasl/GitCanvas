import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "../../state/workspace";
import { projectName } from "../../state/projectNames";
import { openProjectAt } from "../../state/openProject";
import { compareNames } from "../../lib/changedFiles";
import { labelTabs } from "../TabBar/tabLabels";
import { FavoriteToggle } from "../FavoriteToggle/FavoriteToggle";
import { ErrorMessage } from "../ErrorMessage";
import "./ProjectLibrary.css";

/** Favorites and recents are independent of tabs and open through authorization. */
export function ProjectLibrary() {
  const { t } = useTranslation("shell");
  const favorites = useWorkspace((state) => state.favorites);
  const recents = useWorkspace((state) => state.recents);
  const removeRecent = useWorkspace((state) => state.removeRecent);
  const [failures, setFailures] = useState<
    Readonly<Record<string, { readonly cause: unknown }>>
  >({});
  const [opening, setOpening] = useState<string | null>(null);
  const busy = useRef(false);

  async function open(path: string) {
    if (busy.current) return;
    busy.current = true;
    setOpening(path);
    try {
      await openProjectAt(path);
      setFailures((previous) =>
        Object.fromEntries(
          Object.entries(previous).filter(([root]) => root !== path),
        ),
      );
    } catch (cause) {
      setFailures((previous) => ({ ...previous, [path]: { cause } }));
    } finally {
      busy.current = false;
      setOpening(null);
    }
  }

  const removeLabel = (path: string) =>
    t("workspace.removeRecent", { name: projectName(path) });

  const groups = [
    {
      kind: "favorites" as const,
      paths: [...favorites].sort(
        (a, b) =>
          compareNames(projectName(a), projectName(b)) || compareNames(a, b),
      ),
    },
    {
      kind: "recents" as const,
      paths: recents.filter((path) => !favorites.includes(path)),
    },
  ];
  return (
    <div className="project-library">
      {groups.map(({ kind, paths }) => {
        const labels = labelTabs(
          paths.map((path) => ({ path, name: projectName(path) })),
        );
        return (
          <section key={kind} aria-label={t(`workspace.${kind}`)}>
            <h2>{t(`workspace.${kind}`)}</h2>
            {paths.length === 0 ? (
              <p className="state">{t(`workspace.${kind}Empty`)}</p>
            ) : (
              <ul>
                {paths.map((path, index) => (
                  <li key={path}>
                    <div className="project-library__row">
                      <button
                        type="button"
                        className="project-library__open"
                        title={path}
                        disabled={opening !== null}
                        onClick={() => {
                          void open(path);
                        }}
                      >
                        <span>{labels[index]?.text ?? path}</span>
                        <small>
                          {opening === path
                            ? t("picker.opening")
                            : failures[path] === undefined
                              ? path
                              : t("tabs.unreachable")}
                        </small>
                      </button>
                      {kind === "recents" && (
                        <button
                          type="button"
                          className="project-library__remove"
                          title={removeLabel(path)}
                          aria-label={removeLabel(path)}
                          onClick={() => {
                            removeRecent(path);
                          }}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            focusable="false"
                          >
                            <path d="m6 6 12 12M18 6 6 18" />
                          </svg>
                        </button>
                      )}
                      <FavoriteToggle path={path} name={projectName(path)} />
                    </div>
                    {failures[path] !== undefined && (
                      <div role="alert">
                        <ErrorMessage error={failures[path].cause} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
