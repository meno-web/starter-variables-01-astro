## MenoFilter

Client-side filtering, sorting, search, and pagination. Two distinct modes — pick the right one before writing any markup:

| Mode | When to use | Data source | Required wiring |
|------|-------------|-------------|-----------------|
| **CMS collection** (the right answer for any CMS-backed list) | Items come from a Meno CMS collection (\`templates/{collection}.json\` exists) | JSON loaded by MenoFilter at runtime — inline \`<script id="meno-cms-{id}">\` (CMS template pages only) or \`/data/{id}/index.json\` (any page) | \`clientData.enabled: true\` + \`strategy: "static"\` on the schema **+** \`emitTemplate: true\` on the list. \`data-id="{{item._id}}"\` on each card is **recommended but optional** (see "Production pattern" below). |
| **DOM-only** (rare) | Items are hand-authored HTML with no backing CMS | Read directly from rendered \`data-{field}\` attributes | Just markup — no schema/build config. Multi-word field names must be **kebab-case** in both the button (\`data-meno-filter-field="featured-only"\`) and the item (\`data-featured-only="true"\`). |

**The most common failure mode is wiring CMS-collection markup but missing one of the schema/list flags** — MenoFilter then has no items and silently does nothing on filter clicks (or sometimes only the count display moves). See **Filtering a CMS collection** below before writing any \`data-meno-filter\` against a CMS source.

### Quick Start (DOM-only)

\`\`\`html
<div data-meno-filter="posts" data-meno-per-page="6">
  <!-- Filter buttons -->
  <button data-meno-clear>All</button>
  <button data-meno-filter-field="category" data-meno-filter-value="tech">Tech</button>

  <!-- List container -->
  <div data-meno-list>
    <div data-id="p1" data-category="tech">...</div>
    <div data-id="p2" data-category="design">...</div>
  </div>

  <!-- Pagination -->
  <button data-meno-page="prev">Prev</button>
  <span data-meno-page-current></span> / <span data-meno-page-total></span>
  <button data-meno-page="next">Next</button>
</div>
\`\`\`

The script auto-initializes on page load. In DOM-only mode items are filtered by matching \`data-{field}\` attributes — \`getAttribute('data-' + field)\` is literal, so multi-word fields must be kebab-case throughout.

### Container Attributes

| Attribute | Description | Example |
|-----------|-------------|---------|
| \`data-meno-filter="collection"\` | Wrapper element, scopes all controls | \`data-meno-filter="posts"\` |
| \`data-meno-list\` | Container for filterable items. **Only one supported per wrapper** — \`querySelector\` returns the first match. | \`<div data-meno-list>\` |
| \`data-meno-per-page="n"\` | Items per page (0 = no pagination) | \`data-meno-per-page="6"\` |
| \`data-meno-filter-match="and|or"\` | Logic between filters (default: and) | \`data-meno-filter-match="or"\` |
| \`data-meno-debounce="ms"\` | Search input debounce (default: 300) | \`data-meno-debounce="500"\` |
| \`data-meno-active-class="class"\` | Active filter button class (default: active) | \`data-meno-active-class="selected"\` |
| \`data-meno-types\` | JSON object mapping fields to types. In a Meno JSON file write the attribute value as a JSON-escaped string — \`"data-meno-types": "{\\"price\\":\\"number\\"}"\`. The SSR renderer escapes the inner quotes to \`&quot;\` automatically, so the rendered HTML is valid and \`JSON.parse\` recovers the object on the client. **Required for non-string fields you intend to filter or range over** (see Type Coercion). | \`data-meno-types='{"price":"number","sunDeck":"boolean"}'\` |
| \`data-meno-url-sync="true"\` | Enable URL query parameter sync | \`data-meno-url-sync="true"\` |

### Type Coercion

Filter button values are HTML attribute strings (\`"true"\`, \`"150"\`); JSON item values may be native booleans/numbers. \`data-meno-types\` tells MenoFilter how to coerce both sides into the same type before comparison. **Without it, \`true === "true"\` is false and your filter silently matches nothing.**

\`\`\`html
<div data-meno-filter="products"
     data-meno-types='{"price":"number","date":"date","stock":"number","featured":"boolean"}'>
\`\`\`

| Type | Coercion | Example Values |
|------|----------|----------------|
| \`string\` | None (default) | \`"hello"\`, \`"123"\` |
| \`number\` | \`parseFloat(value)\` | \`199\`, \`19.99\` |
| \`date\` | \`new Date(value).getTime()\` | \`"2024-01-15"\` |
| \`boolean\` | \`value === 'true' || value === '1'\` | \`true\`, \`"true"\` |

Pure string fields can be omitted from \`data-meno-types\` — they compare directly. Boolean and number fields you filter on must be listed.

### Filter Controls

\`\`\`html
<!-- Button (toggles on click) -->
<button data-meno-filter-field="category" data-meno-filter-value="tech">Tech</button>

<!-- Checkbox (multiple = OR logic) -->
<input type="checkbox" data-meno-filter-field="tags" data-meno-filter-value="featured">

<!-- Select dropdown -->
<select data-meno-filter-field="category">
  <option value="">All</option>
  <option value="tech">Tech</option>
</select>

<!-- Radio buttons -->
<input type="radio" name="status" data-meno-filter-field="status" data-meno-filter-value="published">

<!-- Clear filters -->
<button data-meno-clear>Clear Filters</button>

<!-- Reset all (filters + search + sort + page) -->
<button data-meno-reset>Reset</button>
\`\`\`

### Filter Mode

Control single vs multiple selections:

\`\`\`html
<!-- Single-choice buttons (radio-like, no toggle-off) -->
<div data-meno-filter-mode="single">
  <button data-meno-filter-field="category" data-meno-filter-value="tech">Tech</button>
  <button data-meno-filter-field="category" data-meno-filter-value="design">Design</button>
</div>

<!-- Multi-choice buttons (uses \$in operator) -->
<div data-meno-filter-mode="multi">
  <button data-meno-filter-field="tags" data-meno-filter-value="featured">Featured</button>
  <button data-meno-filter-field="tags" data-meno-filter-value="new">New</button>
</div>
\`\`\`

| Element | Default | mode="single" | mode="multi" |
|---------|---------|---------------|--------------|
| Button | Toggle | Radio-like | Multiple active |
| Checkbox | Multi-select | Unchecks siblings | Multi-select |

### Range Inputs

\`\`\`html
<!-- Number range -->
<input type="number" data-meno-range="price" data-meno-range-bound="min" placeholder="Min">
<input type="number" data-meno-range="price" data-meno-range-bound="max" placeholder="Max">

<!-- Date range -->
<input type="date" data-meno-range="publishDate" data-meno-range-bound="min">
<input type="date" data-meno-range="publishDate" data-meno-range-bound="max">
\`\`\`

The input does not need to be visible — MenoFilter discovers any \`[data-meno-range]\` inside the wrapper, regardless of \`display\`. Useful for custom counter UIs that drive a hidden \`<input type="number">\` via JS (just dispatch \`input\` events after updating \`.value\`). Setting \`.value\` to \`""\` clears the bound. Number range fields must be declared in \`data-meno-types\` for comparisons to coerce correctly.

### Search

\`\`\`html
<input type="text" data-meno-search data-meno-search-fields="title,description">

<!-- With fuzzy matching (typo-tolerant) -->
<input type="text" data-meno-search
       data-meno-search-fuzzy="true"
       data-meno-search-threshold="0.3">
\`\`\`

\`data-meno-search-threshold\` is the minimum trigram similarity (Jaccard, 0–1) needed to consider a row a match. **Higher = stricter** — \`1\` requires a near-exact trigram overlap, \`0\` matches anything. Default is \`0.3\` (lenient — tolerates typos and partial words).

### Sort

Sort works in CMS+JSON+template mode — items render in sorted order on each filter pass.

\`\`\`html
<!-- Button -->
<button data-meno-sort="title" data-meno-sort-order="asc">Sort A-Z</button>

<!-- Select -->
<select data-meno-sort>
  <option value="">Default</option>
  <option value="title:asc">Title A-Z</option>
  <option value="views:desc">Most Viewed</option>
</select>
\`\`\`

Sort field names follow the same camelCase convention as filter field names (object-property lookup against the JSON dataset).

### Pagination

\`\`\`html
<button data-meno-page="prev">Previous</button>
<button data-meno-page="next">Next</button>
<button data-meno-page="first">First</button>
<button data-meno-page="last">Last</button>

<span data-meno-page-current></span> / <span data-meno-page-total></span>

<!-- Auto-generated page buttons -->
<div data-meno-page-buttons></div>

<!-- Per-page selector -->
<select data-meno-per-page-select>
  <option value="6">6</option>
  <option value="12">12</option>
</select>
\`\`\`

### Load More (Alternative to Pagination)

\`\`\`html
<!-- Basic load more button -->
<button data-meno-load-more>Load More</button>

<!-- Custom increment -->
<button data-meno-load-more="6">Load More</button>

<!-- With remaining count -->
<button data-meno-load-more>
  Load More (<span data-meno-remaining></span> remaining)
</button>
\`\`\`

Button auto-hides when all items loaded. Mutually exclusive with pagination.

### Count Displays

\`\`\`html
<span data-meno-count="results"></span>  <!-- Filtered count -->
<span data-meno-count="total"></span>    <!-- Total items -->
<span data-meno-count="visible"></span>  <!-- Visible on current page -->
\`\`\`

### Facets

\`\`\`html
<span data-meno-facet="category:tech">0</span>  <!-- Count of items with category=tech -->
\`\`\`

### Empty State

\`\`\`html
<div data-meno-empty>No results found</div>
\`\`\`

Automatically shown/hidden based on filtered results.

---

## Filtering a CMS collection

For any list driven by \`templates/{collection}.json\`, MenoFilter runs against the JSON dataset (object-property lookup, \`item[field]\`). Three pieces — and the right strategy choice — are required.

### 1. Schema — opt the collection into client data

In \`templates/{collection}.json\`, inside the \`cms\` block:

\`\`\`json
"cms": {
  "id": "charters",
  "name": "Charters",
  "slugField": "slug",
  "urlPattern": "/charters/{{slug}}",
  "clientData": {
    "enabled": true,
    "strategy": "static",
    "fields": ["title", "slug", "location", "priceWeek", "priceTier", "cabins", "bathrooms", "sunDeck"]
  },
  "fields": { ... }
}
\`\`\`

**Strategy choice — read this carefully:**

- **\`"static"\`** — writes \`dist/data/{id}/index.json\` once at build time; MenoFilter \`fetch()\`es it on first init. **This is the only strategy that works on static pages** (anything other than \`templates/{collection}.json\`). Use it whenever the filter wrapper lives in \`pages/*.json\` or in a component that gets reused on static pages.
- **\`"inline"\`** — embeds \`<script type="application/json" id="meno-cms-{id}">\` into the rendered HTML. **Only emitted on CMS template pages** (\`templates/{collection}.json\`). On a \`pages/foo.json\` static page the inline script is never written, MenoFilter falls back to \`fetch('/data/{id}/index.json')\`, that file doesn't exist, and you get a 404 + empty filter results. Use \`inline\` only when a template page is filtering its *own* collection inline.
- **\`"auto"\`** — picks \`inline\` for \`items.length <= threshold\` (default 500), else \`static\`. **Unsafe on static pages**: a small collection (the common case) falls to \`inline\` and silently fails. Always prefer explicit \`"static"\` unless you know the wrapper is on a CMS template page.

**\`fields\`** — allowlist of fields to expose to the client. System fields (\`_id\`, \`_url\`, \`_filename\`, \`_slug\`) are always included. Omit \`fields\` to expose everything. Trim aggressively — every field ships in the data file.

### 2. List — emit the item template

On the \`type: "list"\` node that produces the cards, set \`emitTemplate: true\`:

\`\`\`json
{
  "type": "list",
  "sourceType": "collection",
  "source": "charters",
  "itemAs": "item",
  "emitTemplate": true,
  "children": [ /* the card */ ]
}
\`\`\`

\`emitTemplate\` causes the SSR to write a \`<template data-meno-item>\` next to the rendered cards. The runtime needs that template to render filtered/sorted items each pass. Without it, MenoFilter falls back to DOM-only mode and the JSON dataset is unused.

### 3. \`data-id\` — recommended SSR-reuse optimisation (optional)

When MenoFilter renders the filtered list, it hides every SSR'd child (\`display: none\`), then for each filtered item:

- If \`element.dataset.id\` matches the item's \`_id\`, **the SSR element is reused** — it's revealed and moved into sorted position via \`appendChild\`. Event listeners and any state in the rendered card survive.
- Otherwise, it **renders a fresh element from the \`<template data-meno-item>\`** and appends it. The hidden SSR element stays hidden in the DOM.

Both work. **Pick one and be consistent:**

- **With \`data-id="{{item._id}}"\` on each card** — cheaper (no template re-render), preserves event listeners, lets a card's vanilla JS keep state across filter passes.
- **Without \`data-id\`** — simpler markup. This is the production pattern in adlittle's \`InsightsCardGrid\`. The SSR cards become dead weight visually but remain in the DOM at \`display: none\`.

If the card is a Meno component (recommended for production), \`{{item.X}}\` templates inside the **root \`attributes\` object** of the component's structure don't pick up the parent list's \`itemAs\` scope — forward values via \`props\`:

\`\`\`json
// In the page, inside the list:
{
  "type": "component",
  "component": "CharterCard",
  "props": {
    "id": "{{item._id}}",
    "title": "{{item.title}}",
    "url": "{{item._url}}",
    "priceTier": "{{item.priceTier}}",
    "sunDeck": "{{item.sunDeck ? 'true' : 'false'}}"
  }
}

// In CharterCard.json structure root:
"attributes": {
  "data-id": "{{id}}"
}
\`\`\`

The boolean→string ternary (\`{{item.sunDeck ? 'true' : 'false'}}\`) is needed if you also want the boolean exposed as a \`data-*\` attribute on the card — e.g. for CSS state styling, or as a fallback for DOM-only mode. A \`boolean\` value rendered through an attribute template otherwise follows HTML5 boolean-attribute rules (bare for \`true\`, dropped for \`false\`) and won't compare as the string the filter button sends.

### 4. Field-name convention — camelCase, matching JSON keys exactly

When MenoFilter has a JSON dataset (i.e. CMS-collection mode), it does \`item[field]\` lookup, **not** DOM \`getAttribute\`. Field names in:

- \`data-meno-filter-field\`
- \`data-meno-range\`
- \`data-meno-types\` keys
- \`data-meno-sort\` field names
- \`data-meno-search-fields\`

…all must match the JSON keys exactly. Use the same casing as the CMS schema fields (camelCase: \`priceWeek\`, \`sunDeck\`, \`outdoorDining\`). Kebab-case only matters for the DOM-only fallback.

### 5. Specifics that aren't obvious

- **Array fields (\`tags\`, multi-select, multi-reference) match natively.** \`data-meno-filter-field="tags" data-meno-filter-value="scenic"\` on an item with \`tags: ["scenic", "luxury"]\` matches via \`Array.isArray + includes\`. No special syntax needed.
- **Reference fields stored as filename strings** (e.g. \`"author": "jane-smith"\`) filter as plain strings. MenoFilter does not auto-expand references for filtering — if you need to filter on a referenced item's field, denormalise it onto the item or use the array-of-IDs pattern with \`$in\`.
- **One \`data-meno-list\` per filter wrapper.** \`querySelector\` returns the first match; additional containers are ignored.
- **\`ssrItems\` is keyed off \`data-id\` only.** Variants like \`data-_id\` work too, but stick with \`data-id\` for clarity.
- **Range inputs use the JSON value directly** (no DOM round-trip). When \`data-meno-types\` declares the field as \`number\`, comparisons coerce the string input to a number; \`undefined\` item values fail range checks, so don't filter-range on optional fields without populating defaults.

### Production pattern: component-encapsulated filter

The cleanest production shape (from ArthurD-web/adlittle's \`InsightsCardGrid\`): wrap **everything** — filter container, controls, list, empty state — inside a single reusable component. Pages mount it via \`{ "type": "component", "component": "InsightsCardGrid" }\` once and never deal with filter wiring directly.

\`\`\`json
// components/InsightsCardGrid.json (sketch)
{
  "component": {
    "structure": {
      "type": "node", "tag": "div",
      "attributes": {
        "data-meno-filter": "insights",
        "data-meno-per-page": "12"
      },
      "children": [
        // dropdown controls — option values populated from another collection list
        // <details> element with filter buttons, etc.
        { "type": "node", "tag": "div",
          "attributes": { "data-meno-list": "true" },
          "children": [
            { "type": "list", "sourceType": "collection", "source": "insights",
              "itemAs": "insight", "emitTemplate": true,
              "sort": { "field": "publishedAt", "order": "desc" },
              "children": [ /* InsightCard component instance */ ]
            }
          ]
        },
        { "type": "node", "tag": "div",
          "attributes": { "data-meno-empty": "" },
          "children": "No insights match the selected filters." }
      ]
    },
    "interface": {}
  }
}
\`\`\`

Real-world details from adlittle's working implementation:
- \`clientData.strategy: "static"\` with explicit \`fields\` allowlist (\`_id\`, \`_url\`, \`title\`, \`category\`, \`industries\`, \`services\`, …).
- Filter dropdown options are themselves populated from companion CMS collections (\`industries\`, \`services\`) — keeps selectable values in sync with the content.
- Cards have **no \`data-id\`** and rely on the template re-render path.
- Small \`InsightsCardGrid.js\` only handles \`<details>\` close-after-click; filtering is purely declarative via attributes.

### Full end-to-end example (static page, filter wrapper inline)

\`\`\`json
// templates/charters.json (CMS schema only — opts collection into client data)
"cms": {
  "id": "charters",
  "slugField": "slug",
  "urlPattern": "/charters/{{slug}}",
  "clientData": {
    "enabled": true,
    "strategy": "static",
    "fields": ["title", "slug", "location", "priceWeek", "priceTier", "cabins", "bathrooms", "sunDeck"]
  },
  "fields": { ... }
}

// pages/search.json (the filter wrapper + list)
{
  "type": "node", "tag": "div",
  "attributes": {
    "data-meno-filter": "charters",
    "data-meno-types": "{\\"cabins\\":\\"number\\",\\"priceWeek\\":\\"number\\",\\"sunDeck\\":\\"boolean\\"}",
    "data-meno-per-page": "12"
  },
  "children": [
    { "type": "node", "tag": "button",
      "attributes": { "data-meno-filter-field": "priceTier", "data-meno-filter-value": "$" },
      "children": "$" },
    { "type": "node", "tag": "button",
      "attributes": { "data-meno-filter-field": "sunDeck", "data-meno-filter-value": "true" },
      "children": "Sun deck" },
    { "type": "node", "tag": "input",
      "attributes": { "type": "number", "data-meno-range": "cabins", "data-meno-range-bound": "min" } },
    { "type": "node", "tag": "div",
      "attributes": { "data-meno-list": "true" },
      "children": [
        { "type": "list", "sourceType": "collection", "source": "charters",
          "itemAs": "item", "emitTemplate": true,
          "children": [
            { "type": "component", "component": "CharterCard",
              "props": {
                "id": "{{item._id}}",
                "title": "{{item.title}}",
                "url": "{{item._url}}",
                "priceTier": "{{item.priceTier}}",
                "cabins": "{{item.cabins}}",
                "sunDeck": "{{item.sunDeck ? 'true' : 'false'}}"
              }
            }
          ]
        }
      ]
    },
    { "type": "node", "tag": "div",
      "attributes": { "data-meno-empty": "" },
      "children": "No charters match these filters." }
  ]
}
\`\`\`

### Where the data ends up at build time

- \`strategy: "static"\` → \`dist/data/{id}/index.json\` is written (once); fetched by every page that uses MenoFilter against this collection.
- \`strategy: "inline"\` → \`<script type="application/json" id="meno-cms-{id}">\` is injected only into the rendered HTML of CMS template pages (\`/{slug}.html\` for each item). Static pages get nothing.
- \`strategy: "auto"\` → resolves to inline for collections under the threshold (default 500). **Avoid on static pages** — use explicit \`"static"\`.

### Diagnosing a filter that "doesn't work"

In order:

1. \`bun .../packages/core/bin/cli.ts build\` and check \`dist/data/{id}/index.json\` exists. If not, the schema is missing \`clientData.enabled: true\` or \`strategy: "static"\`.
2. Open \`dist/{your-page}.html\` and search for \`<template data-meno-item>\`. If absent, the list node is missing \`emitTemplate: true\`.
3. Open the page in a browser, devtools network tab — confirm the \`/data/{id}/index.json\` request is 200. A 404 means the data file wasn't generated (back to step 1).
4. In devtools console, evaluate \`MenoFilter.get('{id}').getAll().length\` — should be the number of items. Zero means data didn't load. \`MenoFilter.get('{id}').getFiltered().length\` after a filter click should drop accordingly.
5. If the count display moves but cards don't toggle, you're hitting DOM-only fallback — check that \`emitTemplate\` is set and the JSON loaded.
6. If filter on a boolean/number field does nothing, you're missing the field in \`data-meno-types\` (string-vs-typed comparison fails).

The \`data-meno-list\` wrapper is required — MenoFilter calls \`wrapper.querySelector('[data-meno-list]')\` to locate the items it should filter. Meno's \`type: "list"\` node does **not** auto-add this attribute, so wrap it in a \`type: "node"\` div that carries it.