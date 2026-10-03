import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

// Mobile browsers skip :active/tap-highlight rendering on pages with no
// touch listeners (treated as passively scrollable) -- this one-time no-op
// listener makes tap feedback on the footer icon links actually render.
document.addEventListener("touchstart", () => {}, { passive: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
