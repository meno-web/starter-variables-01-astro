---
description: Refresh `src/styles/theme.css` (brand colors + typography/layout tokens) from a live URL, without touching pages or components. Useful when the brand changes and you want to re-pull tokens after the initial `/import-site`, or to seed tokens before manually composing a project. Preserves any tokens you've added by hand — only writes detected tokens.
allowed-tools: Bash, Read, Write, Edit
argument-hint: "<url>"
---

# /import-design-tokens $ARGUMENTS

You have been asked to extract typography and color tokens from a live URL and merge them into the project's single token stylesheet `src/styles/theme.css`, without touching any other project files.

## What to do

> **Non-interactive contract.** Never ask the user mid-run — see `.claude/docs/meno/studio-port.md`. Halt with a one-line error on unrecoverable failure; never call AskUserQuestion.

1. **Validate the argument.** `$ARGUMENTS` must be a single http(s) URL. If empty, malformed, or non-http, halt with a one-line error. Optional `--port=N` overrides Studio port detection; if invalid, drop and continue.

2. **Canonicalize the host.**
   - `host = new URL(url).hostname.toLowerCase()`
   - Scratch dir: `rendered-websites/<host>/pages/home/` (create if missing). You'll reuse this layout so subsequent imports for the same host benefit from already-extracted data.

3. **Resolve Studio port + confirm sidecar is reachable.**
   - Resolve `<STUDIO_PORT>` per `.claude/docs/meno/studio-port.md` — the **editor** server (3000-range), NOT the SSR preview (8080-range). Steps i–v: explicit `--port` → `$MENO_STUDIO_PORT` → `$PORT` → lsof cwd-match in 3000–3009 + JSON health-check (`/api/page-folders` → `200 application/json`) → auto-start.
   - Sidecar: `curl -s http://localhost:1338/health` — expect `{ok:true,...}`. If down, start it via `POST http://localhost:<STUDIO_PORT>/api/playwright-server` `{"action":"start"}`.
   - Port resolution fails after all 5 steps OR sidecar fails to start after one retry → halt with the one-line error. Do NOT ask the user.

4. **Resume-aware extract + analyze.** Check `rendered-websites/<host>/pages/home/extracted.json` and `analysis.json`:
   - **Both exist and are non-trivial (>10KB)** → skip step 5; reuse them. Tell the user "Reusing cached extract for <host>."
   - **Either is missing or <10KB** → run step 5.

5. **Extract + analyze in parallel** (one tool-call batch):

   ```bash
   # Sidecar extract — DOM + computed styles + cssVariables + fontFaces
   curl -s -X POST http://localhost:1338/extract \
     -H 'content-type: application/json' \
     -d '{"url":"<url>","mode":"pixels"}' \
     -o rendered-websites/<host>/pages/home/extracted.json

   # Studio analysis — typography + colors + cssVariables digest
   curl -s -X POST http://localhost:<STUDIO_PORT>/api/analyze-page \
     -H 'content-type: application/json' \
     -d '{"url":"<url>"}' \
     -o rendered-websites/<host>/pages/home/analysis.json
   ```

   Sanity-check both files exist and are >10KB. If either is empty / has an `error` field, stop and report.

6. **Sniff what to merge using `jq` — never `cat`.**

   ```bash
   # Typography candidates (font sizes, line heights, weights, families)
   jq '.typography' rendered-websites/<host>/pages/home/analysis.json

   # Colors (named brand tokens, surfaces)
   jq '.colors' rendered-websites/<host>/pages/home/analysis.json

   # Raw cssVariables map (may include vendor-prefixed garbage — filter)
   jq '.cssVariables' rendered-websites/<host>/pages/home/extracted.json
   ```

   For typography, materialize this canonical key set (only ones the analysis actually surfaced — don't fabricate):
   - `--font-family-sans`, `--font-family-serif`, `--font-family-mono`
   - `--font-heading-xl`, `--font-heading-lg`, `--font-heading-md`, `--font-heading-sm`
   - `--font-body-lg`, `--font-body-md`, `--font-body-sm`
   - `--line-height-tight`, `--line-height-snug`, `--line-height-normal`, `--line-height-relaxed`
   - `--font-weight-regular`, `--font-weight-medium`, `--font-weight-semibold`, `--font-weight-bold`

   For colors, materialize the brand tokens you can name with confidence (primary / accent / surface / text / border / muted). Leave anything ambiguous alone.

   These all go into `src/styles/theme.css`: colors as custom properties on `:root` under a `/* Colors: <theme> */` section (additional themes as `[theme="dark"] { … }` blocks), and typography/layout vars as plain custom properties on `:root` grouped under `/* Font Family */`, `/* Font Size */`, `/* Line Height */`, `/* Font Weight */` comment sections. The comment section IS the token's group — there is no separate label/`type`/`group`/`cssVar` field; a token's `--name` is its identity. Write only base values; Meno regenerates the responsive `@media` blocks from `project.config.json`.

7. **Merge — do NOT overwrite the whole file.** `src/styles/theme.css` may contain hand-added tokens; preserve them.

   ```bash
   # If src/styles/theme.css doesn't exist, create it with the detected tokens
   # (colors on :root under a `/* Colors: <theme> */` section, variables on :root
   # grouped under `/* Font Size */`, `/* Font Family */`, … comment sections).
   # If it does exist, read it and only ADD custom properties whose --name isn't
   # already declared — existing declarations win, never overwrite a token the
   # user already set. Then write the file back.
   ```

   Use the Read tool to load the existing stylesheet, splice the missing custom properties into the right comment section, and Write the result back. Track every `--name` you wrote vs every one already present.

8. **Do NOT call `/api/save-page`, `/api/save-component`, or any other write route.** Pure file write to `src/styles/theme.css`. The Studio dev server's file-watcher picks it up automatically on next HMR cycle.

9. **Print a summary.** Example:

   ```
   /import-design-tokens — https://acme.com

   🎨 src/styles/theme.css — colors (:root)
       + --brand-primary          #4F46E5
       + --surface-1              #FFFFFF
       = --text-primary           (already present, preserved)
   📝 src/styles/theme.css — variables (:root)
       + --font-family-sans       Inter, system-ui, sans-serif   /* Font Family */
       + --font-heading-xl        clamp(2rem, 4vw, 3.5rem)       /* Font Size */
       + --line-height-tight      1.1                            /* Line Height */
       = --font-weight-regular    (already present, preserved)

   📊 Added: 12   Preserved: 4   Skipped: 3 (ambiguous)

   Next: refresh your browser preview at http://localhost:<STUDIO_PORT>
   ```

   Use `+` for newly added, `=` for already-present-and-kept, `~` if you deliberately updated a value (rare — only do this if the user explicitly asked).

## Edge cases

- **No typography surfaced in analysis.json** (very minimal site) — write only what you have. Tell the user "Site uses default browser typography; only the font-family token was added."
- **No color palette detected** (greyscale-only design) — same: write what you have, tell the user.
- **CSS variables conflict** — e.g. extracted.json defines `--primary` AND analysis.json defines `--brand-primary` with the same value. Prefer the `--brand-*` form (consistent with the rest of the Meno convention). Skip duplicates.
- **The user passes a path that's a CMS instance** (e.g. `/blog/post-1`) — proceed anyway; CMS instances inherit the site's tokens. But note in the summary "Tokens extracted from a CMS instance; consider re-running against the homepage for canonical brand palette."

## What you do NOT do

- You do NOT touch `src/pages/`, `src/components/`, `src/content/`, or `images/`.
- You do NOT build Layout/Header/Footer — that's `/import-homepage` / `/import-site`.
- You do NOT trigger the section-componentization pipeline.
- You do NOT call `/api/import-website` (which downloads assets) — token extraction reads computed styles, not stylesheets.

Re-running `/import-design-tokens <url>` is safe and idempotent. It always preserves keys you've added or changed by hand.
