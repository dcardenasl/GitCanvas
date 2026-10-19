/** Minimal graph input, independent of generated IPC types. */
export interface GraphCommit {
  readonly id: string;
  readonly parents: readonly string[];
}

/** One half-row connection, with semantic trajectory identity. */
export interface LaneEdge {
  readonly from: number;
  readonly to: number;
  readonly trajectory: string;
}

/** Geometry for one virtual row. Connections join only at this row's node. */
export interface GraphRow {
  readonly id: string;
  readonly index: number;
  readonly lane: number;
  readonly trajectory: string;
  readonly incoming: readonly LaneEdge[];
  readonly outgoing: readonly LaneEdge[];
}

/** A pending connection retains its own lane until its target commit arrives. */
export interface PendingTrajectory {
  readonly target: string;
  readonly trajectory: string;
}

/** Immutable frontier carried between pages, without DOM or repository handles. */
export interface LayoutState {
  readonly lanes: readonly (PendingTrajectory | null)[];
  readonly rowCount: number;
  readonly maxLanes: number;
}

/** New rows and the complete continuation. */
export interface LayoutResult {
  readonly rows: readonly GraphRow[];
  readonly state: LayoutState;
}
