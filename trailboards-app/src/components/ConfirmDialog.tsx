// Themed replacement for window.confirm — same scrim/dialog/focus/Escape skeleton as PdpOverlay,
// rendered as plain conditional JSX by the caller (no provider/hook — this is the app's only
// confirm flow, so imperative plumbing would be new infrastructure for one call site).
import { useEffect, useRef } from 'react';

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="cfm-scrim" onClick={onCancel}>
      <div
        className="cfm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cfm-title"
        aria-describedby="cfm-msg"
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="cfm-title" id="cfm-title">
          {title}
        </h2>
        <p className="cfm-msg" id="cfm-msg">
          {message}
        </p>
        <div className="cfm-actions">
          <button type="button" className="cfm-btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? 'cfm-btn danger' : 'cfm-btn primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
