---
description: For every section component referenced by src/pages/<slug>.astro, decide whether it needs interactivity (mobile menu, dropdown, tabs, accordion, modal trigger, carousel, sticky header, smooth-scroll, copy-to-clipboard, form behavior) and, if so, add the right data attributes + embedded component script. Operates in parallel: one sub-agent per section. Wires cross-component interactions (e.g. trigger button -> Modal) via CustomEvents.
allowed-tools: Task, Bash, Read
argument-hint: "<slug> [--port=N]"
---

# /add-interactivity $ARGUMENTS

Walk through every section component used by `src/pages/<slug>.astro` and add the JavaScript interactivity each one needs.

## What to do

> **Non-interactive contract.** Never ask the user questions during this skill — not at parse time, not mid-run, not on failure. The user already invoked the skill; that is the consent. Validation failures halt with a one-line error. Mid-flight uncertainty is reported in the final summary, never as a question.

1. **Parse `$ARGUMENTS`.** The first token is the page slug; an optional `--port=N` token sets the Studio editor port (useful when multiple Meno projects are running and this one is on 3001/3002/...).
   - Reject (halt with one-line error) if the slug is empty, contains a slash, or ends in `.astro`.
   - If `--port` is present and not an integer in 1024–65535, drop it and fall back to auto-detection (don't halt).

2. **Validate the page exists.** Confirm `src/pages/<slug>.astro` exists. The coordinator reads the page model through the format-transparent route `GET /api/pages/<slug>` (returns `{ meta, root }`). If missing, halt with a one-line error — do NOT prompt for alternatives.

3. **Delegate to the `interactivity-coordinator` subagent** via the Task tool. The coordinator handles port detection (env var → explicit arg → `lsof` cwd-match → auto-start), sidecar checks, fan-out, and cross-component wiring.

```
Task({
  description: "Add interactivity to <slug>",
  subagent_type: "interactivity-coordinator",
  prompt: "Process the page <slug>. Studio port hint: <port-or-auto>. Read the page model via GET /api/pages/<slug>, list every component reference under root (transitive), fan out one interactivity-section sub-agent per component in a single response, then wire any cross-component intents (modals, drawers, toasts). Follow .claude/agents/interactivity-coordinator.md exactly. Report when done."
})
```

   Pass `auto` when the user didn't supply `--port`; otherwise pass the explicit number.

4. **When the subagent returns**, print its final report verbatim and stop. Do not summarize, embellish, kick off follow-up work, or ask the user what to do next — the report is the final word.

## Notes

- This skill assumes `/split-page` (or its equivalent) has already run — `src/pages/<slug>.astro` should already be a thin shell of component refs.
- Port detection (handled by the coordinator) — target is the Studio **editor** server (3000-range), NOT the SSR preview (8080-range; same PID, same cwd, but no write routes):
  1. Explicit `--port=N` wins.
  2. Else `$PORT` env var, if set. (`$MENO_SERVE_PORT` is the SSR preview — do NOT use it.)
  3. Else scan ports 3000–3009 with `lsof`, pick listeners whose cwd matches and that pass the Studio-only JSON health-check (`/api/page-folders` → `200 application/json`).
  4. Else read `package.json` `scripts.dev` and spawn it in the background; wait up to 30s for a Studio editor port to appear for the new PID.
- Playwright sidecar (port 1338) is started via the Studio control endpoint once the Studio port is known.
- Each section worker takes its own screenshot (selector `[data-component-context="<Name>"][data-component-root="true"]`) and reasons from screenshot + node tree together. Screenshots are NOT shared across workers — one image per fresh sub-agent context.
- The skill recognizes a closed catalog of interactivity patterns (mobile-nav / dropdown / tabs / accordion / modal-trigger / carousel / sticky-header / smooth-scroll / copy-to-clipboard / form). Anything outside the catalog is logged as a TodoWrite follow-up, not invented from scratch.
</content>
</invoke>
