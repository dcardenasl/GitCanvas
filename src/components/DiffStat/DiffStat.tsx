/** Shared insertion/deletion presentation for files and aggregate summaries. */
export interface DiffStatProps {
  readonly insertions: number;
  readonly deletions: number;
}

/** Renders additions and deletions using the shared compact presentation. */
export function DiffStat({ insertions, deletions }: DiffStatProps) {
  return (
    <>
      <span className="detail-panel__stat-add">+{insertions}</span>{" "}
      <span className="detail-panel__stat-del">−{deletions}</span>
    </>
  );
}
