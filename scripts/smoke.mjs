#!/usr/bin/env node
// Minimal production smoke test: node scripts/smoke.mjs https://your-app.example

const base = (
  process.argv[2] ??
  process.env.SMOKE_BASE_URL ??
  'http://localhost:3001'
).replace(/\/+$/, '');

const results = [];
let failed = 0;

async function fetchPath(path) {
  const response = await fetch(`${base}${path}`, {
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { response, text, json };
}

async function check(name, path, validate) {
  try {
    const payload = await fetchPath(path);
    const detail = validate(payload);
    if (detail) {
      failed += 1;
      results.push({ name, path, ok: false, detail });
      return;
    }
    results.push({ name, path, ok: true });
  } catch (error) {
    failed += 1;
    results.push({ name, path, ok: false, detail: error.message });
  }
}

await check('health', '/api/health', ({ response, json }) => {
  if (!response.ok) return `HTTP ${response.status}`;
  if (!json || json.ok !== true) return 'health is not ok';
  if (json.status !== 'ok') return `status is ${json.status}`;
  if (typeof json.version !== 'string') return 'missing version';
  return null;
});

await check('locales', '/api/locales', ({ response, json }) => {
  if (!response.ok) return `HTTP ${response.status}`;
  if (!json || !Array.isArray(json.locales) || !Array.isArray(json.contentLocales)) {
    return 'unexpected locale payload';
  }
  return null;
});

await check('locale resource', '/api/locales/en-US', ({ response, json }) => {
  if (!response.ok) return `HTTP ${response.status}`;
  if (!json || typeof json.resource !== 'object' || json.resource === null) {
    return 'unexpected locale resource';
  }
  return null;
});

await check('public rooms', '/api/rooms', ({ response, json }) => {
  if (!response.ok) return `HTTP ${response.status}`;
  if (!json || !Array.isArray(json.rooms)) return 'unexpected rooms payload';
  return null;
});

await check('app shell', '/', ({ response, text }) => {
  if (!response.ok) return `HTTP ${response.status}`;
  if (!text.includes('<div id="root">')) return 'index.html does not look like the app shell';
  return null;
});

console.log(`Smoke test against ${base}`);
for (const result of results) {
  const mark = result.ok ? 'ok  ' : 'FAIL';
  const suffix = result.detail ? ` — ${result.detail}` : '';
  console.log(`${mark} ${result.name} (${result.path})${suffix}`);
}

if (failed > 0) {
  console.error(`${failed} check(s) failed`);
  process.exitCode = 1;
}
