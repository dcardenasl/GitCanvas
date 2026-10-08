import { useEffect, useRef } from "react";

/** Content, labels, and callbacks for a modal confirmation. */
export interface ConfirmDialogProps {
  readonly title: string;
  readonly body: React.ReactNode;
  readonly confirmLabel: string;
  readonly destructive?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * A confirmation the user has to answer before anything destructive happens.
 *
 * Uses a native `<dialog>` so focus is trapped, Escape cancels, and the
 * backdrop is inert without any of that being reimplemented. The cancel button
 * takes initial focus: the safe answer should be the one a stray Return gives.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    ref.current?.showModal();
    cancelRef.current?.focus();
  }, []);

  return (
    <dialog
      ref={ref}
      className="confirm"
      aria-labelledby="confirm-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id="confirm-title" className="confirm__title">
        {title}
      </h2>
      <div className="confirm__body">{body}</div>
      <div className="confirm__actions">
        <button
          ref={cancelRef}
          type="button"
          className="button"
          onClick={onCancel}
        >
          Cancelar
        </button>
        <button
          type="button"
          className={
            destructive
              ? "button button--destructive"
              : "button button--primary"
          }
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
