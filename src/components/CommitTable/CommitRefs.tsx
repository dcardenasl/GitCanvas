import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { RefBadge } from "../../state/refs";
import { graphColor } from "../../lib/graph-layout/colors";
import { useThemePreferences } from "../../state/themePreferences";
import { ContextMenu } from "../ContextMenu";

const MAX_VISIBLE = 3;

/** Bounded reference previews; the overflow menu exposes every remaining name. */
export function CommitRefs({
  refs,
  onCopy,
}: {
  readonly refs: readonly RefBadge[];
  readonly onCopy: (name: string) => void;
}) {
  const { t } = useTranslation("history");
  const theme = useThemePreferences((state) => state.resolvedTheme);
  const root = useRef<HTMLSpanElement>(null);
  const measure = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState({ count: 0, width: 0 });
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    count: number;
  } | null>(null);

  useLayoutEffect(() => {
    const element = root.current;
    const metrics = measure.current;
    if (element === null || metrics === null) return;
    const update = () => {
      const children = [...metrics.children];
      const widths = children
        .slice(0, -1)
        .map((child) => child.getBoundingClientRect().width);
      const counter = children.at(-1)?.getBoundingClientRect().width ?? 0;
      const gap = Number.parseFloat(getComputedStyle(metrics).columnGap) || 0;
      const width =
        widths.reduce((sum, value) => sum + value, 0) +
        Math.max(widths.length - 1, 0) * gap +
        (refs.length > MAX_VISIBLE ? counter + gap : 0);
      const available = element.getBoundingClientRect().width;
      let count = widths.length;
      let used = widths.reduce((sum, value) => sum + value, 0);
      while (
        count > 0 &&
        used +
          Math.max(count - 1, 0) * gap +
          (count < refs.length ? counter + gap : 0) >
          available
      ) {
        count -= 1;
        used -= widths[count] ?? 0;
      }
      setFit((previous) =>
        previous.count === count && previous.width === width
          ? previous
          : { count, width },
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    observer.observe(metrics);
    return () => {
      observer.disconnect();
    };
  }, [refs]);

  const pill = (ref: RefBadge) => (
    <span
      key={`${ref.kind}/${ref.name}`}
      className={`ref-pill ref-pill--${ref.kind}${ref.isHead ? " ref-pill--head" : ""}`}
      title={ref.isHead ? t("table.refActive", { name: ref.name }) : ref.name}
    >
      {ref.color !== undefined && (
        <span
          className="ref-pill__color"
          style={{ backgroundColor: graphColor(ref.color, theme) }}
          aria-hidden="true"
        />
      )}
      <span className="ref-pill__label">{ref.name}</span>
    </span>
  );
  const hidden = refs.length - fit.count;
  return (
    <span
      ref={root}
      className="commit-refs"
      style={{ inlineSize: fit.width > 0 ? fit.width : "50%" }}
    >
      <span ref={measure} className="commit-refs__measure" aria-hidden="true">
        {refs.slice(0, MAX_VISIBLE).map(pill)}
        <span className="ref-pill commit-refs__more">+{refs.length}</span>
      </span>
      {refs.slice(0, fit.count).map(pill)}
      {hidden > 0 && (
        <button
          type="button"
          className="ref-pill commit-refs__more"
          aria-label={t("table.moreRefs", { count: hidden })}
          aria-haspopup="menu"
          aria-expanded={menu !== null}
          onKeyDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            event.currentTarget.focus();
            const bounds = event.currentTarget.getBoundingClientRect();
            setMenu({ x: bounds.left, y: bounds.bottom, count: fit.count });
          }}
        >
          +{hidden}
        </button>
      )}
      {menu !== null &&
        createPortal(
          <ContextMenu
            x={menu.x}
            y={menu.y}
            items={refs.slice(menu.count).map((ref) => ({
              label: ref.name,
              shortcut: t("table.copyRef"),
              onSelect: () => {
                onCopy(ref.name);
              },
            }))}
            onClose={() => {
              setMenu(null);
            }}
          />,
          document.body,
        )}
    </span>
  );
}
