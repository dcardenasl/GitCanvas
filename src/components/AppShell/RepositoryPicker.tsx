import { useTranslation } from "react-i18next";

import { ErrorMessage } from "../ErrorMessage";
import type { OpenFolder } from "./useOpenFolder";

/** Opens a local repository through the native folder picker. */
export function RepositoryPicker({ folder }: { readonly folder: OpenFolder }) {
  const { t } = useTranslation("shell");
  const { phase, error, choose } = folder;

  const label =
    phase === "choosing"
      ? t("picker.choosing")
      : phase === "opening"
        ? t("picker.opening")
        : t("picker.open");

  return (
    <div className="repository-picker">
      <button
        type="button"
        className="button button--primary"
        disabled={phase !== "idle"}
        aria-busy={phase !== "idle"}
        onClick={choose}
      >
        {phase !== "idle" && (
          <span className="button__spinner" aria-hidden="true" />
        )}
        {label}
      </button>
      {error !== null && (
        <div
          className="state state--error repository-picker__error"
          role="alert"
        >
          <ErrorMessage error={error.cause} />
        </div>
      )}
    </div>
  );
}
