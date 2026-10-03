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
      // "prompt" (bukan "autoUpdate") — SW baru menunggu user, tidak reload
      // diam-diam di background. autoUpdate pernah bikin app reload sendiri
      // di tengah render React (mis. sambil isi tabel Gramasi) → crash
      // "insertBefore" karena DOM dibongkar browser saat React masih nyisipin node.
      registerType: "prompt",
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

        // Cache GAS fetch dengan strategi NetworkFirst.
        // Tanpa networkTimeoutSeconds: GAS sering lambat (>8 dtk), dan kalau ada timeout
        // service worker langsung menyajikan cache lama (sampai 1 hari) — akibatnya GH yang
        // baru tanam tidak muncul di HP operator. Cache hanya dipakai saat jaringan benar-benar gagal.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/script\.google\.com\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "gas-api-cache",
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
