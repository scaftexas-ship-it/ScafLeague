"use client";

import { useState } from "react";
import { Trash2, X } from "lucide-react";

/** A delete button that requires a second click on "Confirm" before firing, instead of a browser confirm() dialog. Resets back to the idle label if the user clicks away via onCancel-less blur isn't wired up -- callers reset it by unmounting/remounting via `key` when the underlying row goes away. */
export function ConfirmButton({
  confirmLabel = "Confirm delete",
  disabled,
  label = "Delete",
  onConfirm
}: {
  confirmLabel?: string;
  disabled?: boolean;
  label?: string;
  onConfirm: () => void | Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!confirming) {
    return (
      <button className="button secondary small" disabled={disabled} onClick={() => setConfirming(true)} type="button">
        <Trash2 size={14} aria-hidden /> {label}
      </button>
    );
  }

  return (
    <span className="confirm-delete">
      <button
        className="button danger small"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await onConfirm();
          setBusy(false);
          setConfirming(false);
        }}
        type="button"
      >
        {busy ? "Deleting..." : confirmLabel}
      </button>
      <button aria-label="Cancel" className="icon-button" disabled={busy} onClick={() => setConfirming(false)} type="button">
        <X size={14} aria-hidden />
      </button>
    </span>
  );
}
