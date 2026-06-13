# Site Import Loop — Operational Playbook

This is the runbook the `site-importer` agent (and `/import-site` slash command) loads when converting a live website into a Meno project. It assumes Meno's existing conversion services do the heavy lifting — your job is to **orchestrate** them, not reimplement them.

> **Two non-negotiable rules:**
>
> 1. **Homepage is sacred.** Build a working homepage + complete component library *first*. Every other page reuses that library. Any halt after STEP 2 still leaves the user a usable result.
> 2. **Save early, refine progressively.** Don't wait until the end of a step to produce output. After the raw fragment lands, save a working page *immediately*, then factor sections in place. The user sees something useful within ~30s, not 5 minutes.

## What you have

### Sidecar (port 1338) — `packages/studio/lib/server/playwright/`

Local HTTP server driving headless Chromium. Start once at the top of the loop:

```bash
curl -s -X POST http://localhost:8080/api/playwright-server \
  -H 'content-type: application/json' -d '{"action":"start"}'
```

(Replace `:8080` with the Meno Studio dev server port.)

The sidecar exposes:

| Method | Path                  | Body                                                                | Returns |
|--------|-----------------------|---------------------------------------------------------------------|---------|
| GET    | `/health`             | —                                                                   | `{ok:true, port}` |
| POST   | `/extract`            | `{ url, mode?, viewport?, dclTimeoutMs?, settleTimeoutMs? }`        | `{ success, data: MenoImportData, viewportWidth }` |
| POST   | `/probe-interactions` | `{ url, viewport?, maxHovers?, maxClicks? }`                        | `{ success, hover[], focus[], clickToOpen[] }` |
| POST   | `/screenshot`         | `{ url, viewport?, fullPage?, selector? }`                          | raw `image/png` bytes |

**Extract timeouts:** default 20s DCL + 10s settle (≈30s typical-case). The legacy 60s ceiling is gone — if a page can't paint a DOM in 20s, it's hung. On retry, bump `dclTimeoutMs: 40000, settleTimeoutMs: 20000`.

**Probe defaults for v0:** the autonomous loop overrides defaults to `maxHovers: 8, maxClicks: 4` for the first homepage pass (scoped to header/nav, where 95% of affordances live). A "deep probe" follow-up can run after the homepage is saved.

### Existing Studio routes (port 8080)

| Purpose                       | Route                              | Method |
|-------------------------------|------------------------------------|--------|
| Sitemap + template discovery  | `/api/fetch-sitemap`               | POST   |
| Asset download (single URL)   | `/api/import-website` / `/api/import-page` | POST |
| HTML → Meno fragment          | `/api/html-to-meno-fragment`       | POST   |
| Per-page analysis             | `/api/analyze-page`                | POST   |
| Per-page content extraction   | `/api/extract-page-content`        | POST   |
| Save page JSON                | `/api/save-page`                   | POST   |
| Save component (one)          | `/api/save-component`              | POST   |
| **Save components (batch)**   | **`/api/save-components`**         | **POST**   |
| Create CMS collection         | `/api/cms/collections`             | POST   |
| Create CMS item               | `/api/cms/{collectionId}`          | POST   |
| Write variables / colors      | direct file write to `variables.json` / `colors.json` |

**Important about `/api/import-website` and `/api/import-page`:** both are SINGLE-URL — they fetch one page's HTML and download only the assets that page references. Neither crawls sub-pages. Calling `/api/import-website` for the homepage is cheap.

**Important about `/api/save-components`:** the batched plural — accepts `{ components: [{ name, data, category? }, …] }` and writes them all in one round-trip with a single HMR debounce window. Use this for the section-component batch at the end of STEP 2.

## Multi-agent architecture

The import system is **three agents + three commands**, designed so you can run the full pipeline, just CMS, or just pages — independently. Multiple sub-agents run concurrently when work fans out.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Commands                                                                │
│                                                                         │
│   /import-site   <url>                — full pipeline (coordinator)     │
│   /import-cms    <url> [--group=PAT]  — JUST CMS groups (independent)   │
│   /import-pages  <url1> [url2 …]      — JUST unique pages (independent) │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Agents                                                                  │
│                                                                         │
│   site-importer  (coordinator)                                          │
│                                                                         │
│   STEP 0–1: solo (canonicalize URL, sidecar up, sitemap)                │
│                                                                         │
│   STEP 2: 3-way parallel fan-out after fragment lands                   │
│           ┌───────────────────┬─────────────────────┐                   │
│           ▼                   ▼                     ▼                   │
│     ┌──────────┐        ┌──────────────┐      ┌──────────┐              │
│     │ COORD    │        │ site-        │      │ site-    │              │
│     │ Layout + │ ∥      │ importer-    │  ∥   │ importer-│              │
│     │ Header + │        │ variables    │      │ interac- │              │
│     │ Footer + │        │ (vars.json + │      │ tions    │              │
│     │ Sections │        │  colors.json)│      │ (patch-  │              │
│     │          │        │              │      │  plan)   │              │
│     └────┬─────┘        └──────┬───────┘      └────┬─────┘              │
│          │                     │                   │                    │
│          └──── all return ─────┴────── join ───────┘                    │
│                                ▼                                        │
│        COORD applies patch-plan → final /api/save-components            │
│                                                                         │
│   STEP 3+4: fan out across CMS groups + page batches                    │
│         ┌─────────────┬─────────────┬─────────────┐                     │
│         ▼             ▼             ▼             ▼                     │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐                │
│   │ site-    │  │ site-    │  │ site-    │  │ site-    │                │
│   │ importer-│  │ importer-│  │ importer-│  │ importer-│                │
│   │ cms-group│  │ cms-group│  │ page     │  │ page     │                │
│   │ /speaker │  │ /blog    │  │ batch 1  │  │ batch 2  │                │
│   └──────────┘  └──────────┘  └──────────┘  └──────────┘                │
│                                                                         │
│   STEP 5+6: solo (verify + report)                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

**The five agents (with per-agent thinking effort):**

| Agent | Role | `effort` | Why |
|---|---|---|---|
| `site-importer` | Coordinator. STEP 0–2 (library build) + STEP 5–6 (verify/report). Dispatches sub-agents. | `high` | All architectural judgment: section naming, component boundaries, library design, join logic |
| `site-importer-variables` | STEP 2 parallel. Reads analysis.json + extracted.json → writes variables.json + colors.json | `low` | Pure JSON transform. No design decisions. Fast and cheap. |
| `site-importer-interactions` | STEP 2 parallel. Reads interactions.json → writes patch-plan.json | `low` | Pure JSON transform + selector normalization. Mechanical. |
| `site-importer-cms-group` | One CMS template family. 2-sample diff → schema + card → bulk items. | `medium` | Bounded judgment: field naming, type inference. Heavier than transform, lighter than architecture. |
| `site-importer-page` | One batch of unique pages. Section carving + thin shells. | `medium` | Per-page judgment, but reuses coordinator's library decisions. |

The `effort:` frontmatter field overrides the session default (typically high for Opus). Sub-agents inherit the model but use their own effort level — `low` effort sub-agents finish in a fraction of the time of full-effort ones, which compounds nicely under parallel dispatch.

Users can override any agent's effort by editing its frontmatter directly. Sensible reasons to do so:
- Bumping `site-importer-page` to `high` for sites with very complex / unusual page layouts that need careful section carving.
- Dropping `site-importer-cms-group` to `low` for sites with very simple, consistent CMS items (a basic blog with title/date/body).

### Library handoff contract

The coordinator builds in STEP 2:
- `components/Layout.json`, `components/Header.json`, `components/Footer.json`
- `variables.json`, `colors.json`
- Any cards from homepage repeating patterns (e.g. `components/BlogCard.json` if the homepage showed "Latest articles")
- All `Home*` section components (HomeHero, HomeFeatures, etc.)

Sub-agents read this state **from disk** when they start — the filesystem is the source of truth. No library state is passed in the Task prompt. Sub-agents:
- READ `components/*.json`, `variables.json`, `colors.json` freely
- WRITE only their own outputs (per-page section components, per-CMS card augmentations, CMS items, page JSONs, template JSONs)
- NEVER modify Layout, Header, Footer, variables, or colors

### The patch-plan convention (STEP 2 parallelism)

Three agents work concurrently in STEP 2 — coordinator (componentizing), variables sub-agent (`variables.json` + `colors.json`), and interactions sub-agent (selector-keyed style diffs). All three write disjoint output:

- **Coordinator** writes `components/Layout.json`, `components/Header.json`, `components/Footer.json`, `components/Home*.json`.
- **Variables sub-agent** writes `variables.json` + `colors.json` (preserves existing keys).
- **Interactions sub-agent** writes `rendered-websites/<host>/pages/home/patch-plan.json` — *NOT* `components/`.

Then the coordinator joins:

```
patch-plan.json
{
  "version": 1,
  "interactions": [
    {
      "selector": ".cta-button.primary",
      "state": "hover",
      "kind": "button-like",
      "styles": {
        "color": ["#4F46E5", "#4338CA"],
        "background-color": ["#FFFFFF", "#F3F4F6"]
      }
    },
    ...
  ],
  "statefulWidgetHints": [
    {
      "triggerSelector": "button.menu-toggle",
      "triggerText": "Menu",
      "revealedSelector": ".menu-panel",
      "domDelta": 2048,
      "hint": "Looks like a mobile menu / nav drawer."
    }
  ]
}
```

The coordinator's join logic (runs after the parallel streams return):

1. For each entry in `interactions[]`, find the component whose carved tree contains a node matching `selector`. Coordinator already knows section→selector mapping from carving; the match is best-effort.
2. Walk that component's structure to the matching node. Add `interactiveStyles: { <state>: { ...styles map... } }`.
3. Unmatched entries → log to checkpoint as `unmatched-interaction`, do not error.
4. Batch all modified components into ONE final `/api/save-components` call.

Why this shape: the interactions sub-agent can't write to `components/` directly (would race with the coordinator's componentization). The patch-plan format defers all component writes to one entity (the coordinator), eliminating the race.

`statefulWidgetHints[]` are advisory — the coordinator decides whether to factor (rare in STEP 2; usually queued as a follow-up for the user to review).

### Per-agent checkpoints

Each agent writes to its own checkpoint file to avoid write contention:

| Agent | Checkpoint file |
|---|---|
| Coordinator | `.claude/plans/progress/import-<host>-checkpoint.md` |
| Variables sub-agent | none (idempotent, reads files / writes variables.json + colors.json) |
| Interactions sub-agent | none (idempotent, reads interactions.json / writes patch-plan.json) |
| Per CMS group | `.claude/plans/progress/import-<host>-cms-<id>.md` |
| Per page batch | `.claude/plans/progress/import-<host>-pages-<batchId>.md` |

The two STEP 2 sub-agents (`variables`, `interactions`) are *stateless* — they read inputs from disk and produce one output file. Re-running them is safe and produces identical results. No checkpoint needed.

After STEP 3+4 returns, the coordinator merges sub-agent reports into the master checkpoint.

### Fan-out decision rule

Coordinator stays serial when:
- Zero CMS template groups AND ≤5 unique pages remain

Coordinator fans out when:
- ≥1 CMS template group OR ≥6 unique pages remain

Small sites don't recover the context-window cost of sub-agent dispatch; large sites benefit dramatically.

### Independent invocation

Several phases of this playbook are also available as standalone slash commands users can run on their own — `/import-site` is the one-shot entry point; the rest are step-by-step alternatives:

- **`/sitemap <url>`** — STEP 1 only. Fetches `/api/fetch-sitemap`, classifies template-groups vs unique pages, prints a readable table. No project writes. Useful pre-flight.
- **`/import-design-tokens <url>`** — STEP 2f-i + 2f-ii only. Extracts typography + colors from the live page, merges into `variables.json` + `colors.json`. Preserves hand-added keys.
- **`/import-cms <url>`** — STEP 3 only. Detects template groups itself, then fans out one sub-agent per group. If Layout doesn't exist yet, sub-agents use a passthrough root and flag a follow-up.
- **`/import-pages <url1> <url2>`** — STEP 4 only. Assumes the library exists but tolerates a missing one (warns, proceeds with passthrough roots).
- **`/split-page <slug>`** — section-componentization of an already-saved page.
- **`/extract-components <slug>`** — primitives/blocks mining inside a saved page's sections.
- **`/add-interactivity <slug>`** — adds JS behaviour to a saved page's section components.
- **`/verify-import [slug]`** — STEP 5 only. Side-by-side screenshot of live vs Studio render.

This means: a user can run `/import-cms https://acme.com --group=/blog/*` against an empty project to build just the blog collection, without first running `/import-site`. Or use `/sitemap` to inspect the site, then compose the rest by hand. Or run `/import-site` later to fill in the rest. In your final report under STEP 6, if you halted before completing every page or CMS group, point the user at the relevant per-phase command so they can resume manually with finer control.

## Context discipline (read before issuing your first curl)

Every agent has a finite context window. The biggest risk is reading large API responses into your context inadvertently. A single homepage's extracted HTML + Meno node tree can be 1-2 MB each — six pages of that and your context is exhausted.

Three rules, every API call, every time.

### Rule 1 — Pipe responses to disk; never capture bodies

```bash
# WRONG — entire response body enters your tool-call result
RESULT=$(curl -s -X POST http://localhost:1338/extract -d "$payload")

# RIGHT — response written directly to disk; your context sees only the
# curl invocation (~150 chars), not the megabyte response.
curl -s -X POST http://localhost:1338/extract \
  -H 'content-type: application/json' \
  -d '{"url":"https://acme.com","mode":"pixels"}' \
  -o rendered-websites/acme.com/pages/home/extracted.json

# Check success via HTTP status, not body inspection:
HTTP=$(curl -s -w '%{http_code}' -o file.json -X POST ...) && echo "status=$HTTP"
```

Apply to every call that returns big data:

| Call | Save to |
|---|---|
| sidecar `/extract` | `rendered-websites/<host>/pages/<slug>/extracted.json` |
| `/api/html-to-meno-fragment` | `rendered-websites/<host>/pages/<slug>/fragment.json` |
| `/api/analyze-page` | `rendered-websites/<host>/pages/<slug>/analysis.json` |
| `/api/extract-page-content` | `rendered-websites/<host>/pages/<slug>/content-extraction.json` |
| sidecar `/screenshot` | `rendered-websites/<host>/verify/<name>.png` |

Small responses (`/api/save-page`, `/api/save-component`, `/api/save-components`, `/api/cms/<id>`, control routes, `/api/fetch-sitemap`) return tiny JSON — capturing those is fine, since you need the success/failure status. Rule of thumb: if you might want to *act on the response content*, capture it; if you only want to *use it later via another curl*, save to disk.

### Rule 2 — Inspect with `jq`, not `cat`

```bash
# WRONG — entire 2MB fragment lands in your context
cat rendered-websites/acme.com/pages/home/fragment.json

# RIGHT — query for exactly what you need
jq '.root.children | length' rendered-websites/acme.com/pages/home/fragment.json
# → returns a single number

jq '[.sections[] | {name: .suggestedComponent, bbox: .bbox, heading: .dominantHeading}]' \
  rendered-websites/acme.com/pages/home/analysis.json
# → returns ~1-2KB of section metadata, not the megabyte tree
```

Common queries you'll want:

| Goal | Query |
|---|---|
| Section list (carving guide) | `jq '[.sections[] \| {name:.suggestedComponent, bbox:.bbox, heading:.dominantHeading}]' analysis.json` |
| Typography styles | `jq '.typography' analysis.json` |
| Colors | `jq '.colors' analysis.json` |
| CSS variables (names only) | `jq '.cssVariables \| keys' extracted.json` |
| CSS variables (full map) | `jq '.cssVariables' extracted.json` |
| Fonts | `jq '.fontFaces' analysis.json` |
| Sitemap template groups | `jq '[.templateGroups[] \| {pattern, instances:(.instances\|length)}]' sitemap.json` |
| Page HTML length sanity check | `wc -c rendered-websites/<host>/pages/home/extracted.json` |

When `jq` won't fit a need (rare for our shape of data), `grep -c`, `head -n 50`, `tail -n 50` are next preference. Reading whole files into context is the last resort.

### Rule 3 — Pass data between API calls by file reference

```bash
# WRONG — read extracted.json into a shell variable, pass via -d
EXTRACTED=$(cat extracted.json)
curl -X POST /api/html-to-meno-fragment -d "$EXTRACTED" -o fragment.json
# (Bash hits ARG_MAX on large files anyway; also creates a giant tool-call line.)

# RIGHT — curl reads the file directly; the file never round-trips through
# your context.
curl -s -X POST http://localhost:8080/api/html-to-meno-fragment \
  -H 'content-type: application/json' \
  --data @rendered-websites/acme.com/pages/home/extracted.json \
  -o rendered-websites/acme.com/pages/home/fragment.json
```

### Warning metric

If `extracted.json` for a single page exceeds 500KB, log a warning in the checkpoint and verify you're using `mode: "pixels"`. The `"keep"` mode preserves `var()`/`calc()` expressions and can balloon payload size on Tailwind/Framer sites with deep CSS variable trees. Default is already `pixels`.

```bash
SIZE=$(wc -c < rendered-websites/<host>/pages/home/extracted.json)
[ "$SIZE" -gt 512000 ] && echo "WARN: extracted.json is ${SIZE} bytes — consider pixels mode"
```

### Where this matters most

The **coordinator's STEP 2** is the hottest path — single agent, single page, but the page is the homepage (typically the heaviest). Stick to the three rules religiously here.

Sub-agents (`site-importer-cms-group`, `site-importer-page`) have it easier — fan-out gives each its own fresh context window. But the rules still apply per agent. A `site-importer-page` processing 5 pages with `cat`-and-capture would still blow its context just as fast.

## Parallelism rule (read before starting)

This playbook reads as a numbered sequence for legibility, but **most steps within a "phase" are independent and you SHOULD batch them as parallel tool calls** in the same response. Specifically:

- STEP 1 (sitemap) and STEP 2a/2b/2c are independent — fire all four together.
- STEP 2a (`/extract`), STEP 2b (`/probe-interactions`), STEP 2c (`/api/import-website`) are three independent network calls on the homepage URL → one batch.
- STEP 2d's two calls (analyze-page + extract-page-content) both depend only on 2a → one batch.
- STEP 2f-i (typography → variables), 2f-ii (colors), 2f-iii (UI primitives detection) all read analysis.json and write independent files → one batch (or skip the writes by handing 2f-i + 2f-ii to one combined update of variables.json).

If you're hitting Claude Code, that means a single response with multiple Bash tool calls — not three separate "let me run this, now let me run that" exchanges. The wall-clock difference is ~3× for the network-bound portion.

## The loop

```
================================================================================
STEP 0 — SETUP (do not skip; bad URL state is the #1 cause of bogus reruns)
================================================================================

  0a. CANONICALIZE THE URL
      - host = new URL(input).hostname.toLowerCase()
      - DO NOT strip www. — `www.foo.com` and `foo.com` are sometimes different sites
      - DO NOT add/remove trailing slash beyond what the user gave
      - Scratch dir is rendered-websites/<host>/ (exact spelling, no variants)
      - Checkpoint file is .claude/plans/progress/import-<host>-checkpoint.md

  0b. RESUME CHECK (before any HTTP call)
      Check BOTH conditions, in this order:
        1. Read .claude/plans/progress/import-<host>-checkpoint.md if present.
        2. ALSO scan rendered-websites/<host>/ for any pre-existing files.
      File-presence overrides status: if extracted.json exists for a slug,
      treat that slug's /extract as DONE regardless of checkpoint status.
      This handles halted-mid-run cases where files exist but status="setup".

  0c. START SIDECAR (in parallel with 0b)
      - POST /api/playwright-server {action:"start"}
      - GET sidecar /health → confirm

  0d. LOAD ONLY THE PLAYBOOK (lazy-load other docs as needed)
      You're reading this file now. Don't preload components.md / cms-schema.md /
      website-convert.md / core.md yet — they're not needed for STEP 2.
      Load them when entering the step that uses them:
        - components.md → before 2f-iv (Layout/Header/Footer construction)
        - cms-schema.md → at start of STEP 3
        - website-convert.md → at start of 2f-v (section componentization)
        - core.md → at start of 2f-v (page/node shape reference)

================================================================================
STEP 1 — SITEMAP DISCOVERY (parallelizable with STEP 2a)
================================================================================

  >>> Fire 1a IN PARALLEL with the STEP 2a batch. The homepage doesn't need
  >>> sitemap data; classification happens later. Don't block STEP 2 on this.

  1a. POST /api/fetch-sitemap { url }
      Save full result to rendered-websites/<host>/sitemap.json
  1b. CLASSIFY (once 1a returns):
        - TEMPLATE_GROUP if grouped by sitemap AND instances ≥ 3
          (e.g. /blog/*, /speaker/*, /products/*) → CMS collection
        - UNIQUE_PAGE otherwise → standalone Meno page
        - Homepage is always UNIQUE_PAGE, processed FIRST in STEP 2

================================================================================
STEP 2 — HOMEPAGE DEEP PASS (THE pass — fire batches whenever possible)
================================================================================

  >>> If anything below fails, halt the loop. A failed homepage = failed run.

  ──── BATCH A (fire 1a, 2a, 2b, 2c as one tool-call batch) ────
  1a.  POST /api/fetch-sitemap   ← started in STEP 1, runs in parallel
  2a.  POST sidecar /extract { url: <homepage>, mode: "pixels" }
       → save to rendered-websites/<host>/pages/home/extracted.json
       (Default 20s+10s timeout. Bump on retry only.)
  2b.  POST sidecar /probe-interactions {
         url: <homepage>,
         maxHovers: 8, maxClicks: 4   ← v0 defaults; scoped to header/nav
       }
       → save to rendered-websites/<host>/pages/home/interactions.json
  2c.  POST /api/import-website { url: <homepage> }
       (single-URL asset download — does NOT sub-crawl)

  ──── BATCH B (after BATCH A returns) ────
  2d.  POST /api/analyze-page + POST /api/extract-page-content in parallel
       → analysis.json (sections[], typography, colors, cssVariables, fonts)
       → content-extraction.json (semantic content map)

  ──── SINGLE CALL ────
  2e.  POST /api/html-to-meno-fragment { html: <from 2a>, cssVariables, sourceEngine }
       → flat Meno node tree. integrateExtractedConfig() merged variables +
       colors into project state. Save the tree to rendered-websites/<host>/pages/home/fragment.json
       for re-use during section factoring.

  ──── PROGRESSIVE SHELL SAVE — DO THIS IMMEDIATELY ────
  2e+. POST /api/save-page {
         path: "pages/index.json",
         data: {
           root: {
             type: "component", component: "Layout",   ← Layout may not exist yet
             children: [ <raw node tree from 2e> ]     ← entire homepage as one block
           }
         }
       }
       If Layout.json doesn't exist yet, use a passthrough:
         root: { type: "node", tag: "div", children: [<raw tree>] }
       The user can preview the homepage NOW. Subsequent factoring replaces
       the inline block with component instances — every factor is a small,
       reviewable diff. STOPPING HERE is acceptable. Continuing makes it tidier.

  ──── BATCH C (sub-passes 2f-i / 2f-ii / 2f-iii all read analysis.json) ────
  2f-i.  TYPOGRAPHY → variables.json (NOT a component)
         Walk analysis.json.typography. For each distinct text style, register a
         variable: `--font-heading-xl`, `--line-height-tight`, etc. Write to
         <project-root>/variables.json (preserve existing keys). NEVER create
         a Heading component.

  2f-ii. COLORS → colors.json
         integrateExtractedConfig() already merged these via 2e. Verify and
         add any missing brand-named tokens (`--brand-primary`, `--surface-1`).

  2f-iii. UI PRIMITIVES detection — only if the site has a real system
         Detect ≥3 elements that share a visual recipe (background-color +
         border-radius + padding + height) AND vary only by label/href. If
         found: build Button.json with {variant?, label, href} + interactiveStyles.hover.
         If site has 4 differently-styled buttons → SKIP entirely.

  ──── SERIAL — these mutate the homepage's saved tree ────
  2f-iv. SHARED CHROME → Layout component
         Build Header.json (no props), Footer.json (no props), Layout.json:
           structure: [
             { type: "component", component: "Header" },
             { type: "slot" },
             { type: "component", component: "Footer" }
           ]
         Only ONE slot per component — that's the page body. Apply
         interactions.json hover diffs to Header's nav links here.

  2f-v.  PER-PAGE SECTION COMPONENTS (zero props, organizational)
         For each entry in analysis.json.sections[] that is NOT header/footer:
           - Name = "Home" + PascalCase(<section-purpose>)
           - section-purpose source order: aria-label → dominant heading first
             1-2 words → class hint ("hero"/"features"/"pricing"/"cta")
           - Examples: HomeHero, HomeFeatures, HomePricing, HomeTestimonials,
             HomeFAQ, HomeCTA
           - ZERO props — copy/imagery is baked in
           - Take the slice of the saved fragment.json node tree matching that
             section's bounding box
         Collect ALL section components into one array, then save them in a
         SINGLE batched call:
           POST /api/save-components {
             components: [
               { name: "HomeHero",         data: {...}, category: "imported" },
               { name: "HomeFeatures",     data: {...}, category: "imported" },
               { name: "HomePricing",      data: {...}, category: "imported" },
               ...
             ]
           }
         One round-trip, one HMR debounce window, instead of N save-component calls.

  2f-vi. CARDS — within sections, detect ≥2 repeating children → factor a card
         component (e.g. FeatureCard, BlogCard). If the card pattern matches a
         TEMPLATE_GROUP from 1b, name it singular (SpeakerCard for /speaker/*).
         That same component will be reused in STEP 3 as the CMS template render.

  ──── FINAL PAGE WRITE ────
  2g.  REWRITE pages/index.json into the FINAL thin shell:
         { root: { type: "component", component: "Layout", children: [
             { type: "component", component: "HomeHero" },
             { type: "component", component: "HomeFeatures" },
             { type: "component", component: "HomePricing" },
             ...
         ] } }
       POST /api/save-page. The user's preview now shows the same content but
       structured as a Meno-native page they can edit per section.

  2h.  CHECKPOINT (status="homepage-done", componentsCreated=[…], variables=[…],
       cmsSchemaCandidates=[…template names spotted in 2f-vi…]).

  >>> Halt-safety guarantee: by this point the project has a complete component
  >>> library + working homepage + design tokens. Any halt from here on still
  >>> leaves the user with a usable result.

================================================================================
STEP 3 — CMS TEMPLATE GROUPS (per group with ≥3 instances)
================================================================================

  Load cms-schema.md before starting if you haven't.

  For each TEMPLATE_GROUP from 1b:

  3a. CRAWL TWO SAMPLES (parallel batch)
      - Pick 2 instances from the group.
      - Fire POST sidecar /extract + /api/extract-page-content for both
        instances IN ONE BATCH (4 tool calls in parallel).
      - DIFF the two content extractions: every field that differs across the
        two samples is a CMS field. Identical fields stay as card STRUCTURE.

  3b. BUILD CARD COMPONENT (if not already created in 2f-vi)
      - May already exist if homepage showed e.g. 3 BlogCards in a "Latest articles"
        section. Augment: ensure every diff-field from 3a is a prop.
      - Otherwise create now.

  3c. CREATE CMS COLLECTION
      POST /api/cms/collections {
        id: <slug-singular>,
        name: <human-readable>,
        slugField: "slug",
        urlPattern: <template pattern from sitemap, e.g. "/speaker/{{slug}}">,
        fields: <derived from 3a diff>,
      }

  3d. BULK DATA EXTRACTION (the big efficiency win)
      For every remaining instance (not the 2 samples):
      - POST /api/extract-page-content { url: <instance> } ONLY
      - DO NOT call /api/html-to-meno-fragment for these — they're DATA, not pages
      - DO NOT call /api/import-page for these — images come from the homepage's
        asset download or are CMS-item-specific (which CMSService handles)
      - DO NOT call sidecar /probe-interactions — interactions are on the card
      - Map content to CMS fields → POST /api/cms/<id> { …fields, slug }
      - You can batch these as parallel POSTs (10-20 at a time is safe)

  3e. WRITE TEMPLATE PAGE
      templates/<collection-id>.json renders the card via a `list` node:
        root: { type: "component", component: "Layout", children: [
          { type: "list", sourceType: "collection", source: <id>,
            itemAs: "item", children: [
              { type: "component", component: "<CardName>",
                props: { …mapping each prop to {{item.field}}… } }
            ] }
        ] }

  3f. CHECKPOINT after each group (status="cms-<id>-done", itemsCount=N).

================================================================================
STEP 4 — REMAINING UNIQUE PAGES (one at a time, with budget + checkpoint)
================================================================================

  Load website-convert.md and core.md before starting if you haven't.

  Process every UNIQUE_PAGE except the homepage. Shorter pages first.

  For each page, fire batches similarly to STEP 2:

  ──── BATCH (fire 4a + 4b in parallel) ────
  4a. sidecar /extract { url } (default 20s+10s timeout)
      On timeout: checkpoint as "skipped: timeout"; if 3 in a row, halt.
  4b. /api/import-page (page-specific assets only — skip if this is a near-
      duplicate of an already-imported page with the same template hash).

  ──── SINGLE ────
  4c. /api/analyze-page → analysis.json with sections[]
  4d. /api/html-to-meno-fragment

  ──── PROGRESSIVE SHELL ────
  4d+. SAVE pages/<slug>.json with raw fragment wrapped in Layout immediately.

  ──── SECTION COMPONENTS ────
  4e. Carve into <SlugPascal><SectionPurposePascal> components via
      analysis.json.sections[]:
        AboutHero, AboutTeam, AboutTimeline, PricingTable, PricingFAQ, …
      NEVER name them Hero01/Hero02 — siblings are independent components.
      Batch all section saves into one POST /api/save-components call.

  4f. REWRITE pages/<slug>.json as a thin shell over Layout + section components.
      POST /api/save-page.

  4g. CHECKPOINT immediately (per-page, not every 3).

  4h. DO NOT run /probe-interactions on these pages by default. Only run it
      if analysis.json.sections[] surfaces a NEW interactive pattern unique
      to this page (e.g. a contact form on /contact when the homepage had none).

================================================================================
STEP 5 — VERIFY (sample-based; do not iterate the whole site)
================================================================================

  5a. Screenshot homepage: original vs http://localhost:8080/ (parallel batch)
  5b. Screenshot one CMS template instance (same parallel batch)
  5c. Screenshot one representative unique page (e.g. /about)

  Eyeball hero region of each. Drift → queue a TodoWrite follow-up; don't block.

================================================================================
STEP 6 — REPORT
================================================================================

  Print:
    ✅ Homepage:   pages/index.json (Layout + <N> sections)
    ✅ Components: <N> total (Layout, Header, Footer, <UI primitives>, <cards>, <per-page sections>)
    ✅ CMS:        <N> collections (<I> items total)
    ✅ Pages:      <P> saved, <S> skipped
    ✅ Variables:  <V> registered
    ⚠ Follow-ups: <see checkpoint>
    🌐 Preview:    http://localhost:8080
```

## Checkpoint format

Write after **every** save (page, component batch, CMS collection done). The file is tiny; per-page granularity is the safety.

`.claude/plans/progress/import-<host>-checkpoint.md`:

```markdown
# Import checkpoint: <host>
Updated: <ISO timestamp>
Status: <setup|homepage-extract|homepage-shell-saved|homepage-done|cms-pass|pages-pass|verify|done>

## Sitemap
- Total pages: N
- Unique pages: U
- Template groups: M ([speaker:130, blog:7, …])

## Library (built by homepage deep pass)
- Layout: yes
- Header / Footer: yes
- UI primitives: [Button] or "none — no system detected"
- Variables registered: [--font-heading-xl, --line-height-tight, …]

## Pages
- Saved: [home, about, pricing, contact]
- Skipped: [team: "timeout", legal: "auth required"]

## CMS
- speaker: done (130 items, SpeakerCard)
- blog: in-progress (samples extracted, waiting for bulk)

## Follow-ups (do not block)
- [ ] hero region drift on /about
- [ ] Button hover state mismatch on /pricing CTA
```

## Hard rules (read every time, don't skip)

- **Fire parallel batches.** Independent tool calls go in ONE response, not three. STEP 1 + 2a/b/c, STEP 2d, STEP 2f-i/ii/iii, STEP 3a all batchable.
- **Save the progressive shell immediately after 2e.** Don't wait for 2g. User must see a working homepage in ~30s.
- **Use `/api/save-components`** (batched) for section components, not N× `/api/save-component`. One HMR cycle.
- **Homepage is sacred.** STEP 2 fails → halt the whole loop.
- **One canonical scratch dir.** `rendered-websites/<lowercased-hostname>/` — never variants.
- **Per-page checkpoint, every save.** Not every 3 pages.
- **20s DCL + 10s settle.** Tight default. Bump only on retry.
- **8 hovers / 4 clicks for v0 probe.** Deep probe is a follow-up, not a default.
- **CMS instances are data, not pages.** Two samples for diff, then `/api/extract-page-content` only.
- **/probe-interactions only on representatives.** Homepage + 1 per CMS group + new-pattern pages.
- **File-presence resume.** Check rendered-websites/<host>/ for pre-existing scratch files, not just checkpoint status.
- **Lazy-load docs.** Only this playbook + agent file at start. Load others when entering their step.
- **Section componentization is analysis.json.sections[]-driven.** Use bounding boxes + suggested names as the carving guide.
- **Per-page sections always factored.** `HomeHero`, `AboutTeam`, `PricingFAQ`. ZERO props. NEVER `Hero01`/`Hero02`.
- **Typography is a variable, not a component.**
- **UI primitives only when the site has a system.**
- **Always write via API routes.** They validate, slug-normalize, and trigger HMR.
- **`category: "imported"`** on every component you create.

## Failure recovery

| Symptom | Action |
|---|---|
| STEP 2 (homepage) fails | Halt. Never proceed to 3 or 4 |
| Sidecar won't start | Retry once, then halt |
| `/extract` returns 422 (Cloudflare etc.) | Halt — wrong site for autonomous import |
| `/extract` times out at default 30s | Retry once with `dclTimeoutMs:40000, settleTimeoutMs:20000`. Second timeout → skip |
| `/api/save-page` 4xx | Re-read error; fix payload; retry once |
| `/api/import-page` timeout | Skip asset download; mark follow-up; continue |
| `/probe-interactions` empty | Acceptable; don't retry |
| 3 step-4 timeouts in a row | Halt — likely sitewide issue |
| Disk full | Halt, report path, exit |

## Where things live on disk

```
<project-root>/
├── pages/<slug>.json              ← thin shell wrapping Layout (final state)
├── components/
│   ├── Layout.json                ← single slot, Header+Footer baked in
│   ├── Header.json                ← no props
│   ├── Footer.json                ← no props
│   ├── Button.json                ← (if site has primitive system)
│   ├── SpeakerCard.json           ← (if /speaker/* is a CMS template)
│   ├── HomeHero.json              ← per-page section, zero props
│   ├── HomeFeatures.json
│   ├── AboutHero.json
│   └── …
├── templates/<collection>.json    ← one per CMS collection
├── cms/<collection>/<item>.json   ← one per CMS item
├── variables.json                 ← typography + layout tokens
├── colors.json                    ← brand colors
├── images/ / fonts/               ← uploaded assets
└── rendered-websites/<host>/      ← scratch space; not user-visible
    ├── sitemap.json
    ├── pages/<slug>/
    │   ├── extracted.json         ← sidecar /extract output
    │   ├── fragment.json          ← /api/html-to-meno-fragment output (for re-slicing)
    │   ├── interactions.json
    │   ├── analysis.json
    │   └── content-extraction.json
    ├── meta.json
    └── *.css / fonts/ / images/ / js/
```

## Stop conditions

Loop stops when **either**:

1. Every UNIQUE_PAGE is either saved or marked "skipped: …" in the checkpoint, AND every TEMPLATE_GROUP with ≥3 instances has a CMS collection.
2. A `halt` condition fired (homepage failed, sidecar dead, 3 consecutive timeouts).

Print the STEP 6 report and exit.
