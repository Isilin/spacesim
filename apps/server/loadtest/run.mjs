import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Orchestrateur du harnais de charge (chantier 27.7) : démarre le serveur (Postgres
 * jetable — voir le service `loadtest` de docker-compose.yml, jamais `pgdata`), attend
 * qu'il réponde sur /health, lance REST (autocannon) puis WS (connexions concurrentes),
 * puis arrête le serveur.
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

console.log("[loadtest] démarrage du serveur...");
const server = spawn(
  "pnpm",
  ["--filter", "@spacesim/server", "exec", "tsx", "src/index.ts"],
  { cwd: repoRoot, stdio: "inherit", env: process.env },
);

let exitCode = 0;
try {
  await waitReady();
  console.log("[loadtest] serveur prêt.\n");

  await run(
    "pnpm",
    ["--filter", "@spacesim/server", "exec", "tsx", "loadtest/rest.mjs"],
    {
      cwd: repoRoot,
      env: { ...process.env, LOADTEST_URL: url },
    },
  );
  await run(
    "pnpm",
    ["--filter", "@spacesim/server", "exec", "tsx", "loadtest/ws.mjs"],
    {
      cwd: repoRoot,
      env: { ...process.env, LOADTEST_URL: url },
    },
  );
} catch (err) {
  console.error(`[loadtest] échec : ${err.message}`);
  exitCode = 1;
} finally {
  server.kill();
}

process.exit(exitCode);
