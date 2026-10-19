import {
  graphWidth,
  laneCenterX,
  ROW_HEIGHT,
  rowCenterY,
  type VisibleWindow,
} from "../../lib/historyGeometry";
import {
  graphColor,
  trajectoryColor,
  type GraphColorId,
} from "../../lib/graph-layout/colors";
import type { GraphRow } from "../../lib/graph-layout/types";
import { useThemePreferences } from "../../state/themePreferences";
import { edgePath, incomingPath } from "./path";

import "./GraphCanvas.css";

/** Visible graph geometry and row window for drawing the commit history. */
export interface GraphCanvasProps {
  /** Every row laid out so far, indexed by absolute history position. */
  readonly rows: readonly GraphRow[];
  /** The rows the table currently has mounted. */
  readonly window: VisibleWindow;
  /** Widest lane count seen so far; sizes the drawing surface. */
  readonly maxLanes: number;
  readonly selectedId: string | null;
  readonly colors?: ReadonlyMap<string, GraphColorId>;
}

/** Radius of a commit node, in CSS pixels. */
const NODE_RADIUS = 4.5;
/** Radius of the selected node, which also carries a ring. */
const SELECTED_RADIUS = 6;

/**
 * The commit graph, drawn over the virtualized rows.
 *
 * Emits a bounded SVG surface for the mounted rows plus one on each side.
 * One extra row is enough because no edge spans more than a single row, so
 * nothing visible can be missing while the surface stays viewport-sized.
 */
export function GraphCanvas({
  rows,
  window,
  maxLanes,
  selectedId,
  colors,
}: GraphCanvasProps) {
  const theme = useThemePreferences((state) => state.resolvedTheme);
  const color = (id: string) =>
    graphColor(colors?.get(id) ?? trajectoryColor(id), theme);
  const first = Math.max(window.startIndex - 1, 0);
  const last = Math.min(window.endIndex + 1, rows.length - 1);
  const offsetY = first * ROW_HEIGHT;
  const canvasHeight = Math.max(last - first + 1, 0) * ROW_HEIGHT;

  const visible: GraphRow[] = [];
  for (let index = first; index <= last; index += 1) {
    const row = rows[index];
    if (row !== undefined) visible.push(row);
  }

  const width = graphWidth(maxLanes);

  return (
    <svg
      className="graph-canvas"
      width={width}
      height={canvasHeight}
      viewBox={`0 ${String(offsetY)} ${String(width)} ${String(canvasHeight)}`}
      style={{ top: offsetY }}
      aria-hidden="true"
      focusable="false"
    >
      {visible.map((row) => (
        <g key={row.id}>
          {[
            ...row.incoming.map((edge) => ({
              edge,
              path: incomingPath(row.index, edge.from, edge.to),
            })),
            ...row.outgoing.map((edge) => ({
              edge,
              path: edgePath(row.index, edge.from, edge.to),
            })),
          ].map(({ edge, path }, index) => (
            <g key={index}>
              <path className="graph-canvas__outline" d={path} />
              <path
                className="graph-canvas__edge"
                d={path}
                stroke={color(edge.trajectory)}
              />
            </g>
          ))}
        </g>
      ))}
      {visible.map((row) => {
        const selected = row.id === selectedId;
        return (
          <g key={row.id} className="graph-canvas__row">
            <circle
              className={
                selected
                  ? "graph-canvas__node graph-canvas__node--selected"
                  : "graph-canvas__node"
              }
              cx={laneCenterX(row.lane)}
              cy={rowCenterY(row.index)}
              r={selected ? SELECTED_RADIUS : NODE_RADIUS}
              fill={selected ? "var(--surface)" : color(row.trajectory)}
              stroke={color(row.trajectory)}
            />
          </g>
        );
      })}
    </svg>
  );
}
