# Security

This tool fetches **public, keyless** ATS job feeds and normalizes them. It has
**no runtime dependencies**, stores no credentials, holds no secrets, and writes
nothing except the job records it prints to stdout.

## Threat model

The only untrusted input is the company list (domains, slugs, or `platform:token`
strings). Everything it does with that input ends in an outbound HTTPS request to
a job board and a normalized record on stdout. The controlling risks are therefore
(1) that crafted input redirects a request to a host you did not intend (SSRF) and
(2) runaway resource use.

## Controls

### 1. SSRF — outbound requests are pinned to known ATS hosts
- Greenhouse, Lever, Ashby, SmartRecruiters, Recruitee and Workable requests are
  built against **fixed hostnames**; the user-supplied token is placed only in a
  path segment and is `encodeURIComponent`-escaped, so it cannot inject a host
  (an embedded `/`, `@`, or `:` is percent-encoded and stays inside the path).
- Workday targets accept a full careers URL, so the host is derived from input.
  The parser **pins the resolved host to `*.myworkdayjobs.com`**
  (`/(^|\.)myworkdayjobs\.com$/`). Input that merely *contains* the string
  `myworkdayjobs.com` in a path or query (e.g.
  `169.254.169.254/latest/myworkdayjobs.com/meta`) resolves to `null` and no
  request is made. The cloud-metadata IP and localhost are not reachable through
  any adapter.

### 2. Resource exhaustion — bounded work per input
- Paginated adapters cap page counts and honour `--max`, so a single large board
  cannot run unbounded. Auto-detection probes a small fixed candidate set with a
  single-item fetch.

### 3. Dependencies / supply chain
- **Zero runtime dependencies.** Uses only the Node ≥ 18 standard library (global
  `fetch`). There is no third-party package in the execution path to audit.

### 4. Secrets & data retention
- No API keys, tokens, or credentials are used, requested, or stored.
- Output is public job-posting data; no personal data is collected beyond what the
  employer already publishes on its careers page.

## Reporting

Found something? Open a GitHub issue (use a private security advisory for
anything sensitive) and we will respond.
