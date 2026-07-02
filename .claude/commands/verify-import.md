---
description: Visually verify an imported page by screenshotting the live URL and the local Studio render side by side. Standalone — runnable any time after /import-site, /import-homepage, or /import-page. No arg = homepage; pass a slug (e.g. `about`) to verify a specific page. Drops PNGs in `rendered-websites/<host>/verify/` so you can eyeball drift.
allowed-tools: Bash, Read, Write
argument-hint: "[slug] [--url=<live-url>]"
---

# /verify-import $ARGUMENTS

You have been asked to visually compare the live website against the local Studio render of an imported page.

## What to do

> **Non-interactive contract.** Never ask the user mid-run — see `.claude/docs/meno/studio-port.md`. Halt with a one-line error on unrecoverable failure; never call AskUserQuestion.

1. **Parse `$ARGUMENTS`.**
   - First positional arg (optional): page slug. Empty / `index` / `home` → homepage (`src/pages/index.astro`).
   - `--port=N` (optional): override Studio port detection. If invalid, drop and continue.
   - `--url=<live-url>` (optional): the live URL to compare against. If absent, derive it:
     - Read `.claude/plans/progress/import-*-checkpoint.md` to find the most recently imported `<host>`. The live URL is `https://<host>/<slug>` (or `https://<host>/` for the homepage).
     - If no checkpoint exists AND no `--url` was given, halt with a one-line error: "no live URL — pass `--url=https://...` or run /import-site first". Do NOT ask the user.

2. **Resolve Studio port + confirm both servers are reachable.**
   - Resolve `<STUDIO_PORT>` per `.claude/docs/meno/studio-port.md` — the **editor** server (3000-range), NOT the SSR preview (8080-range). Steps i–v: explicit `--port` → `$MENO_STUDIO_PORT` → `$PORT` → lsof cwd-match in 3000–3009 + JSON health-check (`/api/page-folders` → `200 application/json`) → auto-start.
   - Playwright sidecar: `curl -s http://localhost:1338/health` — expect `{ok:true,...}`.
   - If the sidecar is down, start it via `POST http://localhost:<STUDIO_PORT>/api/playwright-server` with `{"action":"start"}`.
   - If port resolution fails after all 4 steps, halt with the one-line error from studio-port.md. Do NOT ask the user.

3. **Resolve the local Studio URL.**
   - Homepage → `http://localhost:<STUDIO_PORT>/`
   - Slug `X` → `http://localhost:<STUDIO_PORT>/X` (the SSR router maps `src/pages/X.astro` to `/X`).

4. **Fire BOTH screenshots in parallel** (one tool-call batch, not two exchanges):

   ```bash
   # live site
   curl -s -X POST http://localhost:1338/screenshot \
     -H 'content-type: application/json' \
     -d '{"url":"<live-url>","fullPage":true,"viewport":{"width":1440,"height":900}}' \
     -o rendered-websites/<host>/verify/<slug>-live.png

   # local studio render
   curl -s -X POST http://localhost:1338/screenshot \
     -H 'content-type: application/json' \
     -d '{"url":"<studio-url>","fullPage":true,"viewport":{"width":1440,"height":900}}' \
     -o rendered-websites/<host>/verify/<slug>-studio.png
   ```

   If `<slug>` would resolve to `index-live.png` for the homepage, use `home-live.png` / `home-studio.png` for readability.

5. **Sanity-check both PNG files exist and are non-trivial.**
   ```bash
   wc -c rendered-websites/<host>/verify/<slug>-live.png
   wc -c rendered-websites/<host>/verify/<slug>-studio.png
   ```
   Either file <5KB → the screenshot likely failed (blank page, 404, JS crash). Report that and stop — don't pretend the comparison succeeded.

6. **Read both PNGs** (using the Read tool — it renders images inline). State explicitly what you see in each, focusing on:
   - Above-the-fold layout (hero region presence, copy, CTAs)
   - Header / Footer chrome alignment
   - Color palette match
   - Obvious missing sections in the Studio render
   - Type scale / font family drift

7. **Print a verdict.** One of:
   - ✅ **Match** — no significant drift in the hero region; ship it.
   - ⚠ **Drift** — list the specific issues you saw (e.g. "Studio hero is missing the background image", "footer columns are 3 wide in live, 1 wide in Studio").
   - ❌ **Failed** — screenshots couldn't be captured or one render is blank.

   Then point the user at the two PNG paths so they can open them in Finder / VS Code:
   ```
   📷 Live:    rendered-websites/<host>/verify/<slug>-live.png
   📷 Studio:  rendered-websites/<host>/verify/<slug>-studio.png
   ```

8. **Do NOT auto-fix drift.** Queue any drift as a follow-up the user can address by re-running `/add-interactivity` or by hand-editing the section component. This skill is read-only against the project.

## Edge cases

- **Mobile-vs-desktop drift suspected** — re-run with `viewport: {width: 375, height: 812}` in step 4 and write `<slug>-live-mobile.png` / `<slug>-studio-mobile.png` instead. Mention in the verdict that drift was found at one viewport but not the other.
- **The live site requires auth** — sidecar `/screenshot` returns blank/error. Report as "❌ live site auth-gated, can't verify automatically" and stop. The user can drop a manual screenshot into `rendered-websites/<host>/verify/<slug>-live.png` and re-run.
- **No imported page yet for the requested slug** — `src/pages/<slug>.astro` is missing. Stop and tell the user to import it first via `/import-page <url>` or `/import-pages <url>`.

## What you do NOT do

- You do NOT touch `src/pages/`, `src/components/`, `src/styles/theme.css`, or any project file.
- You do NOT re-run `/extract`, `/analyze-page`, or any heavy import step.
- You do NOT iterate the whole site — verify one slug per invocation. If the user wants several, they call the skill several times (or invoke it in a `/loop`).
