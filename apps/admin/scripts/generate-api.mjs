import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Orchestrateur de `pnpm api:generate` (chantier 27.8b) : démarre un serveur éphémère
 * (DB en mémoire, SPACESIM_DB=:memory: — même mécanisme que Playwright pour l'e2e),
 * attend /health, lance orval contre son spec OpenAPI, puis l'arrête.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const url = "http://127.0.0.1:3001";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} a quitté avec le code ${code}`)),
    );
    child.on("error", reject);
  });
}

async function waitReady(timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return;
    } catch {
      // Serveur pas encore prêt — on retente.
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(
    "Le serveur n'a jamais répondu sur /health dans le délai imparti.",
  );
}

console.log(
  "[api:generate] démarrage d'un serveur éphémère (DB en mémoire)...",
);
const server = spawn(
  "pnpm",
  ["--filter", "@spacesim/server", "exec", "tsx", "src/index.ts"],
  {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, SPACESIM_DB: ":memory:" },
  },
);

let exitCode = 0;
try {
  await waitReady();
  console.log("[api:generate] serveur prêt, génération du client...");
  await run("pnpm", ["--filter", "@spacesim/admin", "exec", "orval"], {
    cwd: repoRoot,
  });
  // Le formatage d'orval ne suit pas la config Biome du repo — reformater tout de suite
  // évite qu'une régénération laisse systématiquement `pnpm format:check` en échec.
  await run("pnpm", ["format"], { cwd: repoRoot });
  console.log("[api:generate] terminé.");
} catch (err) {
  console.error(`[api:generate] échec : ${err.message}`);
  exitCode = 1;
} finally {
  server.kill();
}

process.exit(exitCode);
