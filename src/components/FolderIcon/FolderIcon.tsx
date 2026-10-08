/** Decorative folder glyph shared by the changed-file and commit trees. */
export function FolderIcon() {
  return (
    <span className="file-tree__folder" aria-hidden="true">
      <svg viewBox="0 0 16 16" fill="none">
        <path
          d="M1.5 4.5h4l1.5 1.5h7.5v6a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"
          stroke="currentColor"
          strokeLinejoin="round"
        />
        <path d="M1.5 6h13" stroke="currentColor" />
      </svg>
    </span>
  );
}
