import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

interface Props {
  title: ReactNode;
  /** Close via the same path a hardware back press takes (see useBackClose). */
  onRequestClose: () => void;
  children: ReactNode;
  /** Tailwind max-width class for the panel. */
  widthClass?: string;
  id?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal shell: dialog semantics, Escape to close, focus moved in on
 * open, Tab kept inside, and focus returned to the opener on close.
 */
export function Modal({ title, onRequestClose, children, widthClass = "max-w-lg", id }: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onRequestCloseRef = useRef(onRequestClose);
  useEffect(() => {
    onRequestCloseRef.current = onRequestClose;
  }, [onRequestClose]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onRequestCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (!firstEl || !lastEl) return;
      if (event.shiftKey && document.activeElement === firstEl) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && document.activeElement === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      opener?.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50"
      onClick={onRequestClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        id={id}
        className={`w-full ${widthClass} bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto outline-none`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="flex items-center gap-2 text-lg font-bold text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={onRequestClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-200 transition-colors p-1 -m-1"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
