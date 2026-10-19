import { createContext, useContext } from "react";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastInput {
  message: string;
  tone?: "info" | "error";
  action?: ToastAction;
}

export type ShowToast = (toast: ToastInput) => void;

export const ToastContext = createContext<ShowToast | null>(null);

/** Show a transient, non-blocking notification (replaces `alert`). */
export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast must be used inside <ToastProvider>.");
  return show;
}
