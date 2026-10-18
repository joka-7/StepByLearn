import { useCallback, useEffect, useState, type ReactNode } from "react";
import { newId } from "../../domain/ids";
import { ToastContext, type ToastInput } from "./toast";

const TOAST_MS = 6000;

interface ActiveToast extends ToastInput {
  id: string;
}

/** Hosts the toast stack in a polite live region so screen readers announce it. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly ActiveToast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((toast: ToastInput) => {
    setToasts((current) => [...current, { ...toast, id: newId() }]);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 inset-x-4 sm:left-auto sm:right-4 sm:w-96 z-[60] space-y-2"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ActiveToast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl ${
        toast.tone === "error"
          ? "bg-rose-950 border-rose-800 text-rose-100"
          : "bg-slate-800 border-slate-700 text-slate-100"
      }`}
    >
      <span className="flex-1">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            onDismiss(toast.id);
          }}
          className="font-semibold text-blue-300 hover:text-blue-200"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="text-slate-400 hover:text-slate-200"
      >
        ×
      </button>
    </div>
  );
}
