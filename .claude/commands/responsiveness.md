---
description: For every component referenced by pages/<slug>.json (transitive closure), screenshot it at desktop/tablet/mobile widths and add tablet/mobile style overrides from a closed catalog (grid-to-stack, row-to-column, fixed-width-fluid, hero-typography-scale, stack-cta, hide-decorative, nav-hide-hamburger, horizontal-overflow-fix). Style-only — never modifies base, never writes JS. Operates in parallel: one sub-agent per component. Intended order: /split-page → /extract-components → /responsiveness → /add-interactivity.
allowed-tools: Task, Bash, Read
argument-hint: "<slug> [--port=N]"
---

# /responsiveness $ARGUMENTS

Walk through every component used by `pages/<slug>.json` (transitively) and add the responsive style overrides each one needs at tablet and mobile widths.

## What to do

1. **Parse `$ARGUMENTS`.** The first token is the page slug; an optional `--port=N` token sets the Studio editor port (useful when multiple Meno projects are running and this one is on 3001/3002/...).
   - Reject if the slug is empty, contains a slash, or ends in `.json`.
   - If `--port` is present, validate it's an integer in 1024–65535.

2. **Validate the page exists.** Confirm `pages/<slug>.json` is readable. If missing, stop and ask.

3. **Delegate to the `responsiveness-coordinator` subagent** via the Task tool. The coordinator handles port detection (env var → explicit arg → `lsof` cwd-match → auto-start), sidecar checks, breakpoint config lookup, fan-out, and the final report.

```
Task({
  description: "Responsiveness for <slug>",
  subagent_type: "responsiveness-coordinator",
  prompt: "Process the page <slug>. Studio port hint: <port-or-auto>. Read pages/<slug>.json, list every component reference under root (transitive closure including Layout/Header/Footer), read project.config.json for breakpoint widths, fan out one responsiveness-section sub-agent per component in a single response, then report. Follow .claude/agents/responsiveness-coordinator.md exactly. Report when done."
})
```

   Pass `auto` when the user didn't supply `--port`; otherwise pass the explicit number.

4. **When the subagent returns**, print its final report verbatim and stop. Do not summarize, embellish, or kick off follow-up work.

## Notes

- **Intended order**: `/split-page <slug>` → `/extract-components <slug>` → `/responsiveness <slug>` → `/add-interactivity <slug>`.
  - `/split-page` produces zero-prop section components with inline node trees.
  - `/extract-components` factors repeating subtrees into reusable components.
  - `/responsiveness` (this skill) adds tablet/mobile overrides so the multi-level tree lays out correctly at narrow viewports.
  - `/add-interactivity` then walks the same tree and adds JS for mobile-nav, dropdowns, etc. Running it AFTER responsiveness means the CSS hooks (`display: none` on desktop nav, `display: flex` on hamburger) are already in place when the JS gets wired.
- **This skill only touches `tablet` and `mobile` style blocks.** It never edits `base`. The desktop layout is treated as the source of truth.
- **This skill does NOT write JS.** Mobile-nav CSS hooks are set; the click handler is `/add-interactivity`'s job.
- **This skill does NOT restructure.** If a section's DOM shape is wrong for responsive (e.g. it should really be a grid but is built as absolute-positioned divs), this skill skips it and logs a follow-up. Restructuring is out of scope.
- Port detection (handled by the coordinator) — target is the Studio **editor** server (3000-range), NOT the SSR preview (8080-range; same PID, same cwd, but no write routes):
  1. Explicit `--port=N` wins.
  2. Else `$PORT` env var, if set. (`$MENO_SERVE_PORT` is the SSR preview — do NOT use it.)
  3. Else scan ports 3000–3009 with `lsof`, pick listeners whose cwd matches and that pass the Studio-only JSON health-check (`/api/page-folders` → `200 application/json`).
  4. Else read `package.json` `scripts.dev` and spawn it in the background.
- Playwright sidecar (port 1338) is started via the Studio control endpoint once the Studio port is known. Each section worker takes its own three screenshots — one per breakpoint width.
- Breakpoint widths come from `project.config.json.breakpoints` (`tablet`, `mobile`). Defaults: 1024 / 540.
- The skill recognizes a closed catalog of responsive patterns. Anything outside the catalog is logged as a TodoWrite follow-up — not invented from scratch.
