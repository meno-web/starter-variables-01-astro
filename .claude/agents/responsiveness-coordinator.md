---
name: responsiveness-coordinator
description: Coordinator agent for /responsiveness. Reads pages/<slug>.json, lists every component reference (transitive closure), ensures Studio dev server + Playwright sidecar are up, fans out one responsiveness-section worker per component in a single response, then collects their reports. Workers screenshot each component at desktop/tablet/mobile widths and add tablet/mobile style overrides from a closed catalog. No cross-component glue — each worker is self-contained.
tools: Task, Bash, Read, Write, Edit, Grep, Glob, TodoWrite
model: inherit
effort: medium
---

# Responsiveness Coordinator

You orchestrate the responsiveness pass for one page. You do NOT analyze individual components or write style overrides yourself — that's the worker's job. Your responsibilities:

1. Resource setup (dev server + sidecar).
2. Read `project.config.json` once and pass the breakpoint widths to every worker.
3. Identify the component list (transitive closure, same rule as /add-interactivity).
4. Fan out in ONE response.
5. Final report.

> **Non-negotiable rule:** all worker `Task` calls go in ONE assistant response. Serial dispatch wastes the parallelism budget.

## Inputs

- `<slug>` — the page slug. Read from `pages/<slug>.json`.
- `port-hint` — either an explicit integer (`--port=N`) or the literal string `auto`.
- Project root = current working directory.

## Conventions

Throughout, `<STUDIO_PORT>` is the port resolved in STEP 0a. The Playwright sidecar is always on `1338`.

## The loop

```
================================================================================
STEP 0 — RESOURCE SETUP
================================================================================

  0a. RESOLVE STUDIO_PORT (in order; first hit wins):

      (i)   Explicit hint. If port-hint is a number, use it. Skip to 0a-health.
      (ii)  Env var. If $PORT is set, use it. Skip to 0a-health.
            ($MENO_SERVE_PORT is the SSR preview port — do NOT use it here.)
      (iii) lsof cwd-match + Studio-only JSON health-check. Scan **3000–3009**
            (editor range; the SSR preview on 8080–8089 also matches cwd and
            answers `GET /` with 200, so plain "did port respond" is wrong).
            For each port, require `/api/page-folders` → `200 application/json`:

              for p in 3000 3001 3002 3003 3004 3005 3006 3007 3008 3009; do
                pid=$(lsof -ti :$p -sTCP:LISTEN 2>/dev/null | head -1)
                [ -z "$pid" ] && continue
                cwd=$(lsof -a -p $pid -d cwd -Fn 2>/dev/null \
                      | awk '/^n/{ sub(/^n/,""); print }' | tail -1)
                [ "$cwd" = "$(pwd)" ] || continue
                probe=$(curl -s -o /dev/null -w '%{http_code} %{content_type}' \
                        --max-time 2 http://localhost:$p/api/page-folders 2>/dev/null)
                case "$probe" in "200 application/json"*) echo $p; break ;; esac
              done

      (iv)  Auto-start. No matching server is running. Read package.json's
            `scripts.dev`. Spawn it in the background:

              bash -c 'nohup bun run dev > /tmp/meno-dev-<slug>.log 2>&1 & echo $!' \
                > /tmp/meno-dev-<slug>.pid

            Poll for up to 30s until a Studio port appears for the new PID.
            Tail the log if the port never appears.

  0a-health. Health-check the chosen port:
        curl -s -o /dev/null -w '%{http_code}' http://localhost:<STUDIO_PORT>/
      Not 200/302 → halt with a one-line error pointing at the port and the
      spawn log (if 0a-iv was used).

  0b. Health-check Playwright sidecar:
        curl -s -o /dev/null -w '%{http_code}' http://localhost:1338/health
      Not 200 → try to start it once via Studio's control endpoint:
        curl -s -X POST http://localhost:<STUDIO_PORT>/api/playwright-server \
          -H 'content-type: application/json' -d '{"action":"start"}'
      Re-poll /health up to 3 times with 1s sleep. Still down → halt.

  0c. Read project.config.json from the project root. Extract:
        - breakpoints.tablet  (default: 1024 if missing)
        - breakpoints.mobile  (default: 540  if missing)
      Workers need these to take width-accurate screenshots. Pass both to
      each worker in its prompt.

  0d. Pre-warm the SSR preview so workers don't all cold-start:
        curl -s -o /dev/null http://localhost:<STUDIO_PORT>/<slug>/
      (Trailing slash matters — try both forms if the first 404s.)

================================================================================
STEP 1 — IDENTIFY THE COMPONENT LIST (transitive — leaves matter)
================================================================================

  1a. Read pages/<slug>.json.

  1b. RECURSIVELY COLLECT every component name in the transitive closure:
        - Start: every component reference in root's tree.
        - For each name discovered, read components/<Name>.json and recurse
          into ITS structure, collecting more component refs.
        - Continue until the set stops growing.

      Dedupe by name. Preserve first-discovered order (mostly for reports).

  1c. Do NOT filter chrome (Layout, Header, Footer). They need responsive
      treatment just as much as section components — in fact, Header is a
      prime candidate (nav hides, hamburger shows, sticky-on-scroll padding
      shrinks).

  1d. If the resulting list is empty → halt: "No components to process."

  Why transitive: after /extract-components, sections reference blocks
  (FAQItem, PricingTier) and primitives (Button). Responsive fixes often
  belong at the LEAF — a card's fixed `width: 320px` is the card's
  problem, not the grid container's. The worker on each component only
  sees its OWN structure, so leaf components are the only place where
  the leaf's style CAN be modified.

================================================================================
STEP 2 — FAN OUT (ONE RESPONSE, N PARALLEL TASKS)
================================================================================

  In a SINGLE assistant response, dispatch one Task per component:

  Task({
    description: "Responsiveness for <Name>",
    subagent_type: "responsiveness-section",
    prompt: "Analyze component <Name> as used on page <slug>. Studio port:
<STUDIO_PORT>. Tablet width: <TABLET>. Mobile width: <MOBILE>. Screenshot the
component's root element at desktop (1280), tablet (<TABLET>), and mobile
(<MOBILE>) widths from http://localhost:<STUDIO_PORT>/<slug>/ with selector
'[data-component-context=\"<Name>\"][data-component-root=\"true\"]'. Read
components/<Name>.json. Decide which patterns from the catalog apply.
Apply tablet/mobile style overrides ONLY — never touch base. Save via
/api/save-component. Follow .claude/agents/responsiveness-section.md
exactly. Report concisely when done."
  })

  Tasks run concurrently. Wait for ALL of them to return.

================================================================================
STEP 3 — COLLECT WORKER REPORTS
================================================================================

  Each worker returns a structured one-line summary. Aggregate:

    applied     = workers that wrote responsive overrides
    delegated   = workers that recognized an issue but it belongs in a child
                  component (e.g. a grid of cards where the card width is
                  the problem)
    skipped     = workers that found nothing in the catalog to apply
                  (component already responsive, or no issues at the
                  tested widths)
    unknown     = workers that saw a responsive issue outside the catalog
                  → TodoWrite follow-ups
    error       = workers that hit a save/screenshot failure they couldn't
                  recover from

================================================================================
STEP 4 — REPORT
================================================================================

  Print one compact summary and stop:

  ✅ Page:        pages/<slug>.json
  ✅ Processed:   <N> components (parallel sub-agents, transitive closure)
  ✅ Breakpoints: tablet=<TABLET>px, mobile=<MOBILE>px
  ✅ Applied:     [<Name>: [pattern, ...], ...]
  ✅ Delegated:   [<Parent>: <pattern> -> <Child>, ...]
  ⏭  Skipped:    [<Name>: <reason>, ...]
  ⚠ Follow-ups:  [<Name>: <one-line description>, ...]
  ❌ Errors:      [<Name>: <error>, ...]
  🌐 Preview:    http://localhost:<STUDIO_PORT>/<slug>
  ⚙ Port:        <STUDIO_PORT> (source: explicit | env | lsof-cwd | auto-started)

  Do not embellish. Hand control back.
```

## Hard rules

- **One response for all worker Tasks.** Never dispatch them serially.
- **Workers are self-contained.** No cross-component post-pass — every fix is local to one component's style tree.
- **Never modify `base` styles.** Responsiveness only adds/edits `tablet` and `mobile` blocks. The desktop layout is treated as the source of truth.
- **Trust `responsiveScales`.** `project.config.json.responsiveScales` already auto-scales var-based fontSize/padding/margin/gap. Workers should only override these when the screenshot proves the auto-scale isn't enough — never preemptively.

## Failure modes

| Symptom | Action |
|---|---|
| No Studio matches cwd AND auto-start fails | Halt; print the spawn log path |
| Explicit `--port=N` provided but unreachable | Halt; do NOT auto-start (user said this port specifically) |
| Sidecar can't be started | Halt; report the start-attempt error |
| `pages/<slug>.json` missing | Halt; report path |
| `project.config.json` missing or unparseable | Halt; ask user to fix it (we need breakpoints) |
| Worker timed out | Mark that component as "skipped: worker-timeout"; continue with the rest |

## What this skill explicitly does NOT do

- Restructure nodes (insert/remove DOM, change tag, reorder children). Style-only.
- Write JS or touch existing `.js` files. Mobile-nav JS is `/add-interactivity`'s job — this skill may set up the **CSS hooks** (hide desktop nav, show hamburger button) but never wires click handlers.
- Re-extract design tokens. If a fixed pixel value should really be a variable, leave it — that's `/import-design-tokens`.
- Re-cluster components into smaller pieces. If a section is "card-shaped" but built as raw nodes, leave it — `/extract-components` is the answer.
- Touch base/desktop styles. The skill assumes desktop renders correctly.
