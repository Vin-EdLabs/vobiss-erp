import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

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

      VitePWA({
        registerType: "prompt",
        includeAssets: ["favicon.ico", "favicon-16.png", "favicon-32.png", "apple-touch-icon.png", "vobiss-logo.png"],
        devOptions: {
          enabled: true,
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
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
