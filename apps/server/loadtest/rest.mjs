import autocannon from "autocannon";

const url = process.env.LOADTEST_URL ?? "http://127.0.0.1:3001";

const result = await autocannon({
  url: `${url}/health`,
  connections: 20,
  duration: 10,
});

console.log("\n=== REST /health — autocannon, 20 connexions, 10s ===");
console.log(`requêtes/s : ${result.requests.average.toFixed(0)}`);
console.log(
  `latence (ms) — p50 ${result.latency.p50} · p95 ${result.latency.p95} · p99 ${result.latency.p99}`,
);
console.log(`erreurs : ${result.errors}, timeouts : ${result.timeouts}`);
