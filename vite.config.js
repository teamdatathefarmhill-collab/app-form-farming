import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { createHash } from "crypto";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

// Baca semua file di folder secara rekursif pakai Node built-in — tanpa package tambahan
function getFilesRecursive(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap(e =>
    e.isDirectory()
      ? getFilesRecursive(join(dir, e.name))
      : join(dir, e.name)
  ).filter(f => /\.(jsx|js|ts|tsx)$/.test(f)).sort();
}

// Hash semua file di src/pages — otomatis berubah setiap ada file yang diubah & di-build
function getBuildId() {
  const files = getFilesRecursive("src/pages");
  const hash  = createHash("md5");
  for (const file of files) {
    hash.update(readFileSync(file));
  }
  return hash.digest("hex").slice(0, 10);
}

export default defineConfig({
  define: {
    "import.meta.env.VITE_APP_BUILD_ID": JSON.stringify(getBuildId()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "icons/*.png"],
      manifest: {
        name: "Farmhill Field App",
        short_name: "Farmhill",
        description: "Form input harian Sanitasi, HPT, dan Gramasi",
        theme_color: "#2e7d32",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        // Langsung aktif tanpa nunggu tab lama ditutup
        skipWaiting: true,
        clientsClaim: true,

        // Cache semua asset app (JS, CSS, HTML)
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],

        // Cache GAS fetch dengan strategi NetworkFirst
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/script\.google\.com\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "gas-api-cache",
              networkTimeoutSeconds: 8,
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24, // 1 hari
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
});
