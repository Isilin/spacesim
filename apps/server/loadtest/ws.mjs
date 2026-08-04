import { BUILDING_IDS } from "@spacesim/shared";
import { WebSocket } from "ws";

const httpUrl = process.env.LOADTEST_URL ?? "http://127.0.0.1:3001";
const wsUrl = httpUrl.replace(/^http/, "ws");
// Sous le quota /auth/register (10/minute/IP, apps/server/src/http/routes/auth.ts) —
// pas de raison de heurter un contrôle anti-abus réel pour un outil de charge.
const CONNECTIONS = Number(process.env.LOADTEST_WS_CONNECTIONS ?? 8);
const DURATION_MS = Number(process.env.LOADTEST_WS_DURATION_MS ?? 30_000);

async function registerOne(i) {
  const res = await fetch(`${httpUrl}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `loadtest-${Date.now()}-${i}@exemple.fr`,
      password: "loadtest-password-1234",
      empireName: `Loadtest ${i}`,
    }),
  });
  if (!res.ok) throw new Error(`register ${i} a échoué : ${res.status}`);
  const body = await res.json();
  return body.token;
}

function connectOne(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsUrl}/ws?session=${token}`);
    const gaps = [];
    let lastAt = null;
    let colonyId = null;

    ws.on("message", (raw) => {
      const now = performance.now();
      if (lastAt !== null) gaps.push(now - lastAt);
      lastAt = now;
      try {
        const msg = JSON.parse(raw.toString());
        if (!colonyId && Array.isArray(msg.colonies) && msg.colonies[0]) {
          colonyId = msg.colonies[0].id;
        }
      } catch {
        // Message non JSON ou inattendu — ignoré, la mesure de latence reste valide.
      }
    });
    ws.on("open", () => resolve({ ws, gaps, getColonyId: () => colonyId }));
    ws.on("error", reject);
  });
}

const tokens = [];
for (let i = 0; i < CONNECTIONS; i++) tokens.push(await registerOne(i));

const clients = await Promise.all(tokens.map(connectOne));
console.log(`${clients.length} connexions WS ouvertes.`);

// Action réelle périodique sur le chemin gameplay-critique (canal /ws) — best-effort :
// la mesure de latence de diffusion ne dépend pas de son succès (soute pleine ou
// ressources insuffisantes sont des réponses tout aussi valides que le premier
// bâtiment de départ).
const actionInterval = setInterval(() => {
  for (const client of clients) {
    const colonyId = client.getColonyId();
    if (!colonyId || client.ws.readyState !== WebSocket.OPEN) continue;
    client.ws.send(
      JSON.stringify({
        type: "build",
        colonyId,
        buildingId: BUILDING_IDS[0],
      }),
    );
  }
}, 2000);

await new Promise((r) => setTimeout(r, DURATION_MS));
clearInterval(actionInterval);
for (const { ws } of clients) ws.close();

const allGaps = clients.flatMap((c) => c.gaps).sort((a, b) => a - b);
const pct = (p) => allGaps[Math.floor((allGaps.length - 1) * p)];

console.log(
  "\n=== WS /ws — latence inter-messages, connexions concurrentes ===",
);
console.log(
  `connexions : ${clients.length}, messages mesurés : ${allGaps.length}`,
);
if (allGaps.length > 0) {
  console.log(
    `écart entre messages (ms) — p50 ${pct(0.5).toFixed(0)} · p95 ${pct(0.95).toFixed(0)} · p99 ${pct(0.99).toFixed(0)} · max ${allGaps[allGaps.length - 1].toFixed(0)}`,
  );
} else {
  console.log(
    "Aucun message reçu après la connexion initiale — durée de test trop courte ?",
  );
}
