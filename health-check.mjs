#!/usr/bin/env node
// Live adapter health / schema-drift check for the 8 ATS platforms this tool
// scrapes. Each ATS exposes a keyless public feed whose JSON shape can silently
// drift: a renamed field makes an adapter return rows with null title/url, or a
// moved endpoint makes it return zero. A plain "it ran" check misses both — the
// run succeeds, the data is junk.
//
// This probe grades three things that break independently when an upstream
// changes, each against a large, stable, employer-owned canary board:
//   1. REACHABLE     — the endpoint still answers.
//   2. POPULATED     — the canary still yields >=1 record.
//   3. SCHEMA-INTACT — records still carry the key fields (id, title, url)
//                      above a threshold; the subtle, dangerous drift.
//
// Verdicts: OK / DOWN / EMPTY / SCHEMA_DRIFT. Prints a table, writes
// health-status.json, and EXITS NON-ZERO on any drift so the scheduled workflow
// can open a maintenance issue — the output is an input somewhere else, not a
// dead-end log. Zero dependencies (native fetch only).
//
//   node health-check.mjs            # probe all adapters (live)
//   node health-check.mjs lever ashby # probe a subset

import { writeFileSync } from 'node:fs';
import { ADAPTERS } from './src/adapters.js';

// Known-good, live-verified canaries (2026-10-29). Each is a large public board
// on that ATS, chosen because it is vanishingly unlikely to legitimately empty
// out. If one ever does, swap the canary — cheaper than a false drift alarm.
// NOTE: SmartRecruiters returns HTTP 200 total=0 for UNKNOWN slugs, so its
// canary must be a real, large board (Experian ~390 jobs), never a guess.
const CANARIES = {
  greenhouse: 'stripe', // ~720 jobs
  lever: 'palantir', // ~300 jobs
  ashby: 'openai', // ~800 jobs
  smartrecruiters: 'Experian', // ~390 jobs
  workday: 'nvidia.wd5:NVIDIAExternalCareerSite',
  recruitee: 'bunq',
  workable: 'epignosis',
  bamboohr: 'greenhousejuice', // ~9 jobs (BambooHR is SMB; modest but steady board — swap if it empties)
};

const SCHEMA_THRESHOLD = 0.9;
const KEY_FIELDS = ['id', 'title', 'url'];
const ICON = { OK: '✓', DOWN: '✗', EMPTY: '∅', SCHEMA_DRIFT: '⚠', NO_CANARY: '?' };

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)),
  ]);
}

async function checkAdapter(platform, token, { timeoutMs = 25000, minItems = 1 } = {}) {
  const started = Date.now();
  const base = { platform, canary: token, checked_at: new Date().toISOString() };

  let records;
  try {
    records = await withTimeout(
      ADAPTERS[platform](token, { includeDescription: false, maxItems: 50 }),
      timeoutMs
    );
  } catch (err) {
    return {
      ...base,
      verdict: 'DOWN',
      reachable: false,
      count: 0,
      field_presence: {},
      elapsed_ms: Date.now() - started,
      detail: `endpoint error: ${err.status ? `HTTP ${err.status}` : err.message}`,
    };
  }

  const list = Array.isArray(records) ? records : [];
  const count = list.length;

  const field_presence = {};
  for (const f of KEY_FIELDS) {
    const present = list.filter((r) => r && r[f] !== null && r[f] !== undefined && r[f] !== '').length;
    field_presence[f] = count ? +(present / count).toFixed(3) : 0;
  }

  if (count < minItems) {
    return {
      ...base,
      verdict: 'EMPTY',
      reachable: true,
      count,
      field_presence,
      elapsed_ms: Date.now() - started,
      detail: `canary returned ${count} records (expected >=${minItems}) — endpoint moved, newly gated, or response reshaped`,
    };
  }

  const drifted = KEY_FIELDS.filter((f) => field_presence[f] < SCHEMA_THRESHOLD);
  if (drifted.length) {
    return {
      ...base,
      verdict: 'SCHEMA_DRIFT',
      reachable: true,
      count,
      field_presence,
      elapsed_ms: Date.now() - started,
      detail: `key field(s) below ${SCHEMA_THRESHOLD} presence: ${drifted
        .map((f) => `${f}=${field_presence[f]}`)
        .join(', ')} — upstream JSON shape likely changed`,
    };
  }

  return {
    ...base,
    verdict: 'OK',
    reachable: true,
    count,
    field_presence,
    elapsed_ms: Date.now() - started,
    detail: `healthy: ${count} records, key fields intact`,
  };
}

async function runFreshnessCheck(platforms) {
  const list = platforms && platforms.length ? platforms : Object.keys(CANARIES);
  const results = [];
  for (const platform of list) {
    const token = CANARIES[platform];
    if (!token) {
      results.push({ platform, verdict: 'NO_CANARY', detail: 'no canary configured', count: 0 });
      continue;
    }
    // eslint-disable-next-line no-await-in-loop -- serial keeps us a polite client
    results.push(await checkAdapter(platform, token));
  }
  const degraded = results.filter((r) => r.verdict !== 'OK');
  return {
    generated_at: new Date().toISOString(),
    tool: 'ats-jobs-scraper-cli',
    adapters_total: results.length,
    adapters_ok: results.filter((r) => r.verdict === 'OK').length,
    adapters_degraded: degraded.length,
    degraded_platforms: degraded.map((r) => r.platform),
    healthy: degraded.length === 0,
    results,
  };
}

const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));

(async () => {
  console.log('ATS adapter freshness / schema-drift check — live canary probe\n');
  const report = await runFreshnessCheck(args);

  for (const r of report.results) {
    const icon = ICON[r.verdict] || '?';
    const fp = r.field_presence
      ? Object.entries(r.field_presence)
          .map(([k, v]) => `${k}:${v}`)
          .join(' ')
      : '';
    console.log(
      `  ${icon} ${r.platform.padEnd(16)} ${String(r.verdict).padEnd(13)} ` +
        `count=${String(r.count ?? '-').padEnd(5)} ${fp}`
    );
    if (r.verdict !== 'OK') console.log(`      ↳ ${r.detail}`);
  }

  try {
    writeFileSync('health-status.json', JSON.stringify(report, null, 2));
  } catch (e) {
    console.error(`  (warn) could not write health-status.json: ${e.message}`);
  }

  console.log(
    `\n  ${report.adapters_ok}/${report.adapters_total} adapters healthy` +
      (report.healthy ? '' : ` — DRIFT on: ${report.degraded_platforms.join(', ')}`)
  );

  // Connected close: non-zero exit is the signal the scheduled workflow reads to
  // open a maintenance issue for the drifted adapter(s).
  process.exit(report.healthy ? 0 : 1);
})();
