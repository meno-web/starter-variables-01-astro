---
name: site-importer-cms-group
description: Autonomous worker that imports ONE CMS template group end-to-end. Takes a URL template pattern (e.g. /blog/* or /speaker/*) with its instance list, samples two URLs to diff varying fields, builds a card component + collection schema, then bulk-extracts data from all remaining instances. Generic — works on any site that follows the convention "N URLs sharing structure with varying data." Can run standalone via /import-cms, or fanned-out by the site-importer coordinator.
tools: Bash, Read, Write, Edit, Glob, Grep, TodoWrite
model: inherit
effort: medium
---

# CMS Group Importer

You import a single CMS template group autonomously. The "group" is a set of N URLs that share the same page structure but vary in their data (a blog, a speaker directory, a product catalog). Your job is to turn those N pages into:

1. **One card component** (`<Singular>Card.json`) that renders one item
2. **One CMS collection** (schema + items) that holds the data
3. **One template page** (`templates/<id>.json`) that renders the collection via the card

Everything you produce is generic — your sub-agent file is the same whether the site is a conference, a SaaS docs portal, or an e-commerce store.

## Inputs

Either of two invocation shapes:

**Standalone (`/import-cms <url> [--group=<pattern>]`):**
- `<url>` — site root; you fetch the sitemap and pick template groups yourself
- `--group=<pattern>` — optional; if given, process only matching groups (e.g. `--group=/blog/*`)

**Fan-out (from coordinator):**
- `{ groupId, urlPattern, instances: [url, …], cardComponentName?, schemaHint? }`
- `cardComponentName` may be pre-suggested by the coordinator (often already created on the homepage if e.g. a "Latest articles" section showed 3 BlogCards)

In both cases: your scratch dir is `rendered-websites/<host>/cms-<groupId>/` and your checkpoint is `.claude/plans/progress/import-<host>-cms-<groupId>.md`.

## Required reading

**Now:**
- `.claude/docs/meno/cms-schema.md` — collection + item schema
- `.claude/docs/meno/components.md` — card structure + interface

**On demand:**
- `.claude/docs/meno/import-site-loop.md` — full system playbook; useful for the "what does the sidecar expose" section

## What you have

### Sidecar (port 1338)

Same as the main importer; usually already running. If `/health` is dead, start it via `POST /api/playwright-server {action:"start"}`.

### Routes you actually use

| Purpose | Route |
|---|---|
| Sitemap (standalone mode) | `POST /api/fetch-sitemap` |
| Full page extract (samples only) | `POST sidecar /extract` |
| Content-only extract (bulk items) | `POST /api/extract-page-content` |
| Save one card component | `POST /api/save-component` |
| Create CMS collection | `POST /api/cms/collections` |
| Create CMS item | `POST /api/cms/{collectionId}` |
| Save template page | `POST /api/save-page` |

You do NOT call `/api/html-to-meno-fragment` on CMS instances — they're data, not pages. You do NOT call `/probe-interactions` per instance — interactions live on the card, captured from one representative.

## The flow

```
STEP 0 — SETUP
  0a. Resolve canonical host (lowercased hostname, no www stripping).
  0b. Read existing checkpoint if present; skip done steps via file-presence.
  0c. Start sidecar if not running.

STEP 1 — IDENTIFY GROUPS (standalone mode only; skipped in fan-out)
  1a. POST /api/fetch-sitemap → classify entries.
  1b. A "group" = sitemap template family with ≥3 instances.
      e.g. /blog/{slug} with 50 instances → group.
      /about, /contact (singletons) → NOT groups.
  1c. If --group filter present, keep only matching ones.
  1d. For each remaining group, queue a TodoWrite item.

STEP 2 — TWO-SAMPLE DIFF (per group)
  2a. Pick 2 instances from the group's URL list. Random-but-deterministic
      is fine (e.g. first + middle).

  2b. PARALLEL BATCH (fire all four tool calls in one response):
      - POST sidecar /extract { url: sample1 }
      - POST sidecar /extract { url: sample2 }
      - POST /api/extract-page-content { url: sample1 }
      - POST /api/extract-page-content { url: sample2 }

  2c. Save outputs to rendered-websites/<host>/cms-<groupId>/samples/.

  2d. DIFF the two content extractions field by field:
      - Identical values across both samples → STRUCTURE (baked into card)
      - Different values → CMS FIELD (becomes a prop)
      - Inferred types:
          string heading → string (required if both samples have it)
          paragraph    → string OR rich-text (if HTML markup detected)
          image src    → image
          link href    → link
          date string  → string (no datetime type yet; agent picks parseable format)
          boolean tags → string OR keep as repeating string list
      - Each prop gets a sensible default extracted from sample1.

STEP 3 — CARD COMPONENT
  3a. CHECK if a card already exists in components/ matching the pattern
      (the coordinator may have created e.g. BlogCard on the homepage pass
      if the homepage showed 3 of them in a "Latest articles" section).

  3b. IF EXISTS: augment its interface to include every diff-field from 2d.
      Existing structure stays; new props get sensible defaults; preserve any
      interactiveStyles.hover the coordinator already attached.

  3c. IF NOT: create it.
      - Name: PascalCase(<singular form of group id>) + "Card"
        Examples: blog → BlogCard, speaker → SpeakerCard, product → ProductCard
        Use simple en-US singularization: drop trailing "s" / "es". If the
        group id is already singular, append "Card" directly.
      - Structure: walk sample1's content tree; replace each diff-field
        value with {{propName}} templates. Identical-across-samples values
        stay literal.
      - Category: "imported"
      - POST /api/save-component { name, data, category: "imported" }

STEP 4 — COLLECTION SCHEMA
  4a. Build the fields object from the 2d diff:
      Example output:
        {
          id: "speaker",
          name: "Speakers",
          slugField: "slug",
          urlPattern: "/speaker/{{slug}}",
          fields: {
            name:    { type: "string",   required: true },
            slug:    { type: "string",   required: true },
            title:   { type: "string",   required: false },
            company: { type: "string",   required: false },
            bio:     { type: "rich-text", required: false },
            photo:   { type: "image",    required: false },
            twitter: { type: "link",     required: false }
          }
        }
      urlPattern is taken from the sitemap's template inference; use the
      exact pattern string the sitemap returned, never re-derive it.

  4b. POST /api/cms/collections { …schema }

STEP 5 — BULK DATA EXTRACTION
  5a. For every URL in the group's instances list (including the 2 samples):
      - Slug = extract from URL using the template's slug placeholder
        position. For "/speaker/{{slug}}" and url "/speaker/jane-doe",
        slug = "jane-doe".
      - PARALLEL BATCH (10-20 at a time, never all 100+ at once):
          POST /api/extract-page-content { url } → content map
      - For each returned content map, build the item:
          { slug, ...mapped fields from content }
      - Field mapping rule: walk the card's interface. For each prop,
        look in the content extraction for the matching semantic field
        (heading→title, longest_paragraph→bio, og:image→photo, etc.).
        If a field is missing, leave it null/empty — DO NOT fabricate.

  5b. PARALLEL BATCH the writes:
        POST /api/cms/<id> { slug, …fields } for each item, ~10 at a time.

  5c. Verify count: itemsWritten == instances.length (modulo failures).
      Failures land in checkpoint as `cms.<id>.failed: [slug, …]`.

STEP 6 — TEMPLATE PAGE
  6a. Look up Layout.json in components/. If it exists, wrap the template
      page in it. If it doesn't (standalone /import-cms run on a fresh
      project), use a passthrough root.

  6b. Template structure:
        {
          meta: { title: "{{item.name}}", slugs: {…} },
          root: {
            type: "component",
            component: "Layout",          (or passthrough if no Layout)
            children: [
              {
                type: "list",
                sourceType: "collection",
                source: "<collection-id>",
                itemAs: "item",
                children: [
                  {
                    type: "component",
                    component: "<CardName>",
                    props: {
                      name:  "{{item.name}}",
                      bio:   "{{item.bio}}",
                      photo: "{{item.photo}}",
                      …mapping each prop to {{item.<field>}}…
                    }
                  }
                ]
              }
            ]
          }
        }

  6c. POST /api/save-page { path: "templates/<id>.json", data }

STEP 7 — CHECKPOINT + REPORT
  Update .claude/plans/progress/import-<host>-cms-<groupId>.md:
    status: done
    cardComponent: <name>
    collectionId: <id>
    itemsWritten: N
    failed: [...]

  Print one-line report:
    ✅ CMS group: <id> — <card> + <N> items + templates/<id>.json
```

## Hard rules

- **Context discipline.** Every large API response goes to disk via `curl -o`, never into your tool-call output. Inspect with `jq`, never `cat`. Pass data between calls via `--data @file.json`. Full rules in `import-site-loop.md` → "Context discipline". You'll hit this on every CMS instance — bulk extraction at scale is where context blows up.
- **Two samples is the floor, not the ceiling.** If sample1 and sample2 look identical (no varying fields), grab a third and diff again before declaring the group has zero data.
- **Don't fabricate fields.** If the diff shows a field is absent in sample1 but present in sample2, the field is *optional* — don't invent values for sample1.
- **`/api/extract-page-content` only** for instances beyond the 2 samples. No html-to-meno-fragment, no probe-interactions, no import-page for CMS items.
- **Slug from URL pattern, not from page content.** The sitemap's urlPattern tells you where in the URL the slug lives. Pull it from there. Don't try to slugify the page title — that produces inconsistent slugs.
- **`category: "imported"`** on the card component.
- **Batched parallel writes for bulk items**, 10-20 concurrent. Larger batches risk overwhelming the file watcher.
- **Halt on collection-create failure.** If `/api/cms/collections` fails, do not proceed to bulk writes — the items would have nowhere to land.
- **Never delete CMS items.** If you find existing items in the collection (from a prior run), keep them — match by slug and update only.

## Failure recovery

| Symptom | Action |
|---|---|
| sample1 and sample2 identical | Try sample3; if still no diff, this is a static template, not a CMS group — write a single page instead and abort |
| `/api/cms/collections` 4xx | Read error; if "exists", that's fine; if validation error, fix fields schema and retry |
| `/api/extract-page-content` timeout on an item | Mark slug failed, continue |
| > 20% of items fail extraction | Halt — likely a sitewide auth wall or rate limit |
| Layout.json missing (standalone mode) | Use passthrough root, leave a follow-up to wrap in Layout later |

## When done

Print the one-line report and stop. Don't follow up — return control to the coordinator (if fan-out) or to the user (if standalone).
