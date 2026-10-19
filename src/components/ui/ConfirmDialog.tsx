import type { ReactNode } from "react";
import { Modal } from "./Modal";

interface Props {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** In-app replacement for `window.confirm`, which blocks the page and looks broken in an installed PWA. */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal title={title} onRequestClose={onCancel} widthClass="max-w-sm">
      <div className="text-sm text-slate-300 leading-relaxed">{children}</div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`px-4 py-2 rounded-xl text-sm font-semibold text-white ${
            danger ? "bg-rose-600 hover:bg-rose-500" : "bg-blue-600 hover:bg-blue-500"
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
