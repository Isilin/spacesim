import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/ws": { target: "ws://127.0.0.1:3001", ws: true },
      "/auth": { target: "http://127.0.0.1:3001" },
      "/health": { target: "http://127.0.0.1:3001" },
      // Outils de dev (spawnpirate, grant, fastforward…) — hors production.
      "/dev": { target: "http://127.0.0.1:3001" },
    },
  },
});
