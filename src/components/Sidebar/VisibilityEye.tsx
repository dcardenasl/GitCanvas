/** Possible visibility states for references in history. */
export type VisibilityState = "visible" | "partial" | "hidden";

/** Props for the VisibilityEye toggle component. */
export interface VisibilityEyeProps {
  /** Current visibility state in history. */
  readonly state: VisibilityState;
  /** Accessible label for screen readers. */
  readonly label: string;
  /** Explanatory tooltip for mouse and focus. */
  readonly title: string;
  /** Callback triggered when the eye is clicked. */
  readonly onToggle: () => void;
  /** Optional additional class name. */
  readonly className?: string | undefined;
}

/**
 * Three-state eye toggle button indicating and changing reference visibility in history.
 *
 * Replaces checkboxes with eye icons: open (visible), partial/dash (partially included group),
 * and slashed (hidden).
 */
export function VisibilityEye({
  state,
  label,
  title,
  onToggle,
  className,
}: VisibilityEyeProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={
        state === "visible" ? true : state === "partial" ? "mixed" : false
      }
      aria-label={label}
      title={title}
      className={["sidebar__eye", `sidebar__eye--${state}`, className]
        .filter(Boolean)
        .join(" ")}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      {state === "visible" && (
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M1.5 8s2.5-5 6.5-5 6.5 5 6.5 5-2.5 5-6.5 5-6.5-5-6.5-5Z" />
          <circle cx="8" cy="8" r="2" fill="currentColor" />
        </svg>
      )}
      {state === "partial" && (
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M1.5 8s2.5-5 6.5-5 6.5 5 6.5 5-2.5 5-6.5 5-6.5-5-6.5-5Z" />
          <line x1="5.5" y1="8" x2="10.5" y2="8" strokeWidth="2" />
        </svg>
      )}
      {state === "hidden" && (
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m2 2 12 12" />
          <path d="M6.6 6.7a2 2 0 0 0 2.7 2.7" />
          <path d="M4.1 4.3C2.8 5.3 1.5 8 1.5 8s2.5 5 6.5 5c1.6 0 3-.6 4.1-1.5M7 3.1C7.3 3 7.7 3 8 3c4 0 6.5 5 6.5 5s-.8 1.6-2.1 3" />
        </svg>
      )}
    </button>
  );
}
