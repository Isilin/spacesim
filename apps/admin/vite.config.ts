import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [react()],
  run: {
    tasks: {
      build: { command: "vp build", output: ["dist/**"] },
      dev: { command: "vp dev", cache: false },
    },
  },
  server: {
    // Voir apps/web : HOST vient de Compose, pas d'un drapeau de ligne de commande.
    host: process.env.HOST,
    port: 5174,
    proxy: {
      "/auth": { target: "http://127.0.0.1:3001" },
      "/health": { target: "http://127.0.0.1:3001" },
      "/api/admin": { target: "http://127.0.0.1:3001" },
    },
  },
  test: {
    environment: "jsdom",
  },
});
