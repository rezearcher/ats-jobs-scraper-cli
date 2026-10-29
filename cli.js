#!/usr/bin/env node
// Standalone CLI — the no-account surface. Runs the exact same verified core as
// the Apify actor, with zero platform dependency, so the tool is usable straight
// from the repo (`node cli.js stripe.com ...`) while the hosted/store version
// is published. Outputs NDJSON (one normalized job per line) or pretty JSON.
import { scrape } from './src/scrape.js';

function parseArgs(argv) {
  const out = { companies: [], maxItemsPerCompany: 0, includeDescription: false, pretty: false };
  for (const a of argv) {
    if (a === '--pretty') out.pretty = true;
    else if (a === '--desc') out.includeDescription = true;
    else if (a.startsWith('--max=')) out.maxItemsPerCompany = Number(a.slice(6)) || 0;
    else if (a.startsWith('--')) { /* ignore unknown flags */ }
    else out.companies.push(a);
  }
  return out;
}

const USAGE = `Multi-ATS Jobs Scraper (CLI)

Usage:
  node cli.js <company...> [--max=N] [--desc] [--pretty]

  <company>   domain (stripe.com), slug (stripe), or platform:token
              platforms: greenhouse, lever, ashby, smartrecruiters,
                         workday, recruitee, workable
  --max=N     cap jobs per company (default: all)
  --desc      include plain-text job description
  --pretty    pretty-print JSON array (default: NDJSON to stdout)

Examples:
  node cli.js stripe.com ramp.com --max=25
  node cli.js lever:palantir ashby:ramp --pretty
  node cli.js recruitee:bunq workable:epignosis --max=10
  node cli.js workday:nvidia.wd5:NVIDIAExternalCareerSite --desc
`;

(async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.companies.length === 0) {
    process.stderr.write(USAGE);
    process.exit(2);
  }
  const { jobs, resolutions } = await scrape(args, (e) => process.stderr.write(`[${e.level}] ${e.msg}\n`));
  if (args.pretty) {
    process.stdout.write(JSON.stringify(jobs, null, 2) + '\n');
  } else {
    for (const j of jobs) process.stdout.write(JSON.stringify(j) + '\n');
  }
  process.stderr.write(`\n${jobs.length} jobs from ${resolutions.filter((r) => r.resolved).length}/${resolutions.length} companies\n`);
})().catch((e) => {
  process.stderr.write(`error: ${e.message || e}\n`);
  process.exit(1);
});
