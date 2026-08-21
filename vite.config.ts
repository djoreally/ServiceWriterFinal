import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      devOptions: { enabled: false },
      includeAssets: ["favicon.ico", "logo.png", "pwa-192x192.png", "pwa-512x512.png"],
      workbox: { cleanupOutdatedCaches: true, skipWaiting: true, clientsClaim: true },
    }),
  ],
  resolve: { alias: { "@": path.resolve(__dirname, "./src"), "@packages": path.resolve(__dirname, "./src/packages") } },
  server: {
    host: "::",
    port: 8080,
    allowedHosts: ["8080-ip8rdqoaentq1i5kdirc1-806f1b15.us4.manus.computer"],
  },
});
