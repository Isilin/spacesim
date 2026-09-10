import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vite-plus";

/**
 * Le même proxy sert le serveur de dev ET `vp preview` — Vite n'hérite pas `server.proxy`
 * dans `preview`, il faut le poser aux deux endroits.
 *
 * `preview` n'est pas un confort : depuis le chantier 49, la suite Playwright tourne contre
 * un BUILD, pas contre le serveur de dev. Les budgets d'images par seconde gardaient
 * jusque-là du code non minifié, sans tree-shaking ni Lightning CSS — ils ne mesuraient pas
 * ce que le joueur reçoit.
 */
const proxy = {
  "/ws": { target: "ws://127.0.0.1:3001", ws: true },
  "/auth": { target: "http://127.0.0.1:3001" },
  "/health": { target: "http://127.0.0.1:3001" },
  // Contenu publié au client (chantier 45.4) : les surcharges de catalogues astronomiques.
  "/api": { target: "http://127.0.0.1:3001" },
  // Outils de dev (spawnpirate, grant, fastforward…) — hors production.
  "/dev": { target: "http://127.0.0.1:3001" },
};

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
    proxy,
  },
  preview: {
    host: process.env.HOST,
    port: 5173,
    proxy,
  },
  test: {
    environment: "jsdom",
    /**
     * Node 26.8 définit `globalThis.localStorage` : un accesseur qui AVERTIT et rend
     * `undefined` tant que `--localstorage-file` n'est pas donné. Dans l'environnement
     * jsdom de vitest, `window` EST `globalThis` — cette propriété propre l'emporte donc
     * sur celle de jsdom, et `localStorage` vaut `undefined` alors que jsdom en fournit
     * un parfaitement fonctionnel. Le drapeau retire le global de Node et laisse jsdom
     * poser le sien.
     *
     * Ce n'est pas une conséquence du chantier 48 : le dépôt y échappait parce que
     * l'image `node:26-bookworm-slim` en cache local portait un patch antérieur.
     * Épingler Node dans le lockfile a rendu la panne reproductible — c'est le but.
     *
     * `execArgv` ne descend PAS de la config racine aux projets : il est répété dans
     * `apps/admin` et `packages/ui`, les deux autres projets jsdom.
     */
    execArgv: ["--no-experimental-webstorage"],
    // e2e/ est la suite Playwright (chantier 5.3) : specs `*.spec.ts` distinctes
    // des tests unitaires, jamais chargées par vitest.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
