import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Pure client-side SPA — no backend. `base: "./"` keeps asset paths relative so
// the built site works when served from any static host or subpath.
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: false,
      // Registered by hand in main.tsx so the Android app (whose WebView would
      // keep serving the previous version after an update) can skip it.
      injectRegister: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
      },
    }),
  ],
});
