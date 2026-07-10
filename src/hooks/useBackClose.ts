import { useEffect, useRef } from "react";

/**
 * Wires the browser/hardware back button (and Android's PWA back gesture) to
 * close an open overlay instead of leaving the app or the screen underneath —
 * the behavior users expect from a native app's back stack.
 *
 * Pushes one history entry while `isOpen`, so the *first* back press closes
 * the overlay rather than navigating away. Overlays should also route their
 * own close affordances (an X button, a backdrop click) through
 * `window.history.back()` rather than calling `onClose` directly, so both
 * paths stay in sync with the browser history stack.
 */
export function useBackClose(isOpen: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    window.history.pushState({ overlay: true }, "");
    const handlePopState = () => onCloseRef.current();
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isOpen]);
}

/** Close an overlay wired up with {@link useBackClose} via the same path a hardware back press would take. */
export function closeViaHistoryBack(): void {
  window.history.back();
}
