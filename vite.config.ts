import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Pure client-side SPA — no backend. `base: "./"` keeps asset paths relative so
// the built site works when served from any static host or subpath.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
});
