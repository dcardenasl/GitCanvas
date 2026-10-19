/** Fixed named palette identities, paired across light and dark themes. */
export const GRAPH_COLORS = [
  "amber",
  "teal",
  "violet",
  "blue",
  "rose",
  "green",
  "gold",
  "stone",
] as const satisfies readonly string[];
/** Palette identity derived from the fixed named entries. */
export type GraphColorId = (typeof GRAPH_COLORS)[number];
const PALETTE = {
  dark: [
    "#f0a63e",
    "#4fd1c5",
    "#b39df3",
    "#73b7ff",
    "#f58ba8",
    "#b2d77c",
    "#e6c76b",
    "#c5b8a6",
  ],
  light: [
    "#9a5700",
    "#00756c",
    "#6941a5",
    "#1763a5",
    "#b04461",
    "#4b721b",
    "#87620f",
    "#68523c",
  ],
} as const;

/** Resolves a semantic color without tying it to geometry. */
export function graphColor(
  color: GraphColorId,
  theme: "light" | "dark",
): string {
  return PALETTE[theme][GRAPH_COLORS.indexOf(color)] ?? PALETTE[theme][0];
}

/** Stable palette fallback for unnamed historical trajectories. */
export function trajectoryColor(id: string): GraphColorId {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1)
    hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return GRAPH_COLORS[(hash >>> 0) % GRAPH_COLORS.length] ?? "stone";
}
