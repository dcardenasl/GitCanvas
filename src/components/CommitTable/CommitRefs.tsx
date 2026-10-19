import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { RefBadge } from "../../state/refs";
import { graphColor } from "../../lib/graph-layout/colors";
import { useThemePreferences } from "../../state/themePreferences";
import { ContextMenu } from "../ContextMenu";

const MAX_VISIBLE = 3;
/** Share of the message cell the references may take; the rest is the summary. */
const MAX_SHARE = 0.5;

/** Tags lead, then the checked-out branch, local branches and remotes. */
function rank(ref: RefBadge): number {
  if (ref.kind === "tag") return 0;
  if (ref.isHead) return 1;
  return ref.kind === "local" ? 2 : 3;
}

/** Bounded reference previews; the overflow menu exposes every remaining name. */
export function CommitRefs({
  refs: unsorted,
  onCopy,
}: {
  readonly refs: readonly RefBadge[];
  readonly onCopy: (name: string) => void;
}) {
  const refs = useMemo(
    () => [...unsorted].sort((a, b) => rank(a) - rank(b)),
    [unsorted],
  );
  const { t } = useTranslation("history");
  const theme = useThemePreferences((state) => state.resolvedTheme);
  const root = useRef<HTMLSpanElement>(null);
  const measure = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState({ count: 0 });
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    count: number;
  } | null>(null);

  useLayoutEffect(() => {
    const element = root.current;
    const metrics = measure.current;
    if (element === null || metrics === null) return;
    const parent = element.parentElement;
    if (parent === null) return;
    const update = () => {
      const children = [...metrics.children];
      const widths = children
        .slice(0, -1)
        .map((child) => child.getBoundingClientRect().width);
      const counter = children.at(-1)?.getBoundingClientRect().width ?? 0;
      const gap = Number.parseFloat(getComputedStyle(metrics).columnGap) || 0;
      const available = parent.getBoundingClientRect().width * MAX_SHARE;
      const needed = (shown: number) =>
        widths.slice(0, shown).reduce((sum, value) => sum + value, 0) +
        Math.max(shown - 1, 0) * gap +
        (shown < refs.length ? counter + gap : 0);
      // The first badge always shows (its label truncates); the rest fit or fold into +N.
      let count = widths.length;
      while (count > 1 && needed(count) > available) count -= 1;
      setFit((previous) => (previous.count === count ? previous : { count }));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(parent);
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
      style={{ maxInlineSize: `${String(MAX_SHARE * 100)}%` }}
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
