/** Minimal graph input; deliberately independent of the generated IPC types. */
export interface GraphCommit {
  readonly id: string;
  readonly parents: readonly string[];
}

/** One bottom half-row edge. Lane positions never move when later pages arrive. */
export interface LaneEdge {
  readonly from: number;
  readonly to: number;
  readonly colorLane: number;
}

/** Geometry for a single virtual row; all coordinates are lane indices. */
export interface GraphRow {
  readonly id: string;
  readonly index: number;
  readonly lane: number;
  readonly incoming: readonly number[];
  readonly outgoing: readonly LaneEdge[];
}

/** Immutable continuation state. Each live lane reserves exactly one future SHA. */
export interface LayoutState {
  readonly lanes: readonly (string | null)[];
  readonly rowCount: number;
  readonly maxLanes: number;
}

/** New rows and the continuation to pass to the next page. */
export interface LayoutResult {
  readonly rows: readonly GraphRow[];
  readonly state: LayoutState;
}
