import { StrictMode } from "react";
import { Capacitor } from "@capacitor/core";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import { ToastProvider } from "./components/ui/ToastProvider";
import "./index.css";

// Mobile browsers skip :active/tap-highlight rendering on pages with no
// touch listeners (treated as passively scrollable) -- this one-time no-op
// listener makes tap feedback on the footer icon links actually render.
document.addEventListener("touchstart", () => {}, { passive: true });

// The installable web app updates through its service worker. The Android app
// ships its own assets and updates by reinstalling, and a service worker there
// would keep serving the previous version.
if (import.meta.env.PROD && !Capacitor.isNativePlatform()) {
  registerSW({ immediate: true });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
);
