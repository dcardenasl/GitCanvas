/** Frozen branch tips and principal, independent of palette and visibility. */
export interface GraphContext {
  readonly principal: string | null;
  readonly seeds: readonly { readonly id: string; readonly commitId: string }[];
}
