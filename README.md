# Greenhouse Jobs Scraper CLI — plus 7 more ATS, no API key

[![adapter-freshness](https://github.com/rezearcher/ats-jobs-scraper-cli/actions/workflows/freshness.yml/badge.svg)](https://github.com/rezearcher/ats-jobs-scraper-cli/actions/workflows/freshness.yml)

Give it **company domains**, get back **normalized, deduplicated job postings** from any
company's **Greenhouse** board — plus seven more applicant-tracking systems (Lever, Ashby,
SmartRecruiters, Workday, Recruitee, Workable, BambooHR) — in one consistent schema. No board slugs to look up, no per-ATS
integration to write, **no API key, and zero dependencies**.

```
Input:  stripe.com  ramp.com  lever:palantir
Output: one clean row per open role, same fields regardless of which ATS the company uses
```

Supported ATS: **Greenhouse · Lever · Ashby · SmartRecruiters · Workday · Recruitee · Workable · BambooHR**.

## Install / run

Requires Node.js ≥ 18. It has no dependencies, so you can run it straight from GitHub:

```bash
# one-off, nothing to install
npx github:rezearcher/ats-jobs-scraper-cli stripe.com ramp.com --max=25

# or clone and run
git clone https://github.com/rezearcher/ats-jobs-scraper-cli
cd ats-jobs-scraper-cli
node cli.js lever:palantir ashby:ramp --pretty
```

## Usage

```
node cli.js <company...> [--max=N] [--desc] [--pretty]

  <company>   domain (stripe.com), bare slug (stripe), or platform:token
              platforms: greenhouse, lever, ashby, smartrecruiters,
                         workday, recruitee, workable, bamboohr
  --max=N     cap jobs per company (default: all)
  --desc      include plain-text job description
  --pretty    pretty-print a JSON array (default: NDJSON, one job per line)
```

Examples:

```bash
node cli.js stripe.com ramp.com --max=25                               # auto-detect the ATS
node cli.js lever:palantir ashby:ramp --pretty                         # explicit platform:token
node cli.js workday:nvidia.wd5:NVIDIAExternalCareerSite --desc --max=5  # Workday + descriptions
node cli.js recruitee:bunq workable:epignosis --max=10                  # Recruitee + Workable
node cli.js bamboohr:greenhousejuice --desc --max=5                     # BambooHR + descriptions
```

## Why not a single-ATS scraper

Every company hosts its careers page on a different ATS, and they **migrate between vendors**,
**rename boards**, and the ATS APIs **change shape** without notice. This tool absorbs that churn:

- **Auto-detects the ATS** from a plain domain (`stripe.com` → Greenhouse) — you don't track which
  vendor each company uses.
- **One normalized schema** across all platforms, so downstream code never branches per-ATS.
- **Maintained adapters** — when a platform changes its response, the adapter is updated centrally.

## Maintained — live adapter health

ATS feeds drift silently: a renamed field returns rows with `null` titles, a moved endpoint
returns zero — the run "succeeds" but the data is junk, and a plain "it ran" check never notices.
A scheduled probe runs **daily** ([`.github/workflows/freshness.yml`](.github/workflows/freshness.yml)),
hitting a large live canary board per platform and grading three things that break independently:

1. **Reachable** — the endpoint still answers.
2. **Populated** — the canary still returns ≥ 1 record.
3. **Schema-intact** — records still carry `id` / `title` / `url` above a 90% threshold.

On any drift the probe exits non-zero and the workflow opens a tracking issue, so breakage is
caught here — before it reaches your run. Run it yourself any time:

```bash
node health-check.mjs            # probe all seven adapters against live canaries
node health-check.mjs lever ashby # probe a subset
```

The green badge above is the current state of all seven adapters.

## Supported platforms

| ATS | Accepts | Notes |
|-----|---------|-------|
| Greenhouse | domain / slug / `greenhouse:token` | job content optional |
| Lever | domain / slug / `lever:token` | workplace type → remote flag |
| Ashby | domain / slug / `ashby:token` | compensation when public |
| SmartRecruiters | domain / slug / `smartrecruiters:token` | paginated, large boards |
| Workday | `workday:tenant.wdN:site` or a `*.myworkdayjobs.com` URL | `--desc` fills real post date, type & description |
| Recruitee | domain / slug / `recruitee:token` | salary & description when published |
| Workable | domain / slug / `workable:token` | employment type, remote flag, post date |

For Workday pass either the compact `workday:nvidia.wd5:NVIDIAExternalCareerSite` form or a full
careers URL like `https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite` — the tenant,
data-center (`wdN`) and site are parsed out automatically.

## Output (one row per role)

```json
{
  "id": "8172510",
  "title": "Abuse Investigator",
  "company": "stripe",
  "department": "Risk",
  "team": null,
  "location": "Seattle, San Francisco, New York City",
  "remote": null,
  "employment_type": "Full-time",
  "salary": "$211.4K – $290.6K",
  "url": "https://stripe.com/jobs/search?gh_jid=8172510",
  "posted_at": "2026-09-09T14:50:29.000Z",
  "updated_at": "2026-10-22T13:17:09.000Z",
  "source_platform": "greenhouse",
  "source_token": "stripe"
}
```

Fields are identical across all seven platforms. Dates are ISO-8601. Results are deduplicated
within a run.

## Hosted version (scale, scheduling, proxies)

This CLI is the free, run-it-yourself core. When you need **scheduled runs, thousands of companies
per run, managed proxies, and a metered pay-per-result API**, the same engine runs as a hosted
actor — point your pipeline at an endpoint instead of running Node yourself. See
[releases](https://github.com/rezearcher/ats-jobs-scraper-cli/releases) for the hosted listing link.

## Notes

- Reads only **public, keyless** career-board endpoints that each company already publishes. No
  login, no credentials, no personal data.
- Respects the per-company cap you set; large boards are paginated safely.
- Issues and platform requests welcome — open an issue.

---

Maintained by **Grey Ridge Signals Group LLC**. MIT licensed.


## Related tools (same maintained engine)

Built on the same 8-ATS engine as the rest of Grey Ridge's jobs stack:

- **[unified-jobs-scraper-cli](https://github.com/rezearcher/unified-jobs-scraper-cli)** — adds LinkedIn public postings and merges cross-source duplicates into one canonical feed.
- **[jobs-mcp-server](https://github.com/rezearcher/jobs-mcp-server)** — the same feed as a Model Context Protocol tool for Claude Desktop, Cursor, Cline and other agents.
- **[company-enrichment-cli](https://github.com/rezearcher/company-enrichment-cli)** — give it a domain, get one clean company record (firmographics, contacts, tech stack) plus a rolled-up hiring-intensity signal from this same ATS engine — buying-intent for sales/prospecting rather than a raw job feed.
