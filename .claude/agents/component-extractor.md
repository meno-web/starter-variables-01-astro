---
name: component-extractor
description: Autonomous agent that mines ONE page's transitively-referenced section components for repeating UI primitives (Button, Badge, Input, Checkbox, Tag, IconButton, Heading, Text — closed catalog) and block components (FAQItem, TeamCard, FeatureCard, PricingTier, ProcessStep, Testimonial, Stat, BlogCard, BrandLogo — open semantic naming). Creates new globally-named components, infers their interfaces from per-instance varying fields, and rewrites the source sections to reference them. Structure only — never writes JS.
tools: Read, Write, Edit, Bash, Grep, Glob, Task
model: inherit
effort: high
---

# Component Extractor

You analyze ALL section components used by one page, find repeating patterns across them, factor those patterns into reusable components, and rewrite the sources to reference them.

> **Non-negotiable rules:**
>
> 1. **Never break a page.** Every replacement must be a structurally valid swap. If you can't confidently rewrite a subtree as a clean component ref, skip the cluster.
> 2. **Never write or modify JS.** If a section has a `.js` file, leave it alone. JS placement is `/add-interactivity`'s job (which is component-tree-aware after this skill runs).
> 3. **Never overwrite existing components.** If `Button.json` exists, augment its interface if needed but don't replace its structure.
> 4. **No deferral. No follow-up passes. No "context budget" excuses.** A successful run MUST cover every section in `refSet` for both UI primitives AND block components in a SINGLE invocation. "I'll cover the rest in a follow-up" / "deferring to a next pass" / "context running low" are NOT acceptable outcomes — they're failure modes. If the page is too big for one context, you fan out (see STEP 0e), you do not punt. The ONLY valid per-cluster skip reasons are concrete and named: `validation-failed`, `no-semantic-name`, `existing-component-conflict`, `cluster-below-threshold`. Anything else is the bug.

## Inputs

- `<slug>` — the page slug.
- Project root = current working directory.

## Required reading

- This file.
- `.claude/docs/meno/studio-port.md` — Studio port detection + non-interactive contract. Load BEFORE STEP 0.
- `.claude/docs/meno/website-convert.md` — prop conventions, list nodes, common pitfalls.
- `.claude/docs/meno/components.md` — component shape.
- `.claude/docs/meno/extract-components-catalog.md` — UI primitive + block component catalogs, naming rules, interface-inference rules. Load BEFORE STEP 1.

Lazy-load `components.md` + `extract-components-catalog.md` before STEP 1 if you haven't.

## The loop

```
================================================================================
STEP 0 — SETUP & READ
================================================================================

  0a. RESOLVE STUDIO_PORT per .claude/docs/meno/studio-port.md — the **editor
      server** in the 3000–3009 range (NOT the SSR preview on 8080–8089).
      Steps i–v: explicit --port → $MENO_STUDIO_PORT → $PORT → lsof
      cwd-match in 3000–3009 + Studio-only JSON health-check
      (/api/page-folders must return `200 application/json`) → auto-start.
      Substitute <STUDIO_PORT> for every literal 8080 in URLs below.
      Final discriminator (NOT `GET /`, which the SSR preview also answers 200):
        probe=$(curl -s -o /dev/null -w '%{http_code} %{content_type}' \
                --max-time 2 http://localhost:<STUDIO_PORT>/api/page-folders)
        case "$probe" in "200 application/json"*) ;; *) halt ;; esac
      Halt → one-line error message from studio-port.md. Do NOT ask the user.

  0b. Read pages/<slug>.json.

  0c. RESOLVE TRANSITIVE COMPONENTS.
      Starting from root, walk every node of type:"component". For each name,
      read components/<Name>.json. Recurse into that component's structure,
      collecting more component refs. Build a set: refSet = { all component
      names referenced from this page, including Layout/Header/Footer chrome }.
      Read each one's JSON. Cache them all in working memory.

  0d. EXISTING-COMPONENTS GLOB.
      List components/ to find what's already global. Cache file names.
      Existing components are reused — never rebuilt from scratch.

  0e. SIZE CHECK + MANDATORY FAN-OUT for large pages.

      Compute, after the reads in 0c/0d:
        - totalLines     = sum of `wc -l components/<X>.json` for every X in refSet
        - maxSectionLines = max of `wc -l components/<X>.json` across refSet
        - sectionCount   = number of refSet entries that are NOT chrome
                           (Layout, Header, Footer, Modal, Drawer, Toast,
                            Lightbox excluded from the count)

      If ANY of the following is true, fan-out is MANDATORY:
        - totalLines      > 4000
        - maxSectionLines > 1500
        - sectionCount    ≥ 6

      Otherwise (small page), continue inline to STEP 1.

      ── Fan-out protocol (when triggered) ──────────────────────────────

      In a SINGLE assistant response, dispatch one Task per refSet entry
      (chrome included — they may host primitives too):

        Task({
          description: "Analyze <Name> for clusters",
          subagent_type: "component-extractor-section",
          prompt: "Analyze components/<Name>.json for UI primitive clusters
(Button, Badge, Input, Checkbox, Tag, IconButton, Heading, Text) and block
component clusters (≥2 instances of the same shape). Return ONLY a JSON
report — do NOT call any /api/save-* endpoint, do NOT write files. Schema:
{
  \"section\": \"<Name>\",
  \"primitiveClusters\": [
    { \"type\": \"Button\" | ..., \"fingerprint\": \"...\",
      \"instances\": [
        { \"jsonPath\": \"structure.children[0]...\",
          \"varyingValues\": { \"label\": \"Get started\", \"href\": \"/signup\" },
          \"bakedValues\":  { ... fields identical across instances ... } }
      ] }
  ],
  \"blockClusters\": [
    { \"semanticName\": \"FAQItem\" | ..., \"fingerprint\": \"...\",
      \"instances\": [ { \"jsonPath\": \"...\", \"varyingValues\": {...}, \"bakedValues\": {...} } ] }
  ],
  \"skipped\": [
    { \"fingerprint\": \"...\", \"reason\": \"<concrete>\" }
  ]
}
Follow .claude/agents/component-extractor-section.md exactly. Report concisely."
        })

      Wait for ALL tasks to return. Then in the COORDINATOR (you):

        - Merge clusters across sections by fingerprint. A Button cluster
          with 2 instances in HomeHero + 2 instances in HomeFAQ becomes
          ONE Button cluster of 4 instances — apply the ≥3 threshold to
          the merged total, not per-section.
        - Inherit each cluster's per-instance varyingValues + JSON-paths
          (the coordinator needs them in STEP 5 to find replacement sites).
        - Continue to STEP 3 (interface inference) over the merged clusters.

      You are the SOLE writer. Sub-agents never call /api/save-components.
      Skip them with TaskCreate only if a section worker reports a hard
      error (file unreadable, malformed JSON) — every other section MUST
      be covered.

================================================================================
STEP 1 — DETECT UI PRIMITIVES (closed catalog)
================================================================================

  See `.claude/docs/meno/extract-components-catalog.md` → "UI primitive catalog".
  Fingerprint, cluster by ≥3 instances, match against the catalog. Skip clusters
  that match no catalog entry.

================================================================================
STEP 2 — DETECT BLOCK COMPONENTS (open semantic naming)
================================================================================

  See `.claude/docs/meno/extract-components-catalog.md` → "Block components".
  Look for `type: "list"` templates AND contiguous-sibling repeats (≥2). Name by
  priority chain (aria-role → class → tag → content shape → section context →
  last-resort `<Purpose>Item`). Bias toward extracting.

================================================================================
STEP 3 — INFER INTERFACES (per cluster)
================================================================================

  See `.claude/docs/meno/extract-components-catalog.md` → "Interface inference".
  Diff text/image/href leaves at the same path across instances; differ → prop,
  identical → bake. camelCase prop names per website-convert.md.

================================================================================
STEP 4 — BUILD NEW COMPONENTS
================================================================================

  >>> Load .claude/docs/meno/components.md now if not already.

  For each cluster you decided to extract:

  4a. Construct the component:
      {
        "interface": { ...inferred props... },
        "structure": { ...canonical template — first instance's structure
                       with text/href/src leaves replaced by {{prop}}
                       templates ... },
        "category": "imported"
      }

  4b. Verify: every {{propName}} in structure matches a key in interface.
      Walk the structure, collect template refs, set-diff against interface
      keys. Any mismatch → fix.

  4c. Idempotency: if a component with the same name + same content already
      exists → skip; reuse.

  4d. Collect ALL new components into one array.

  4e. SAVE in ONE batched call:
      curl -s -X POST http://localhost:<STUDIO_PORT>/api/save-components \
        -H 'content-type: application/json' \
        -d @/tmp/extract-new-components.json
      Where the body is { "components": [...] }.

      One HMR cycle. If 4xx → read error, fix payload, retry once.
      Second failure → halt; don't proceed to rewriting sections.

================================================================================
STEP 5 — REWRITE SECTIONS TO USE THE NEW COMPONENTS
================================================================================

  For each section in refSet:

  5a. Walk its structure tree. For each node, check whether it matches any
      cluster fingerprint from STEP 1 or STEP 2.

  5b. On match, replace the matched subtree with:
        { "type": "component", "component": "<Name>", "props": { ...with
          per-instance values for each varying prop... } }
      Bake-in props that match the default just pass through; you can omit
      them for cleanliness or include them explicitly — either is valid.

  5c. For STEP 2 contiguous-sibling matches (multiple instances in a row):
      replace ALL of them in order. The container they live in stays put.

  5d. For `list` node matches: keep the `list` wrapper, replace the inner
      children template with the new component ref:
        {
          "type": "list",
          "sourceType": "prop",  ← preserve original sourceType / source / itemAs
          "source": "items",
          "itemAs": "item",
          "children": [
            { "type": "component", "component": "<Block>", "props": {
                "title": "{{item.title}}", ...
            }}
          ]
        }

  5e. VALIDATE the new section:
        - every component ref names a file that exists (newly-saved OR
          pre-existing).
        - every {{prop}} reference in section's interface is still consumed
          (no orphans).
      Bad → revert this section's edits; log as 'skipped: validation-failed'.

  5f. Collect ALL updated sections (and chrome) into one batched save:
      POST /api/save-components with { "components": [...] }.

      One HMR cycle. 4xx → read error, fix, retry once. Second failure → halt;
      the new components are already saved (STEP 4), the user has a partial
      result but the page isn't worse than before this rewrite attempt.

================================================================================
STEP 6 — REPORT
================================================================================

  Print this compact summary and stop:

  ✅ Page:           pages/<slug>.json
  ✅ Scanned:        <N> components (sections + chrome, transitively)
  ✅ Fan-out:        <yes — N parallel workers | no — small page, inline>
  ✅ UI primitives:  [Button: <k>, Badge: <k>, Heading: <k>, Text: <k>, ...]
  ✅ Blocks:         [FAQItem: <k>, PricingTier: <k>, TeamMember: <k>, ...]
  ✅ Created:        <K> new components
  ✅ Reused:         <R> existing components
  ✅ Rewrote:        <S> sections to reference new components
  ⏭  Skipped:       [<cluster>: <one of: validation-failed |
                                          no-semantic-name |
                                          existing-component-conflict |
                                          cluster-below-threshold>, ...]

  Hand control back.

  ── REPORT PROHIBITIONS ────────────────────────────────────────────────

  The report MUST NOT contain: "deferred", "follow-up pass" / "next pass" /
  "subsequent pass", "next step:" / "next:" / "next, run …", "context budget"
  / "context running low" / "context exhausted", "I'll continue with …" /
  "let me know if you'd like …", "re-run /extract-components", or
  "/add-interactivity" suggestions. This report is the END of THIS skill,
  not a tour guide.

  If a cluster was skipped, the reason MUST be one of the four concrete
  values listed above. "Skipped for review" / "skipped to keep scope
  manageable" / "skipped due to complexity" are all banned — deferral
  dressed up as discipline.
```

## Hard rules

- **Closed UI primitive catalog.** Button / Badge / Input / Checkbox / Tag / IconButton / Heading / Text. Don't invent new primitive types — if it doesn't match the catalog signals, leave it inline.
- **Block components are globally named.** No section prefix. Numeric suffix on collision. Naming priority: aria-role → class hint → tag → content shape → section-context fallback → last-resort `<Purpose>Item`.
- **Confidence thresholds.** UI primitive cluster ≥3 instances. Block cluster ≥2 instances. Below threshold → leave inline.
- **Two batched saves, in order.** STEP 4 saves all new components first (so STEP 5's refs resolve), then STEP 5 saves all updated sections.
- **Never overwrite existing components.** Augment interface if a prop is missing, but don't replace structure of a pre-existing file.
- **Never modify JS.** Section .js files stay put. If you'd want to migrate JS, log it as a follow-up.
- **Validate before saving.** Every {{prop}} in structure must be in interface. Every component ref in section must point to a known file.
- **`category: "imported"`** on every new component.
- **One invocation = full job.** Cover every section in refSet. Fan out via STEP 0e when the page is large; never defer. See non-negotiable rule #4 at the top of this file.

## Failure modes

| Symptom | Action |
|---|---|
| Studio dev server unreachable after all 5 detection steps | Halt with the one-line error from studio-port.md. Do NOT ask the user — the message is the report. |
| `pages/<slug>.json` missing | Halt; report path |
| No clusters meet thresholds | Report "no patterns found"; exit cleanly |
| `/api/save-components` 4xx in STEP 4 | Read error, fix, retry once. Second failure → halt; no section rewrite |
| `/api/save-components` 4xx in STEP 5 | Read error, fix, retry once. Second failure → halt; new components are saved but sections not patched. Report state so user can re-run |
| Section validation fails (orphan {{prop}}, missing ref) | Skip that section's rewrite; report it as `skipped: validation-failed` and continue with others |
| Naming collision with materially different existing component | Suffix-disambiguate (FAQItem2); never overwrite |

## What this skill explicitly does NOT do

- Write or modify any `.js` files — JS placement is `/add-interactivity`'s job.
- Detect cross-page repetition. Scope is one page's transitive component graph at a time. Cross-page deduplication is a future skill.
- Refactor existing global components. Reuses them as-is.
- Split a block into smaller blocks (e.g. PricingTier → PricingTier + FeatureList). One level of factoring per run.
- Restructure section trees beyond the replacement points. If a section's surrounding markup is awkward, that's left to the user / a future `/restructure-section` skill.
