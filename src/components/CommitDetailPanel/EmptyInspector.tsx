/**
 * What the inspector shows before a commit is chosen.
 *
 * The column is reserved rather than conditionally rendered: appearing on
 * first selection would shrink the history by its own width, reflowing every
 * row and redrawing the graph underneath the cursor that just clicked.
 */
export function EmptyInspector() {
  return (
    <aside
      className="detail-panel detail-panel--empty"
      aria-label="Detalle del commit"
    >
      <p className="detail-panel__empty-text">
        Elegí un commit para ver quién lo hizo y qué cambió.
      </p>
    </aside>
  );
}
