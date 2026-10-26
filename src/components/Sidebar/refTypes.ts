import type { BranchInfo, RepositoryWorktree } from "../../bindings";

/** Display, filtering, and navigation data for one branch or tag. */
export interface RefTarget {
  readonly name: string;
  readonly referenceId: string;
  readonly color?: string;
  readonly isPrincipal?: boolean;
  readonly isDefault?: boolean;
  readonly branch?: BranchInfo;
  /** Resolved commit, or `null` when this reference has no commit target. */
  readonly commitId: string | null;
  readonly isHead?: boolean;
  readonly commitTime?: string | null;
  readonly checkoutBranch?: string;
  readonly occupiedWorktree?: RepositoryWorktree;
}
