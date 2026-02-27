const BASE_URL = process.env.BASE_URL || "https://fotofacil.vercel.app";
const ADMIN_USER = process.env.BENCH_ADMIN_USER || "antoniolopez";
const ADMIN_PASSWORD = process.env.BENCH_ADMIN_PASSWORD || "Cluster!2026Demo";
const STORE_USER = process.env.BENCH_STORE_USER || "043";
const STORE_PASSWORD = process.env.BENCH_STORE_PASSWORD || "Tienda!2026Demo";
const ITERATIONS = Number(process.env.BENCH_ITERATIONS || 20);
const DATE_KEY = process.env.BENCH_DATE || "2026-02-27";
const WEEK_START = process.env.BENCH_WEEK_START || "2026-02-23";

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const pick = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  const sum = values.reduce((acc, value) => acc + value, 0);
  return {
    count: values.length,
    avgMs: Number((sum / values.length).toFixed(2)),
    minMs: Number(sorted[0].toFixed(2)),
    p50Ms: Number(pick(0.5).toFixed(2)),
    p95Ms: Number(pick(0.95).toFixed(2)),
    p99Ms: Number(pick(0.99).toFixed(2)),
    maxMs: Number(sorted[sorted.length - 1].toFixed(2))
  };
}

async function login(identifier, password) {
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password })
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Login failed for ${identifier}: ${response.status} ${text}`);
  }
  const cookie = response.headers.get("set-cookie");
  if (!cookie) {
    throw new Error(`Missing session cookie for ${identifier}`);
  }
  return cookie.split(";")[0];
}

async function timedFetch(path, cookie) {
  const start = performance.now();
  const response = await fetch(`${BASE_URL}${path}${path.includes("?") ? "&" : "?"}bench=${Date.now()}`, {
    headers: {
      Cookie: cookie,
      "Cache-Control": "no-store"
    }
  });
  const elapsed = performance.now() - start;
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Request failed ${path}: ${response.status} ${text}`);
  }
  await response.arrayBuffer();
  return elapsed;
}

async function runCase(name, path, cookie) {
  const samples = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const elapsed = await timedFetch(path, cookie);
    samples.push(elapsed);
  }
  return { name, path, ...stats(samples) };
}

const adminCookie = await login(ADMIN_USER, ADMIN_PASSWORD);
const storeCookie = await login(STORE_USER, STORE_PASSWORD);

const storesResponse = await fetch(`${BASE_URL}/api/admin/stores?date=${DATE_KEY}`, {
  headers: { Cookie: adminCookie, "Cache-Control": "no-store" }
});
if (!storesResponse.ok) {
  throw new Error(`Could not fetch stores list: ${storesResponse.status}`);
}
const storesJson = await storesResponse.json();
const firstStoreId = storesJson.items?.[0]?.id;
if (!firstStoreId) {
  throw new Error("No stores found to benchmark /api/admin/media");
}

const results = [];
results.push(await runCase("admin_kpis", `/api/admin/kpis?weekStart=${WEEK_START}`, adminCookie));
results.push(await runCase("admin_stores", `/api/admin/stores?date=${DATE_KEY}`, adminCookie));
results.push(await runCase("admin_media", `/api/admin/media?date=${DATE_KEY}&storeId=${firstStoreId}`, adminCookie));
results.push(await runCase("store_today", `/api/store/today?date=${DATE_KEY}`, storeCookie));

const output = {
  baseUrl: BASE_URL,
  iterations: ITERATIONS,
  generatedAt: new Date().toISOString(),
  results
};

console.log(JSON.stringify(output, null, 2));
