import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { GraphColor } from "../../bindings";
import { GRAPH_COLORS, graphColor } from "../../lib/graph-layout/colors";
import { useThemePreferences } from "../../state/themePreferences";

/** Named, keyboard-accessible palette; closing restores the originating control. */
export function BranchColorPicker({
  branch,
  current,
  onChoose,
  onClose,
}: {
  readonly branch: string;
  readonly current: GraphColor;
  readonly onChoose: (color: GraphColor) => void;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation("refs");
  const theme = useThemePreferences((state) => state.resolvedTheme);
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const opener = document.activeElement;
    ref.current
      ?.querySelector<HTMLButtonElement>("[aria-pressed='true']")
      ?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target))
        close.current();
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  return (
    <div
      ref={ref}
      className="sidebar__palette"
      role="group"
      aria-label={t("colorsFor", { branch })}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <p>{t("colorsFor", { branch })}</p>
      {GRAPH_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          aria-pressed={color === current}
          onClick={() => {
            onChoose(color);
            onClose();
          }}
        >
          <span
            className="branch-color"
            style={{ backgroundColor: graphColor(color, theme) }}
            aria-hidden="true"
          />
          {t(`colors.${color}`)}
        </button>
      ))}
      <button type="button" onClick={onClose}>
        {t("closeColors")}
      </button>
    </div>
  );
}
