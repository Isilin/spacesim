import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [react()],
  run: {
    tasks: {
      // Déclarées ici plutôt qu'en scripts : c'est ce qui leur donne le cache de
      // tâches. `dev` sert un processus persistant, jamais cachable.
      build: { command: "vp build", output: ["dist/**"] },
      dev: { command: "vp dev", cache: false },
    },
  },
  server: {
    // Compose pose HOST=0.0.0.0 — le serveur de jeu en a besoin pour publier son port.
    // Web et admin le LISENT ici plutôt que de recevoir un `--host` sur la ligne de
    // commande : `vp run -r --parallel dev` passerait ce drapeau aux trois tâches, et le
    // serveur ne le connaît pas.
    host: process.env.HOST,
    port: 5173,
    proxy: {
      "/ws": { target: "ws://127.0.0.1:3001", ws: true },
      "/auth": { target: "http://127.0.0.1:3001" },
      "/health": { target: "http://127.0.0.1:3001" },
      // Contenu publié au client (chantier 45.4) : les surcharges de catalogues astronomiques.
      "/api": { target: "http://127.0.0.1:3001" },
      // Outils de dev (spawnpirate, grant, fastforward…) — hors production.
      "/dev": { target: "http://127.0.0.1:3001" },
    },
  },
  test: {
    environment: "jsdom",
    // e2e/ est la suite Playwright (chantier 5.3) : specs `*.spec.ts` distinctes
    // des tests unitaires, jamais chargées par vitest.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
