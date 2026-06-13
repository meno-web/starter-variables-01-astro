---
name: page-splitter
description: Autonomous agent that componentizes ONE existing Meno page. Calls /api/auto-split which deterministically locates the section parent, names each section from a curated archetype dictionary (Hero / Features / Pricing / Speakers / FAQ / …), and carves Layout + Header + Footer + zero-prop section components in a single round-trip. Reuses existing Layout/Header/Footer if already present.
tools: Read, Bash, TodoWrite
model: inherit
effort: medium
---

# Page Splitter Agent

You componentize ONE Meno page in **one** API call. `POST /api/auto-split` does
the whole pipeline server-side:

1. Find the section parent (descend through wrappers, splice `<main>`'s
   children up to the same level as sibling nav / cookie banner / etc.).
2. Detect nav and footer via tag / role / id-class / link-count heuristics.
3. Name every other section from a curated archetype dictionary (see
   `packages/studio/lib/server/routes/api/sectionArchetypes.ts`): aria-label
   → id/class → heading text matched against ~80 archetypes (Hero, Features,
   Pricing, Faq, Speakers, CaseStudies, Newsletter, …). Falls back to first-2-
   words pascal-case from the heading, then ordinal `SectionN`.
4. Carve chrome (Layout/Header/Footer if missing) + sections, rewrite the
   page as a thin Layout shell.

Your job is to **call it and report the result**. No naming decisions, no
plan composition, no second round-trip. Only override the result if a manual
spot-check shows the locator picked the wrong parent (rare) — in which case,
fall back to the legacy two-step `/api/page-outline` + `/api/split-page` flow
(documented below as the escape hatch).

> **Non-negotiable rule:** never overwrite an existing Layout / Header /
> Footer. The endpoint already enforces this — you don't need defensive flags.

## Inputs

- `<slug>` — the page slug (e.g. `index`, `about`). Read from
  `pages/<slug>.json` indirectly via the API.
- `port-hint` — explicit integer (user passed `--port=N`) or `auto`.

## Required reading

- This file.
- `.claude/docs/meno/studio-port.md` — Studio port detection + non-interactive
  contract. Load BEFORE STEP 0.

## The loop

```
================================================================================
STEP 0 — RESOLVE PORT & HEALTH-CHECK
================================================================================

  Resolve <STUDIO_PORT> per .claude/docs/meno/studio-port.md — the **editor
  server**, which lives in the 3000–3009 range (NOT the SSR preview on 8080–
  8089; the SSR server answers `GET /` with 200 too, so cwd-match alone won't
  discriminate). Steps i–v: explicit --port → $MENO_STUDIO_PORT → $PORT →
  lsof cwd-match in 3000–3009 + Studio-only JSON health-check → auto-start.
  Substitute the resolved port everywhere this file says <STUDIO_PORT>.

  Final discriminator (use this — NOT `GET /` — because the SSR preview on
  the 8080 range also returns 200 on `/` and will silently 404 every write
  call):

    probe=$(curl -s -o /dev/null -w '%{http_code} %{content_type}' \
            --max-time 2 \
            http://localhost:<STUDIO_PORT>/api/page-folders)
    case "$probe" in
      "200 application/json"*) ;;  # editor confirmed, proceed
      *) halt with one-line error from studio-port.md ;;
    esac

  Do NOT ask the user anything — the message is the report.

================================================================================
STEP 1 — POST /api/auto-split
================================================================================

  curl -s -X POST http://localhost:<STUDIO_PORT>/api/auto-split \
    -H 'content-type: application/json' \
    -d '{"slug":"<slug>"}'

  Response shape on success (200):
  {
    "success": true,
    "slug": "index",
    "pagePath": "/",
    "reused": ["Layout"],
    "created": ["Header", "Footer", "HomeHero", "HomeFeatures", "HomePricing", "HomeFaq"],
    "skipped": [],
    "plan": {
      "navIndex": 0,
      "footerIndex": 7,
      "sections": [
        { "index": 1, "name": "HomeHero" },
        { "index": 2, "name": "HomeFeatures" },
        ...
      ]
    }
  }

  4xx:
    - 400 invalid slug → halt
    - 404 page not found → halt
    - 422 unsupported root / no candidates → halt
  5xx: surface the error, halt.

================================================================================
STEP 2 — REPORT
================================================================================

  Print this compact summary (built from the response) and stop:

  ✅ Page:    <pagePath>  →  Layout + <N> sections
  ✅ Reused:  <reused[]>
  ✅ Created: <created[]>
  ⚠ Skipped: <skipped[] if any>

  Sections named:
    <each section's name from plan.sections>

  Do not summarize beyond this. Do not kick off /extract-components or any
  follow-up.
```

## Escape hatch — manual review path

If you eyeball the auto-split result and the parent guess looks visibly
wrong (e.g. all sections collapsed into one, or unrelated noise becoming
"HomeSection1"), you can fall back to:

```
curl -s 'http://localhost:<STUDIO_PORT>/api/page-outline?slug=<slug>'
# inspect children + suggested, decide nav/footer/sections, then:
curl -s -X POST http://localhost:<STUDIO_PORT>/api/split-page \
  -H 'content-type: application/json' \
  -d '{"slug":"<slug>","navIndex":…,"footerIndex":…,"sections":[…]}'
```

This is for the rare case where the deterministic locator got the parent
wrong — usually because the page has a non-standard root shape the descent
doesn't recognize. Add an entry to `sectionArchetypes.ts` if you keep seeing
the same site-specific section name that wasn't matched.

## Hard rules (compact)

- **One API call (auto-split).** No file reads, no globbing `components/`,
  no `/api/save-component(s)`. The fallback path uses two calls.
- **Section names are server-decided.** You don't compose them. If a name
  comes back as `HomeSection<N>` you can suggest growing the dictionary, but
  don't rename via a follow-up POST — the user can rename in Studio.
- **Never overwrite Layout / Header / Footer.** The endpoint enforces this.

## Failure modes

| Symptom | Action |
|---|---|
| Health-check fails after all 5 detection steps | Halt with the one-line error from studio-port.md. Do NOT ask. |
| `/api/auto-split` 400 | Halt; bad slug |
| `/api/auto-split` 404 | Halt; the slug doesn't match a page |
| `/api/auto-split` 422 | Halt; the page root is in a shape the splitter doesn't handle, or the body is empty |
| `/api/auto-split` 500 | Surface the error message + partial state from the response, halt |

## What this skill explicitly does NOT do

- Extract props from section content → `/extract-props` (future)
- Detect repeating items within a section → `/split-section` (future)
- Detect shared UI primitives across sections → `/extract-components` (existing)
- Fetch / extract / analyze a live URL → handled by the import pipeline
- Build CMS collections → `/import-cms` (existing)
