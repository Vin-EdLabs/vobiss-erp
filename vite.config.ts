import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import basicSsl from "@vitejs/plugin-basic-ssl";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backend = env.VITE_DEV_PROXY_TARGET;

  return {
    server: {
      host: true,
      port: 3000,
      strictPort: true,
      open: true,
      proxy: {
        "/api": {
          target: backend,
          changeOrigin: true,
          secure: false,
        },
        "/uploads": {
          target: backend,
          changeOrigin: true,
          secure: false,
        },
        "/manifest.json": {
          target: backend,
          changeOrigin: true,
          secure: false,
        },
        "/firebase-messaging-sw.js": {
          target: backend,
          changeOrigin: true,
          secure: false,
        },
        "/socket.io": {
          target: backend,
          changeOrigin: true,
          secure: false,
          ws: true,
        },
      },
    },

    plugins: [
      react(),
      mode === "development" && componentTagger(),
      // Service Workers (and therefore both push channels) only run in a secure context —
      // HTTPS, or the special-cased http://localhost. A phone hitting this dev server over
      // plain http://<LAN-IP>:3000 gets no navigator.serviceWorker at all (not a bug, a hard
      // browser rule), so push notifications can never register from there. This gives the
      // dev server a real (self-signed) HTTPS cert so LAN/phone testing actually has a secure
      // context — the phone's browser will show a one-time "not private" warning to click
      // through, same as any self-signed cert on a local network.
      // Opt-in only (VITE_HTTPS=1) — always-on would break plain `npm run dev`/localhost
      // tooling that can't click through a self-signed cert warning. Use `npm run dev:https`.
      process.env.VITE_HTTPS === "1" && basicSsl(),

      VitePWA({
        registerType: "prompt",
        includeAssets: ["favicon.ico", "favicon-16.png", "favicon-32.png", "apple-touch-icon.png", "vobiss-logo.png"],
        // The real manifest is served dynamically by backend/server.js's GET /manifest.json
        // (staff vs. customer variant, real icons, real name) and already linked in index.html.
        // Without this, VitePWA generates its own manifest.webmanifest with placeholder Vite
        // template content (no icons array at all) and injects a SECOND <link rel="manifest">
        // tag after ours — browsers use the LAST manifest link in the document, so that empty
        // placeholder silently wins and fails every install-criteria check.
        manifest: false,
        devOptions: {
          enabled: false,
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
          globPatterns: ["**/*.{js,css,html,png,svg,ico,woff2}"],
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/api/, /^\/socket\.io/, /^\/uploads/, /^\/firebase-messaging-sw\.js/, /^\/push-sw\.js/],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts-cache",
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
          ],
        },
      }),
    ].filter(Boolean),

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },

    build: {
      outDir: "dist",
      sourcemap: mode === "development",
      chunkSizeWarningLimit: 1500,
    },

    preview: {
      host: true,
      port: 3000,
      open: true,
    },
  };
});
