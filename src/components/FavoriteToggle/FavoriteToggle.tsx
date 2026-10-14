import { useTranslation } from "react-i18next";
import { useWorkspace } from "../../state/workspace";
import "./FavoriteToggle.css";

/** A project's favorite status; closing its tab never changes it. */
export function FavoriteToggle({
  path,
  name,
  compact = false,
}: {
  readonly path: string;
  readonly name: string;
  readonly compact?: boolean;
}) {
  const { t } = useTranslation("shell");
  const favorite = useWorkspace((state) => state.favorites.includes(path));
  const label = t(favorite ? "workspace.unfavorite" : "workspace.favorite", {
    name,
  });
  return (
    <button
      type="button"
      className="favorite-toggle"
      title={label}
      aria-label={label}
      aria-pressed={favorite}
      tabIndex={compact ? -1 : 0}
      onClick={() => {
        useWorkspace.getState().toggleFavorite(path);
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z" />
      </svg>
    </button>
  );
}
