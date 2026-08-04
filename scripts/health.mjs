#!/usr/bin/env node
/**
 * One-command backend health check — "is the API up?".
 *   pnpm health            # checks http://127.0.0.1:8080
 *   IW_API=http://host:port pnpm health
 *
 * Pings /healthz (process is alive), /v1/status (the app answers), and /readyz
 * (dependencies are reachable), printing a ✅/❌ line each with latency. Exits 0
 * when the API is up, 1 when it isn't — so it's usable in a script or a pre-demo check.
 */
const BASE = (process.env.IW_API || 'http://127.0.0.1:8080').replace(/\/+$/, '');
const TIMEOUT_MS = 4000;

async function hit(path) {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, { signal: ctrl.signal });
    const ms = Date.now() - started;
    let body = '';
    try {
      body = JSON.stringify(await res.json());
    } catch {
      body = '(non-JSON body)';
    }
    return { ok: res.ok, status: res.status, ms, body };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - started, body: e?.name === 'AbortError' ? `timeout after ${TIMEOUT_MS}ms` : String(e?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

const CHECKS = [
  { path: '/healthz', label: 'liveness   (process is up)' },
  { path: '/v1/status', label: 'app        (API answers)' },
  { path: '/readyz', label: 'readiness  (deps reachable)' },
];

console.log(`\n  Intent Wallet API health — ${BASE}\n`);
const results = [];
for (const c of CHECKS) {
  const r = await hit(c.path);
  results.push(r);
  const mark = r.ok ? '✅' : '❌';
  const code = r.status ? `HTTP ${r.status}` : 'no response';
  console.log(`  ${mark}  ${c.label}  ·  ${code}  ·  ${r.ms}ms`);
  console.log(`       ${c.path} → ${r.body}`);
}

// The API is "up" if the process is alive (/healthz) AND the app answers (/v1/status).
// /readyz can be degraded (an upstream RPC down) while the API itself is fine to demo.
const up = results[0].ok && results[1].ok;
console.log(`\n  ${up ? '✅  API is UP — you can run the demo.' : '❌  API is DOWN — start it:  pnpm --filter @intent-wallet/api dev'}\n`);
process.exit(up ? 0 : 1);
