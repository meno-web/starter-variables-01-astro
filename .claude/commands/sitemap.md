---
description: Pre-flight discovery for a site import. Fetches the sitemap, classifies URLs into CMS template-groups (≥3 instances of the same pattern) vs unique pages, and prints a human-readable table. No writes to the project — just `rendered-websites/<host>/sitemap.json` for downstream skills to read. Run this before `/import-site`, `/import-cms`, or `/import-pages` to see what you're about to import.
allowed-tools: Bash, Read, Write
argument-hint: "<url>"
---

# /sitemap $ARGUMENTS

You have been asked to inspect the sitemap of a live website without importing anything yet.

## What to do

> **Non-interactive contract.** Never ask the user mid-run — see `.claude/docs/meno/studio-port.md`. Halt with a one-line error on unrecoverable failure; never call AskUserQuestion.

1. **Validate the argument.** `$ARGUMENTS` must be a single http(s) URL. If empty, malformed, or non-http, halt with a one-line error. Optional `--port=N` overrides Studio port detection; if invalid, drop and continue.

2. **Canonicalize the host.**
   - `host = new URL(url).hostname.toLowerCase()`
   - Do NOT strip `www.` — treat `www.foo.com` and `foo.com` as different sites.
   - Scratch dir: `rendered-websites/<host>/` (create if missing).

3. **Resolve Studio port + confirm reachable.**
   Resolve `<STUDIO_PORT>` per `.claude/docs/meno/studio-port.md` — the **editor** server (3000-range), NOT the SSR preview (8080-range). Steps i–v: explicit `--port` → `$MENO_STUDIO_PORT` → `$PORT` → lsof cwd-match in 3000–3009 + JSON health-check (`/api/page-folders` → `200 application/json`) → auto-start. If all 5 steps fail, halt with the one-line error from studio-port.md. Do NOT ask the user.

4. **POST `/api/fetch-sitemap`** with `{ url }`, piping the response straight to disk (do NOT capture the body into a shell variable — it can be large):

   ```bash
   curl -s -X POST http://localhost:<STUDIO_PORT>/api/fetch-sitemap \
     -H 'content-type: application/json' \
     -d "{\"url\":\"<url>\"}" \
     -o rendered-websites/<host>/sitemap.json
   ```

5. **Classify with `jq`** (don't `cat` the file):
   - Template groups: `jq '[.templateGroups[]? | {pattern, instances: (.instances|length)}] | map(select(.instances >= 3))' sitemap.json`
   - Unique pages: `jq '[.uniquePages[]?] | length' sitemap.json` (and a sample: `jq '[.uniquePages[]?][:10]' sitemap.json` if you want to show examples)
   - Total URL count: `jq '.totalCount // (.urls|length // 0)' sitemap.json`

   Be tolerant of shape variation — older responses may put everything under `urls[]` without pre-classification. If `templateGroups` is absent, derive groups by collapsing paths to their first segment after the host and counting siblings; flag anything with ≥3 siblings sharing a path prefix as a template group candidate.

6. **Print a readable table.** Example output:

   ```
   /sitemap — https://acme.com

   📑 Total URLs:        47
   🧱 Template groups:   2  (will become CMS collections via /import-cms)
       /blog/*           7 instances
       /product/*        23 instances
   📄 Unique pages:      17  (will be imported as standalone pages)
       /, /about, /pricing, /contact, /features/*, …

   Saved: rendered-websites/acme.com/sitemap.json

   Next steps:
     /import-homepage  https://acme.com           ← build the homepage + library
     /import-cms       https://acme.com           ← all CMS groups in parallel
     /import-cms       https://acme.com --group=/blog/*   ← just one group
     /import-pages     https://acme.com/about https://acme.com/pricing
     /import-site      https://acme.com           ← one-shot full pipeline
   ```

   If there are NO template groups, omit the CMS suggestion. If there's only 1 unique page (the homepage), omit `/import-pages`.

## What you do NOT do

- You do NOT call `/api/import-website`, `/extract`, `/analyze-page`, or any other extract route — that's `/import-homepage` / `/import-site`.
- You do NOT modify `src/pages/`, `src/components/`, `variables.json`, `colors.json`, or any project file.
- You do NOT start the Playwright sidecar — sitemap fetch is a pure HTTP GET, no headless browser needed.

Re-running `/sitemap <url>` is safe and cheap. It overwrites `sitemap.json` each time.
