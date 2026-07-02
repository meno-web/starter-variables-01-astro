---
description: Carve a flat page (src/pages/<slug>.astro with an inline node tree) into Header/Footer/Layout + zero-prop section components, then rewrite the page as a thin Layout shell. Reuses existing Header/Footer/Layout if already present. One server-side POST — section names come from the archetype dictionary.
allowed-tools: Bash, Read
argument-hint: "<slug> [--port=N]"
---

# /split-page $ARGUMENTS

Carve the page at `src/pages/<slug>.astro` into reusable components in one shot.
The server does the whole carve (section detection, archetype naming, chrome
build, page rewrite) — this skill just resolves the port and POSTs.

> **Non-interactive contract.** Never ask the user questions during this skill — see `.claude/docs/meno/studio-port.md`. Validation halts with a one-line error; uncertainty becomes a line in the final report.

> **Format-transparent.** `/api/auto-split` operates on the in-memory node tree and
> the provider emits `.astro` (or legacy `.json`) underneath — you pass a slug, not a
> file path, and the same call works regardless of on-disk format.

## What to do

1. **Parse `$ARGUMENTS`.** First token is the page slug; optional `--port=N` overrides Studio port detection.
   - Halt with a one-line error if the slug is empty, contains a slash, or ends in `.astro`/`.json` (pass the slug only — e.g. `about`, not `about.astro`).
   - If `--port` is present and not an integer in 1024–65535, drop it (don't halt).

2. **Resolve the Studio port** per `.claude/docs/meno/studio-port.md`. Substitute `<STUDIO_PORT>` for every literal `3000` below. Do NOT pre-read the file — `/api/auto-split` validates page existence server-side (404 if missing).

3. **POST `/api/auto-split`** with one call:

   ```bash
   curl -s -X POST http://localhost:<STUDIO_PORT>/api/auto-split \
     -H 'content-type: application/json' \
     -d '{"slug":"<slug>"}'
   ```

   The server: descends through single-child wrappers, splices `<main>`, drops
   insignificant nodes, detects nav/footer, names each remaining section via the
   archetype dictionary, builds Layout/Header/Footer **only if not already in
   `src/components/`**, and rewrites the page as a thin Layout shell of section refs.
   The response echoes the resolved `plan` plus the per-section result.

4. **On failure** (4xx/5xx), surface `error`/`message` from the JSON response verbatim and stop:
   - `404 page not found` → the slug doesn't resolve to a page; report the path and halt.
   - `422 no section candidates` / `422` body-container reasons → the page body isn't a carve-able node tree (already a thin shell, or out-of-dialect). Report verbatim; do not retry.
   - Studio dev server unreachable → halt with the one-line error from `studio-port.md`. Do NOT ask the user.

5. **Report.** Print a one-screen summary from the response and stop:

   ```
   ✅ Page:              src/pages/<slug>.astro → thin Layout shell
   ✅ Sections created:  <Name1>, <Name2>, …   (N)
   ✅ Chrome:            Layout <built|reused> · Header <built|reused|none> · Footer <built|reused|none>
   ✅ Renamed (collide): <any names the server suffixed>, else none
   ```

   Do not summarize, kick off follow-up work, or ask the user what to do next.

## Notes

- This is the **page → Layout + Header + Footer + sections** split only. To factor
  repeating subtrees *within* a section into one reusable component with N instances,
  use `/convert-children-to-components`. To split a hand-picked node's children each
  into their own component, use `/split-node`.
- Re-running on an already-split page is safe: existing chrome is reused and a page
  that's already a thin shell returns a `422`/no-candidates that you report and stop on.
- The Studio **editor** server must be running (ports 3000–3009; NOT the 8080–8089 SSR
  preview). `studio-port.md`'s health-check discriminates the two.
