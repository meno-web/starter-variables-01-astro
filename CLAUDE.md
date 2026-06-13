<!-- MENO_DOCS_VERSION: 2.0.44 -->
# Meno Core Documentation

## Quick Start

A blank Meno project ships with:
- `project.config.json` — `baseComponent: "Layout"` is pre-wired
- `colors.json` — minimal `light` theme (`text`, `bg`, `muted`, `border`)
- `enums.json` — empty `{}` (add enums as needed)
- `variables.json` — empty `{ "variables": [] }` (add CSS design tokens as needed)
- `components/Layout.json` — a minimal wrapper component with a single slot
- `pages/index.json` — empty page wrapping `Layout`
- `images/`, `fonts/` — empty asset folders

**First steps when asked to build something:**
1. Read `.claude/docs/meno/examples.md` for copy-ready Layout / Navigation / Hero / CMS patterns.
2. Build components by creating `components/{Name}.json` (use the examples as a starting point).
3. Fill `pages/{name}.json` with a `root` that uses `type: "component"`, `component: "Layout"` and **page-specific** section components as children. Sections that should appear on every page belong in `components/Layout.json` instead.
4. Add images to `/images/` and reference them with absolute paths: `/images/hero.webp`.

**Do not assume** `components.config.json` exists — blank projects do not ship it. List the `components/` directory directly to discover what's available.

**Before creating a CMS collection** (writing anything under `templates/*.json` with `meta.source: "cms"`, or any file under `cms/`), **read `.claude/docs/meno/cms-schema.md` first.** A collection needs three pieces in lockstep: a template page at `templates/{id}.json` with the `cms` schema inside `meta`, the `cms/{id}/` directory, and at least one item file with `_id` matching the file's stem (e.g. `hello-world.json` → `"_id": "hello-world"`) plus `_createdAt`. Skip any of these and you get an empty collection in the editor with no error surfaced.

**Before writing any `data-meno-filter` / `data-meno-list` / `data-meno-range` attribute, or wiring filtering / sorting / search over a CMS collection, read `.claude/docs/meno/meno-filter.md` first.** Getting it right requires a schema flag (`clientData.enabled` + `strategy: "static"`), a list flag (`emitTemplate: true`), and a field-naming convention that the doc spells out. Skipping the doc almost always produces a "count moves but cards don't" or "filter does nothing" silent failure.

---

## Creating Components

Components use the Meno JSON structure. NEVER use raw HTML/CSS format.

### Component Structure
```json
{
  "component": {
    "structure": {
      "type": "node",
      "tag": "li",
      "style": {
        "base": { "padding": "8px 0", "color": "var(--text)" }
      },
      "children": [{ "type": "slot" }]
    },
    "interface": {
      "text": { "type": "string", "default": "List item" }
    }
  }
}
```

### Rules
1. Root must be `{ "component": { ... } }`
2. `structure` defines the DOM tree using nodes, NOT raw HTML
3. `interface` defines props with type and default value
4. Only ONE slot per component - use nested components for multiple slots
5. Component JS files use vanilla JavaScript, NOT React

### Reserved Names
- `children`: NEVER define in interface - reserved for child nodes

---

## Node Types

### 1. HTML Element (`type: "node"`)
```json
{
  "type": "node",
  "tag": "div",
  "style": { "base": { "padding": "16px" } },
  "attributes": { "data-id": "hero" },
  "children": [...]
}
```
Properties: `tag` (required), `style`, `attributes`, `children`, `label`, `interactiveStyles`

**Attributes must have a value**: Every attribute is rendered as `name="value"` — both sides are required. If the value side is `null`, `undefined`, or an entirely-template expression that resolves to empty, the whole attribute is dropped (not rendered as `name=""`). Key consequences:
- `"attributes": { "target": "{{target}}" }` renders nothing when the `target` prop is missing/empty — the whole `target="..."` pair is stripped.
- To guarantee the attribute appears, provide a non-empty value — a literal (`"target": "_self"`) or a template with a fallback (`"{{target || '_self'}}"`).
- Boolean `true` renders as a bare attribute name (e.g. `disabled`); boolean `false` is dropped.
- Never depend on a template resolving to an empty string to "emit an empty attribute" — it will be removed. If you truly need an empty-valued attribute, hard-code it (`"foo": ""`).

**Text content**: Use `children` for text (there is NO `text` property):
```json
{ "type": "node", "tag": "span", "children": "Hello World" }
```

### 2. Component Instance (`type: "component"`)
```json
{
  "type": "component",
  "component": "Button",
  "props": { "text": "Click me", "variant": "primary" },
  "children": [...]
}
```
Properties: `component` (required), `props`, `children`

**Styling**: Don't add `style` directly. Use props mapped to styles via `_mapping`.

**Passing props through**: Use `{{propName}}` templates to forward a parent prop to a child component prop. Only use `_mapping` when you need to transform values (e.g., prop `"primary"` → style `"var(--primary)"`).
```json
"props": { "icon": "{{icon}}" }
```

**Template scope inside a component's structure** — when a component instance is used inside a list, `{{item.X}}` (or whatever `itemAs` is set to) resolves in the **`props` block of the instance** and inside the component's `children`/text/`href`. It does **not** resolve inside the `attributes` object on the component's structure root. If you need the iteration value on a root attribute (e.g. `data-id`, `data-{field}` for filters), forward it as a prop and reference the local prop name inside the component's `attributes`:
```json
// Page (inside the list)
{ "type": "component", "component": "Card",
  "props": { "id": "{{item._id}}", "tier": "{{item.priceTier}}" } }

// Card.json structure root
"attributes": { "data-id": "{{id}}", "data-tier": "{{tier}}" }
```

### 3. Slot (`type: "slot"`)
Placeholder where component children are injected. Only ONE per component.
```json
{ "type": "slot" }
```

### 4. Link (`type: "link"`)
```json
{
  "type": "link",
  "href": "/about",
  "style": { "base": { "color": "var(--primary)" } },
  "children": ["Learn more"]
}
```
Properties: `href` (required), `children`, `style`, `attributes`

**Never nest links.** `type: "link"` nodes (and any `<a>` tags in rich text or embed HTML) must not contain other links — HTML forbids nested anchors, so browsers silently split the DOM and navigation breaks. If a card needs both an outer link and an inner CTA, make the whole card one link and render the CTA as plain styled text (or a non-anchor element), not a second link.

**Dynamic href** - use template with link-type prop:
```json
// Structure: "href": "{{link}}"
// Interface: "link": { "type": "link" }
```

### 5. Embed (`type: "embed"`)
Inject raw HTML/SVG content (bypasses escaping).
```json
{
  "type": "embed",
  "html": "<svg>...</svg>",
  "style": { "base": { "width": "100%" } }
}
```
Properties: `html` (required), `style`, `attributes`, `label`

### 6. List (`type: "list"`)
Iterate over prop arrays or CMS collections:

**No styles on list nodes.** List nodes have no `style` or `interactiveStyles` — they are pure iteration (like React's `map()`). Wrap the list in a `type: "node"` parent for container styles; style a `type: "node"` inside `children` for per-item styles.

```json
{
  "type": "node",
  "tag": "ul",
  "style": { "base": { "display": "grid", "gap": "16px" } },
  "children": [
    {
      "type": "list",
      "sourceType": "prop",
      "source": "items",
      "children": [
        { "type": "node", "tag": "li", "style": { "base": { "padding": "8px" } }, "children": "{{item.title}}" }
      ]
    }
  ]
}
```

**Prop-based:**
```json
{
  "type": "list",
  "sourceType": "prop",
  "source": "items",
  "itemAs": "item",
  "children": [
    { "type": "node", "tag": "div", "children": "{{item.title}}" }
  ]
}
```

**CMS collection:**
```json
{
  "type": "list",
  "sourceType": "collection",
  "source": "posts",
  "itemAs": "post",
  "limit": 10,
  "sort": { "field": "createdAt", "order": "desc" },
  "children": [
    { "type": "node", "tag": "article", "children": "{{post.title}}" }
  ]
}
```

**Properties:**
- `sourceType` - "prop" (default) or "collection"
- `source` (required) - Prop name or collection name. For `sourceType: "prop"` only, may also be a `{{...}}` template that resolves to an array from the parent template context (e.g. `source: "{{category.items}}"` inside a parent list). For `sourceType: "collection"` it must be a literal collection name.
- `itemAs` - Variable name for templates (default: "item")
- `limit`, `offset` - Pagination
- Collection-only:
  - `items` — explicit ID list. Accepts a literal string, literal array, or a `{{...}}` template that resolves to either (e.g. `{{cms.author}}`, `{{cms.tags}}`, or `{{post.tags}}` from a parent list). When `items` is set, MenoFilter SSR calls `cmsService.getItemsByIds(source, ids)` instead of running a query — used for resolving reference fields. `source` is the **target collection** to fetch from, not the field name.
  - `filter` — query filter. Values support `{{...}}` templates resolved against the parent template context, so the inner query can reference the outer loop variable.
  - `sort`, `excludeCurrentItem`

**Template variables:** `{{item.field}}`, `{{item._url}}` (auto-computed page URL for CMS items), `{{itemIndex}}`, `{{itemFirst}}`, `{{itemLast}}`

**Linking each item to its page** (CMS collections only) — wrap each item in a `link` node with `href: "{{item._url}}"` (or `{{<itemAs>._url}}` if renamed). `_url` is auto-computed from the collection schema's `urlPattern`; never write it to the item.
```json
{
  "type": "list",
  "sourceType": "collection",
  "source": "posts",
  "itemAs": "post",
  "children": [
    {
      "type": "link",
      "href": "{{post._url}}",
      "children": [
        { "type": "node", "tag": "h3", "children": "{{post.title}}" }
      ]
    }
  ]
}
```

**Nested collection lists** — render fields from a referenced collection (`type: "reference"` field) by nesting a second `list` whose `items` template points at the parent's reference field. `source` is the **target collection**; `items` is the array (or single string) of IDs/filenames to fetch. Always set `itemAs` on the inner list so its loop variable doesn't shadow the outer one.

```json
{
  "type": "list",
  "sourceType": "collection",
  "source": "charters",
  "itemAs": "item",
  "children": [
    {
      "type": "node",
      "tag": "article",
      "children": [
        { "type": "component", "component": "Heading", "props": { "tag": "3", "text": "{{item.title}}" } },
        {
          "type": "list",
          "sourceType": "collection",
          "source": "charter-tags",
          "itemAs": "tag",
          "items": "{{item.tags}}",
          "children": [
            { "type": "component", "component": "Badge", "props": { "text": "{{tag.name}}" } }
          ]
        }
      ]
    }
  ]
}
```

`items` accepts the three shapes a reference field can take:
- `"{{cms.author}}"` — single `type: "reference"` field on a CMS template page (string ID).
- `"{{cms.tags}}"` — multi-reference field (`multiple: true`, array of IDs).
- `"{{item.X}}"` — same shapes resolved from a parent list's loop variable (rename via `itemAs` if you renamed it).

**Templated `filter` from a parent list.** Inside an outer list, the inner list can run a query that references the outer loop variable. Useful when the parent doesn't store an array of child IDs (no back-reference field), but each child references its parent.

```json
{
  "type": "list",
  "sourceType": "collection",
  "source": "team",
  "itemAs": "author",
  "children": [
    {
      "type": "node",
      "tag": "section",
      "children": [
        { "type": "node", "tag": "h3", "children": "{{author.name}}" },
        {
          "type": "list",
          "sourceType": "collection",
          "source": "posts",
          "filter": { "field": "author", "value": "{{author._id}}" },
          "itemAs": "post",
          "children": [
            { "type": "node", "tag": "h4", "children": "{{post.title}}" }
          ]
        }
      ]
    }
  ]
}
```

`filter` values pass through `resolveFilterTemplates` against the **parent list's template context**, so any `{{<itemAs>.field}}` from the outer loop works. The whole `value` must be a single `{{...}}` expression — partial templates like `"prefix-{{x}}"` are not resolved. The simple-object form (`"filter": { "category": "{{author.role}}" }`) is also accepted — both shapes work.

**Page-root in a CMS template (`templates/{collection}.json`).** `filter` values are NOT resolved against `cmsContext` here — `{{cms._id}}` in a `filter.value` will be left as the literal string and match nothing. To list "items belonging to the current CMS item" at page root, prefer one of:
1. **Back-reference array on the parent** (most common): store an array of child IDs on the parent CMS item (e.g. `team` has `posts: ["hello-world", "second-post"]`) and use `items: "{{cms.posts}}"` — the `{{cms.X}}` form on `items` IS resolved against `cmsContext`.
2. Wrap the inner list in a one-item outer list whose source is the current item, so the inner `filter` sees a parent template context.

**Performance note** — every parent iteration triggers a fresh `getItemsByIds` (or `queryItems`) call at SSR time. For large outer lists, prefer denormalising the labels you actually render onto the parent (`tagsLabels: ["Scenic","Adventure"]` as a plain string array) and iterating that as a `sourceType: "prop"` list — no second collection lookup per row.

### 7. Locale List (`type: "locale-list"`)
Language switcher based on project locales:
```json
{
  "type": "locale-list",
  "displayType": "nativeName",
  "showFlag": true,
  "showCurrent": false,
  "style": { "base": { "display": "flex", "gap": "8px" } }
}
```
Properties: `displayType` ("code"|"name"|"nativeName"), `showFlag`, `showCurrent`, `showSeparator`

---

## Interface Prop Types

| Type | Description | Example |
|------|-------------|---------|
| `string` | Text input | `{ "type": "string", "default": "Hello" }` |
| `number` | Numeric input | `{ "type": "number", "default": 0 }` |
| `boolean` | Toggle | `{ "type": "boolean", "default": false }` |
| `select` | Dropdown | `{ "type": "select", "options": ["a", "b"], "default": "a" }` |
| `link` | URL with target | `{ "type": "link", "default": { "href": "/" } }` |
| `file` | File upload | `{ "type": "file", "accept": "image/*", "default": "" }` |
| `rich-text` | HTML content | `{ "type": "rich-text", "default": "", "editor": "basic" }` |
| `embed` | Raw HTML/SVG string | `{ "type": "embed", "default": "<svg>...</svg>" }` |
| `list` | Array of structured items | `{ "type": "list", "itemSchema": { "title": { "type": "string" } } }` |

**CRITICAL: There is NO `"image"` type!** Use `file` with `accept: "image/*"`

**`list` prop** — used for arrays of structured items (e.g., feature cards, testimonials). Define the per-item shape under `itemSchema`. In the structure, render with a `list` node whose `sourceType` is `"prop"` and `source` matches the prop name.

**`rich-text` editor** — `"basic"` (headings + inline) or `"extended"` (full toolbar).

**Boolean prop → `data-*` attribute**: a `boolean`-typed prop rendered into an attribute template follows HTML5 boolean-attribute rules — `true` becomes a bare attribute (`data-active`), `false` is dropped. Neither stringifies to `"true"`/`"false"`. If you need a filterable string value (e.g. for MenoFilter `data-{field}`), declare the prop as `string` and convert at the call site with a ternary: `"props": { "active": "{{item.active ? 'true' : 'false'}}" }`. The matching filter button must also have the field declared in `data-meno-types` (e.g. `{"active":"boolean"}`) so MenoFilter coerces its string `data-meno-filter-value` against the typed JSON value — see `.claude/docs/meno/meno-filter.md` → **Type Coercion**.

### Writing rich-text values inline

`rich-text` prop values accept raw HTML when written by hand in page/component JSON. The SSR pipeline emits them unescaped. Supported inline patterns:

| Pattern | Use |
|---------|-----|
| `<strong>text</strong>` | Bold |
| `<em>text</em>` | Italic |
| `<a href="/about">text</a>` | Internal link |
| `<a href="https://…" target="_blank">text</a>` | External link (auto `rel="noopener noreferrer"`) |
| `<span class="custom-span" data-meno-span="true">text</span>` | Class-based styling hook (pair with component `css`) |
| `<br>` | Line break |

Example — span-highlighted heading:
```json
"title": "Everything you need to build <span class=\"custom-span\" data-meno-span=\"true\">professional</span> website"
```
Companion CSS on the receiving component (e.g. `Heading.json` `css` field):
```css
h1 .custom-span, h2 .custom-span, h3 .custom-span { color: var(--h-span); }
```

**Always include `data-meno-span="true"`** on styled spans so the editor round-trips cleanly. Allowed link protocols: `http:`, `https:`, `mailto:`, `tel:`, plus `/path` and `#anchor` — other schemes are dropped.

**Only works on `rich-text` props.** Plain `string` props HTML-escape their values — `<strong>` would render as literal text. Full allowlist: `packages/core/lib/shared/richtext/tiptapToHtml.ts` (`RICH_TEXT_ALLOWED_TAGS`, `RICH_TEXT_ALLOWED_ATTRS`).

---

## Template Variables

- `{{propName}}` - Component props from interface
- `{{item.field}}` - List item context (or custom name via `itemAs`, e.g. `{{post.title}}`)
- `{{itemIndex}}`, `{{itemFirst}}`, `{{itemLast}}` - List loop helpers (prefix matches `itemAs`, e.g. `{{postIndex}}`)
- `{{cms.field}}` - CMS template pages only (`templates/*.json` with `meta.source: "cms"`)
- `{{isEditorMode}}` - `true` in editor, `false` in production build

### Expressions in templates

Templates support a full expression syntax, not just variable lookups. Use it anywhere a string template is accepted (attributes, children text, `if`, style mapping values):

- **Ternary**: `{{item.featured ? "is-featured" : ""}}`
- **Comparisons**: `==`, `!=`, `===`, `!==`, `<`, `>`, `<=`, `>=` — `{{itemIndex > 0 ? "not-first" : "first"}}`
- **Logical**: `&&`, `||`, `!` — `{{item.active && item.visible ? "show" : "hide"}}`
- **Arithmetic**: `+`, `-`, `*`, `/`, `%` — `{{0.4 + itemIndex * 0.2}}` (e.g. staggered animation delays)
- **Property access**: dot notation — `{{item.author.name}}`

---

## Property Mappings (`_mapping`)

`_mapping` transforms **one** property value based on a component prop. It is a value-level transform, not a general-purpose variable system. Four forms exist — each works in exactly one place:

| Form | Where it goes | Example target | Notes |
|------|---------------|----------------|-------|
| Style | Any CSS property inside `style.base/tablet/mobile` | `backgroundColor`, `fontSize` | Works on `node`, `component`, `link`, `embed`, `locale-list` |
| Link | `href` of a `type: "link"` node | `href` | `values` optional — omit for passthrough of a `type: "link"` prop |
| HTML | `html` of a `type: "embed"` node | `html` | `values` optional — omit for passthrough of a string prop |
| Boolean | `if` on any conditional node (incl. `list`) | `if` | `values` must be booleans |

Shape:
```json
{ "_mapping": true, "prop": "<propName>", "values": { "<propValue>": "<output>" } }
```

Example — style mapping on `backgroundColor`:
```json
"backgroundColor": {
  "_mapping": true,
  "prop": "variant",
  "values": { "primary": "var(--primary)", "secondary": "var(--secondary)" }
}
```

### Where `_mapping` does NOT work — use `{{propName}}` templates instead
`_mapping` is only valid in the four places above. Everywhere else that accepts a string, use `{{propName}}` templates:
- Component-instance `props` values → `"props": { "icon": "{{icon}}" }`
- `tag` (HTML element name) → `"tag": "{{headingLevel}}"`
- `attributes.*` (e.g., `src`, `alt`, `data-*`) → `"attributes": { "src": "{{image}}" }`
- `children` text → `"children": "{{title}}"`
- Inside `style` on a `type: "list"` node → `list` has no `style`; wrap it in a `type: "node"` parent.
- `interface` prop `default` → defaults must be literal values; no mappings or templates.
- `type: "slot"` → slots have no mappable fields.

---

## Interactive Styles

CSS pseudo-selectors and JS-triggered states via `interactiveStyles`:

```json
{
  "type": "node",
  "tag": "button",
  "interactiveStyles": [
    {
      "name": "on hover",
      "prefix": "",
      "postfix": ":hover",
      "style": { "base": { "backgroundColor": "var(--primary-dark)" } }
    }
  ]
}
```

**Rule fields:**
- `name` (optional) - Friendly label shown in the editor
- `prefix` - CSS selector before the element class
- `postfix` - CSS selector after the element class
- `style` - Responsive style object (`base`, `tablet`, `mobile`)
- `previewProp` (optional) - Name of a boolean prop that, when `true` in the editor, renders this rule for preview

### How prefix/postfix Work
CSS generated: `{prefix}.element-class{postfix}`

| Use Case | prefix | postfix | Result |
|----------|--------|---------|--------|
| Hover | "" | ":hover" | `.el:hover` |
| Focus | "" | ":focus" | `.el:focus` |
| Self has class | "" | ".is-open" | `.el.is-open` |
| Target child | "" | ".is-open [data-el='menu']" | `.el.is-open [data-el='menu']` |
| Ancestor context | ".dark " | "" | `.dark .el` |

### Placement Rule
**Always place `interactiveStyles` on the target node itself.** Use `prefix` with the parent's `data-el` to reference the trigger (e.g., `"prefix": "[data-el='dropdown']:hover "`), instead of putting styles on the parent with a child-targeting postfix.

### JS + Interactive Styles Pattern
1. Add `data-el` attributes to elements you need to target
2. JS toggles a state class (e.g., `.is-open`) on the component root
3. `interactiveStyles` picks up the state and applies styles

---

## Responsive Breakpoints

Styles support three breakpoints:
```json
"style": {
  "base": { "fontSize": "18px", "padding": "24px" },
  "tablet": { "fontSize": "16px", "padding": "16px" },
  "mobile": { "fontSize": "14px", "padding": "12px" }
}
```

---

## Shorthand Rules

**Always split `border` from its color.** Keep the width+style in `border` and the color in a separate `borderColor` property so the editor's color picker and variable tokens can target the color independently.

```json
// CORRECT
"style": { "base": { "border": "1px solid", "borderColor": "var(--border)" } }

// WRONG — color is locked inside the shorthand, picker/tokens can't edit it
"style": { "base": { "border": "1px solid var(--border)" } }
```

Same rule per side: `borderTop: "1px solid"` + `borderTopColor: "var(--border)"`, etc.

---

## Conditional Rendering

All nodes support `if` for conditional rendering:
```json
// Boolean
{ "type": "node", "tag": "div", "if": false, "children": "Hidden" }

// From component prop
{
  "type": "node",
  "if": { "_mapping": true, "prop": "showBanner", "values": { "true": true, "false": false } },
  "children": "Banner"
}

// From context
{ "type": "node", "if": "{{showPromo}}", "children": "Promo" }
```

---

## Colors

Use CSS variables from colors.json:
- `var(--primary)`, `var(--secondary)`
- `var(--text)`, `var(--background)`, `var(--muted)`

Read colors.json to see all available colors.

---

## Enums

Project-level reusable option sets stored in `enums.json`:
```json
{
  "size": ["sm", "md", "lg", "xl"],
  "theme": ["light", "dark"]
}
```
Component select props reference enums via `enumName` instead of inline `options`:
```json
"size": { "type": "select", "enumName": "size", "default": "md" }
```
- **File**: `enums.json` in project root
- **API**: GET `/api/enums`, POST `/api/save-enums`

---

## Variables

CSS design tokens stored in `variables.json`:
```json
{
  "variables": [
    {
      "name": "Heading",
      "prop_name": "Size 1",
      "cssVar": "--h1-fs",
      "value": "48px",
      "type": "fontSize",
      "group": "font-size"
    }
  ]
}
```
Each variable has:
- `name` — display label (e.g., `"Heading"`)
- `prop_name` (optional) — secondary label for specificity (e.g., `"Size 1"`)
- `cssVar` — CSS custom property name (e.g., `--h1-fs`)
- `value` — base value (e.g., `48px`)
- `type` — responsive scaling category: `fontSize`, `padding`, `margin`, `gap`, or `none`
- `group` (optional) — UI filter group: `font-family`, `font-size`, `font-weight`, `line-height`, `letter-spacing`, `margin`, `padding`, `gap`, `size`, `border-radius`, `border-width`, `opacity`, `z-index`, `text-align`, `other`
- `scales` (optional) — per-variable breakpoint scale overrides, e.g., `{ "tablet": 0.88, "mobile": 0.75 }`

Variables with `type` other than `none` auto-scale at smaller breakpoints using `responsiveScales` from `project.config.json`.

Use in styles via `var()`: `{ "fontSize": "var(--h1-fs)" }`

- **File**: `variables.json` in project root
- **API**: GET `/api/variables-status`, GET `/api/variables-css`, POST `/api/save-variables`

---

## Layout & Base Component

`baseComponent` in `project.config.json` wraps every page's `root` inside that component's `slot`. The Layout component is the **shared chrome** (nav, footer, global wrappers) — its `children` render on every page. Pages contribute **page-specific content** as children of the Layout instance.

**Decide where a section goes before writing:**

| Should this section show on every page? | → `components/Layout.json` children |
|------------------------------------------|----------------------------------------|
| Should this section show on one page?    | → `pages/{name}.json` `root.children` (default) |

The `{ "type": "slot" }` inside Layout is the injection point where each page's content lands automatically — don't put page-specific siblings next to it.

**project.config.json:** `{ "baseComponent": "Layout" }`

**components/Layout.json** (minimal — shared chrome only):
```json
{
  "component": {
    "structure": {
      "type": "node",
      "tag": "div",
      "children": [{ "type": "slot" }]
    },
    "interface": {}
  }
}
```

**pages/index.json** (page-specific content as children of the Layout instance):
```json
{
  "root": {
    "type": "component",
    "component": "Layout",
    "children": [
      { "type": "component", "component": "HeroSection" }
    ]
  },
  "meta": { "title": "Home", "description": "..." }
}
```

See `.claude/docs/meno/examples.md` for a full Layout with navigation and footer.

---

## Page Meta

`meta` defines per-page SEO and behavior. All fields optional except the page needs a title for SEO output.

```json
"meta": {
  "title": "About",
  "description": "Short SEO description.",
  "keywords": "one, two, three",
  "ogTitle": "About Us",
  "ogDescription": "Social share description.",
  "ogImage": "/images/og-about.webp",
  "ogType": "website",
  "slugs": { "en": "/about", "pl": "/o-nas" },
  "source": "cms",
  "draft": false,
  "libraries": { "js": [{ "url": "/libraries/analytics.js", "mode": "defer" }] },
  "customCode": {
    "head": "<meta name=\"robots\" content=\"index,follow\">",
    "bodyStart": "",
    "bodyEnd": ""
  }
}
```

- `source` — `"static"` (default) or `"cms"` (template page rendering one URL per CMS item)
- `slugs` — per-locale URL overrides; enables auto-generated `hreflang` and `<link rel="canonical">`
- `draft` — `true` excludes the page from the build
- `customCode` — raw HTML injected into `<head>`, body start, or body end
- Any string field may be an `_i18n` object (see Locales & i18n)

`og:*`, `<link rel="canonical">`, and `<link rel="alternate" hreflang>` tags are emitted automatically from `siteUrl` + `i18n.locales` + `slugs`.

---

## Locales & i18n

Declare locales in `project.config.json`:

```json
"i18n": {
  "defaultLocale": "en",
  "locales": [
    { "code": "en", "name": "EN", "nativeName": "English", "langTag": "en-US" },
    { "code": "pl", "name": "PL", "nativeName": "Polski", "langTag": "pl-PL" }
  ]
}
```

**`_i18n` value objects** — any string can be replaced by an object with translations:

```json
"title": { "_i18n": true, "en": "Hello", "pl": "Cześć" }
```

Works **everywhere a string is rendered to the page**, including inside component structures (not just page roots):
- `meta.title`, `meta.description`, `meta.ogTitle` in pages and templates
- Component instance `props` values in page/template `root` AND nested inside other components
- Component prop `default` values inside `interface` (`components/*.json`)
- Raw `type: "node"` / `type: "link"` / `type: "embed"` **`children` text** — both at page `root` and inside a component's `structure`
- Raw `type: "node"` **`attributes.*` values** (e.g. `alt`, `aria-label`, `title`, `data-*`) — same scope as above
- **CMS item field values** — any `string` / `text` / `rich-text` field in `cms/{collection}/*.json`. The schema's `type` stays the same; just swap the value for an `_i18n` object. See `cms-schema.md` → **Localizing CMS items** for the worked example.

The SSR pipeline and the in-browser ComponentBuilder both auto-resolve `_i18n` shapes against the active locale, with fallback to `defaultLocale` then any available value.

**Per-locale URLs:**
- **Static pages**: `meta.slugs` — `"slugs": { "en": "/about", "pl": "/o-nas" }`.
- **CMS items**: set the slug-field value to an `_i18n` object — `"slug": { "_i18n": true, "en": "hello", "pl": "witaj" }`. The collection's `urlPattern` stays unchanged; the SSR resolves the locale-specific slug at render time.

**To translate a whole site**: locale declaration + every user-visible string in pages, templates, components, AND CMS items + per-locale URLs in both `meta.slugs` (pages) and item slug fields (CMS).

**Language switcher** — use the `locale-list` node type (see Node Types section).

---

## Assets

Static assets live next to your project files and are referenced by absolute path:

- `/images/*` — `"src": "/images/hero.webp"`
- `/fonts/*` — declare in `project.config.json` under `fonts`
- `/videos/*` — `"src": "/videos/intro.mp4"`
- `/libraries/*` — optional folder for local JS/CSS libraries (see libraries.md)

`project.config.json.imageFormat` (`"webp"` default or `"avif"`) selects the output format for processed images during build.

---

## Multi-file Components

A component may have up to three sibling files — all auto-linked by name:

- `components/Foo.json` — structure + interface (required)
- `components/Foo.js` — vanilla JS with auto-injected `el` and `props` (never use `export default` or `DOMContentLoaded`). Every prop from `interface` is also destructured into scope automatically (`var { question, answer } = props` is prepended), so do NOT declare a local `const`/`let` with the same name as a prop — it is a SyntaxError that breaks the whole page bundle. Rename colliding locals (e.g. `answerEl` instead of `answer`). See `.claude/docs/meno/javascript.md`.
- `components/Foo.css` — plain CSS appended to the page stylesheet; use for rules you can't express via `style` (keyframes, pseudo-elements, etc.)

Alternatively, inline CSS via a component-level `css` field:
```json
{ "component": { "css": "h1 .accent { background: linear-gradient(...); background-clip: text; }", "structure": {...} } }
```

---

## Project Structure

### Files

- `pages/*.json` - Page definitions (static pages)
- `templates/*.json` - CMS template pages (`meta.source: "cms"`; one output URL per CMS item)
- `cms/{collection}/*.json` - CMS item data (one file per item)
- `components/` - Component definitions (flat, or organized into subfolders — naming is up to you)
- `colors.json` - Color palette and themes
- `enums.json` - Reusable `select` option sets (ships empty in blank projects)
- `variables.json` - CSS design tokens (ships empty in blank projects)
- `project.config.json` - Project-level configuration (see below)
- `images/`, `fonts/`, `videos/`, `libraries/` - Static assets, referenced by absolute path

`components.config.json` is **optional** and absent in blank projects; don't assume it exists. Discover components by reading the `components/` directory.

### `project.config.json` fields

- `siteUrl` — canonical site origin (used for canonical/OG URLs)
- `baseComponent` — component wrapping every page root (e.g., `"Layout"`)
- `i18n` — `{ defaultLocale, locales: [{ code, name, nativeName, langTag }] }`
- `breakpoints` — `{ tablet: 1024, mobile: 540 }` (numbers = max-width)
- `responsiveScales` — auto-scale multipliers per breakpoint for variables (fontSize, padding, margin, gap, borderRadius, size)
- `fonts` — `[{ path, family, weight, weightMax?, style? }]`
- `icons` — `{ favicon?, appleTouchIcon? }`
- `libraries` — `{ js: [...], css: [...] }` (see libraries.md)
- `csp` — Content-Security-Policy whitelist (`scriptSrc`, `styleSrc`, `fontSrc`, `connectSrc`, `frameSrc`, `imgSrc`)
- `imageFormat` — `"webp"` or `"avif"`
- `remConversion` — `{ enabled, baseFontSize }` converts px values to rem at build time
- `customCode` — site-wide `{ head?, bodyStart?, bodyEnd? }` HTML injection (page-level overrides exist in `meta.customCode`)
- `showMenoBadge` — boolean

### `colors.json` shape

```json
{
  "default": "light",
  "palette": { "base-50": "#f9fafb", "base-900": "#111827" },
  "themes": {
    "light": { "label": "Light", "colors": { "text": "base-900", "bg": "base-50" } }
  }
}
```

Theme color values may reference palette keys (`"base-900"`) or be literal hex. In styles, use `var(--text)`, `var(--bg)`, etc. — CSS vars are generated from the active theme.

---

## Further Documentation

Topic-specific guides live in `.claude/docs/meno/`. Read the one that matches your task:

- `examples.md` - **Start here** for copy-ready patterns (Layout, Navigation, Hero, CMS template, Footer, FAQ with .js + .css)
- `cms-schema.md` - Defining CMS collections, field types, template pages, `{{cms.field}}`
- `javascript.md` - Component `.js` files, `defineVars`, data attributes, component communication
- `libraries.md` - External JS/CSS libraries and CSP configuration
- `redirects.md` - `_redirects` file for static hosting
- `meno-filter.md` - Client-side filtering/sorting/search/pagination (data attributes)
- `meno-filter-api.md` - MenoFilter JavaScript API ($eq, $gt, programmatic control)
- `website-convert.md` - Converting imported `analysis.json` into Meno components/pages

---

## Editor Selection Context

When the Meno editor is running, the currently selected element is written to `.meno/selection.json` as a **bare JSON array** — the editing hierarchy from the outermost page through every component drill-in down to the selected node:

```json
[
  "pages/index.json:6-14",
  "components/section/HeroCentered.json:49-56",
  "components/ui/Button.json:90-101"
]
```

- Each entry is shaped as `<filePath>:<lineStart>-<lineEnd>`. The line range may be a single number, or omitted when unknown.
- **The last entry is the selected node itself.** Earlier entries are the component instances the user clicked through to reach it — the next entry's filename names that component (e.g. `pages/index.json:6-14` points to a `HeroCentered` instance, made obvious by the next line being `components/section/HeroCentered.json`).
- The line range disambiguates *which* instance was entered when a page contains several of the same component.
- Open the file at the given line range to see the node's full `type`, `tag`, `componentName`, `style`, `props` in source. Those fields are intentionally not duplicated in `selection.json`.
- When nothing is selected the file contains `null`.

---

## Match the Page's Existing Pattern

Once you know the selected file from the last entry of the array in `.meno/selection.json`, **read the file and detect which of these patterns it already uses, then mirror it**. Don't mix styles within a page.

- **Lists** — the page contains a `{ "type": "list", ... }` node (`sourceType: "prop"` or `"collection"`). To add items, extend the list's `source` (or the underlying prop/CMS collection) or tweak its `children` template — do **not** hand-roll duplicate sibling components next to the list.
- **Pure components** — the page is a tree of `type: "component"` instances with no list nodes. To add items, insert another sibling component instance in the same style — do **not** introduce a list.
- **Variables** — styles already use `var(--…)` tokens and component props flow through `{{propName}}` templates (or `_mapping` for transformed values). Keep writing through tokens/templates — do **not** hard-code colors, sizes, spacing, or prop values when the surrounding page already routes through variables.

If the user explicitly asks for a different pattern, follow their instruction. Otherwise, match what's already there.
