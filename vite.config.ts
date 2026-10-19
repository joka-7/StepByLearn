import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { buildCsp, parseExtraConnectSources } from "./src/csp";

/**
 * Injects the Content-Security-Policy (src/csp.ts) into the production HTML
 * only: the dev server needs an inline script for hot reload. Being in the page
 * rather than an HTTP header, it also covers the copy bundled in the Android app.
 */
function contentSecurityPolicy(extraConnectSources: readonly string[]): Plugin {
  return {
    name: "content-security-policy",
    apply: "build",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: { "http-equiv": "Content-Security-Policy", content: buildCsp(extraConnectSources) },
        injectTo: "head-prepend",
      },
    ],
  };
}

// Pure client-side SPA — no backend. `base: "./"` keeps asset paths relative so
// the built site works when served from any static host or subpath.
export default defineConfig(({ mode }) => {
  // CSP_EXTRA_CONNECT_SRC (not VITE_-prefixed: it is build configuration, not app
  // code) lets a self-hoster allow e.g. an Ollama server on their network.
  const env = loadEnv(mode, process.cwd(), "");
  return {
    base: "./",
    plugins: [
      react(),
      tailwindcss(),
      contentSecurityPolicy(parseExtraConnectSources(env.CSP_EXTRA_CONNECT_SRC)),
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
  };
});
