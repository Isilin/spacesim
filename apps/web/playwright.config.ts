import { defineConfig, devices } from "@playwright/test";

/**
 * E2E (chantier 5.3) : lance sa propre pile serveur+web sur une base SQLite en
 * mémoire (`SPACESIM_DB=:memory:`), isolée de `spacesim.db` utilisé en dev —
 * chaque run démarre un univers neuf, jamais de pollution d'une partie réelle.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  /**
   * Un seul worker (chantier 32.17). Le suite mesure des budgets d'images par seconde
   * sur un pilote OpenGL LOGICIEL dans le conteneur : mesurer pendant que d'autres
   * navigateurs se disputent le même processeur ne mesure rien, et les specs de carte 3D
   * tombaient dès que le nombre de fichiers a augmenté. Relever le seuil aurait masqué
   * une vraie régression au lieu de supprimer le bruit.
   */
  workers: 1,
  retries: 0,
  /**
   * Attente par défaut portée de 5 à 10 s (chantier 37.15).
   *
   * Le client fait davantage à chaque snapshot depuis que l'univers a grossi : il en reçoit
   * une galaxie détaillée de cinq cents systèmes au lieu de quatorze, et le reste en
   * condensé. Un aller-retour WebSocket suivi d'un rendu tient largement sous les dix
   * secondes, mais plus toujours sous cinq — et un test qui échoue une fois sur cinq ne
   * prouve plus rien.
   *
   * Ce délai borne une ATTENTE, jamais un résultat : un comportement faux échoue toujours,
   * seulement dix secondes plus tard. Les vraies causes de lenteur ont été corrigées à la
   * source (écriture des galaxies neuves, une seule galaxie de frontière par tick, monde
   * d'origine avec des emplacements libres) — ceci couvre le reste.
   */
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command:
      // `AUTH_RATE_LIMIT_MAX` relevé ICI seulement (chantier 32.17) : la suite inscrit
      // une dizaine d'empires depuis la même boucle locale en moins d'une minute, ce que
      // le quota de production (10/min/IP) refuse à juste titre.
      'sh -c "(cd ../.. && SPACESIM_DB=:memory: AUTH_RATE_LIMIT_MAX=200 pnpm --filter @spacesim/server dev) & pnpm exec vite --host 127.0.0.1"',
    // Attendre /health (proxifié vers le serveur de jeu) et non la racine Vite :
    // Vite répond en ~250 ms quand le serveur migre encore et génère son univers,
    // et les workers partaient alors sur un ECONNREFUSED sur /auth/register.
    url: "http://127.0.0.1:5173/health",
    reuseExistingServer: false,
    timeout: 90_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
