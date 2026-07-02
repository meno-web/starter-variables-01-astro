# Components — node model reference

On disk, components are `.astro` files at `src/components/<Name>.astro` in the
meno-astro dialect (a `resolveProps(Astro, {...})` prop block + body). For the on-disk
grammar, see `meno-astro-dialect.md` and the project `CLAUDE.md`.

This doc describes the **Studio API wire model** for components — the JSON node tree the
editor and the import/extract tools send over the dev-server HTTP API (the astro
provider serializes it to/from `.astro` for you). The interface types, node types, slot
rules, template variables, and `_mapping` rules below are shared with the dialect.

## Component shape (wire model)

A component is `{ "component": { "interface": {...}, "structure": {...} } }`:
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
On disk this is a `<li class="p-[12px]"><slot /></li>` component with a
`resolveProps(Astro, { text: { type: "string", default: "List item" } })` block (styling is a literal
utility `class="…"` string; only prop-bound / dynamic values use a `style({...})` call).

### Structure rules
1. Root of the definition is `{ "component": { ... } }`.
2. `structure` defines the DOM tree using nodes, NOT raw HTML.
3. `interface` defines props with type and default value.
4. Only ONE slot per component is allowed — multiple slots are NOT supported. Workaround: nest components (e.g., Tabs -> TabNav + TabContent, each with their own slot).
5. Component JS uses vanilla JavaScript, NOT React — no JSX, no hooks, no React imports. On disk this is a `<script>` (or `<script define:vars={{...}}>`) in the `.astro` file.

### Component prop names
Most prop names work fine, including: type, style, tag, component, props, attributes, src, alt, title, name, variant.

**Reserved name in interface — `children`**: NEVER define `children` in the component `interface`. It's reserved for child nodes passed to the component. Use a different name (like `content` or `text`) for text props.

**Reserved keys at the node level** (interpreted by the renderer; not free for arbitrary use):
- All nodes: `type`, `if`, `label`, `style`, `interactiveStyles`, `attributes`, `children`, `generateElementClass`
- `type: "node"`: also `tag`, `props`
- `type: "component"`: also `component`, `props`
- `type: "link"`: also `href`
- `type: "embed"`: also `html`
- `type: "list"`: also `sourceType`, `source`, `itemAs`, `items`, `filter`, `sort`, `limit`

These are node-level fields, not interface props. Interface prop names (keys inside a component instance's `props` object) are independent and only `children` is reserved there.

## Node types in structure

### 1. HTML element (`type: "node"`)
Standard HTML element with styling and children.
```json
{
  "type": "node",
  "tag": "div",
  "style": { "base": { "padding": "16px" } },
  "attributes": { "data-id": "hero" },
  "children": [...]
}
```
**Properties**: `tag` (required), `style`, `attributes`, `children`, `label`, `interactiveStyles`

### 2. Component instance (`type: "component"`)
Instance of a defined component with props.
```json
{
  "type": "component",
  "component": "Button",
  "props": { "text": "Click me", "variant": "primary" },
  "children": [...]
}
```
**Properties**: `component` (required), `props`, `children`, `attributes`

**Styling component instances**: By default, component instances cannot carry their own `style` — define props on the component and map them to styles internally via `_mapping`.

**Exception — `acceptsStyles`**: a component definition can opt in by setting `"acceptsStyles": true` on its top-level `component` object. When set, instances **may** carry an instance-level `style` (base/tablet/mobile) merged on top of the component's internal styles. The editor exposes a "Styles" toggle on the component definition (PropsPanel) and renders a Style section on each instance when enabled.
```json
// Card definition — opt in
{
  "component": {
    "acceptsStyles": true,
    "interface": { "title": { "type": "string" } },
    "structure": { "type": "node", "tag": "div", "children": [ ... ] }
  }
}

// page using Card — instance-level style is now allowed
{
  "type": "component",
  "component": "Card",
  "props": { "title": "Hello" },
  "style": { "base": { "marginTop": "24px" } }
}
```
Prefer `_mapping` for styles that vary with a known set of prop values; reach for `acceptsStyles` when callers genuinely need ad-hoc layout/spacing tweaks per instance.

### 3. Slot (`type: "slot"`)
Placeholder where component children are injected. Only ONE slot per component.
```json
{ "type": "slot" }
```
**Properties**: None. Used only in component `structure`.

### 4. Link (`type: "link"`)
Clickable link rendered as `<a>` (a `<Link>` component on disk).
```json
{
  "type": "link",
  "href": "/about",
  "style": { "base": { "color": "var(--primary)" } },
  "children": ["Learn more"]
}
```
**Properties**: `href` (required — string or link object), `children`, `style`, `attributes`
**href formats**: `"/path"` or `{ "href": "/path", "target": "_blank" }`

**Dynamic href in components** — use template interpolation with a link-type prop:
```json
// In component structure:
"href": "{{link}}"

// In interface:
"link": { "type": "link" }
```

## Interface prop types (only these are valid)
| Type | Description | Example |
|------|-------------|---------|
| `string` | Text input | `{ "type": "string", "default": "Hello" }` |
| `number` | Numeric input | `{ "type": "number", "default": 0 }` |
| `boolean` | Toggle | `{ "type": "boolean", "default": false }` |
| `select` | Dropdown | `{ "type": "select", "options": ["a", "b"], "default": "a" }` |
| `link` | URL with target | `{ "type": "link", "default": { "href": "/", "target": "_blank" } }` |
| `file` | File upload | `{ "type": "file", "accept": "image/*", "default": "" }` |
| `rich-text` | HTML content | `{ "type": "rich-text", "default": "" }` |

### Writing rich-text values inline
`rich-text` prop values accept raw HTML written by hand. The render pipeline emits them unescaped. Supported inline patterns:

| Pattern | Use |
|---------|-----|
| `<strong>text</strong>` | Bold |
| `<em>text</em>` | Italic |
| `<a href="/about">text</a>` | Internal link |
| `<a href="https://…" target="_blank">text</a>` | External link (auto `rel="noopener noreferrer"`) |
| `<span class="custom-span" data-meno-span="true">text</span>` | Class-based styling hook (pair with component CSS) |
| `<br>` | Line break |

Example — span-highlighted heading:
```json
"title": "Everything you need to build <span class=\"custom-span\" data-meno-span=\"true\">professional</span> website"
```
Companion CSS on the receiving component — a `<style>` block in `Heading.astro`:
```css
h1 .custom-span, h2 .custom-span, h3 .custom-span { color: var(--h-span); }
```

**Always include `data-meno-span="true"`** on styled spans so the editor round-trips cleanly. Allowed link protocols: `http:`, `https:`, `mailto:`, `tel:`, plus `/path` and `#anchor` — other schemes are dropped.

**Only works on `rich-text` props.** Plain `string` props HTML-escape their values — `<strong>` would render as literal text. Full allowlist: `packages/core/lib/shared/richtext/tiptapToHtml.ts`.

**CRITICAL: There is NO `"image"` type!** For images, use `file` with an accept pattern:
```json
// CORRECT
"avatar": { "type": "file", "accept": "image/*", "default": "" }

// WRONG — "image" is not a valid type
"avatar": { "type": "image", "default": "" }
```

## Template variables ({{...}})
- `{{propName}}` — Component props from interface (used in component structure)
- `{{item.field}}` — CMS list context (default), or custom name via `itemAs`
- `{{itemIndex}}`, `{{itemFirst}}`, `{{itemLast}}` — CMS list loop helpers
- `{{cms.field}}` — CMS template pages only (the `src/pages/<collection>/[slug].astro` templates)

On disk, `{{expr}}` becomes a JSX `{expr}` (see the dialect doc, rule 3).

### Using props in structure
- Text interpolation: `"children": "{{propName}}"`
- Conditional styles with `_mapping`:
```json
"fontSize": {
  "_mapping": true,
  "prop": "size",
  "values": { "small": "14px", "medium": "16px", "large": "20px" }
}
```

### Property mappings vs. templates — critical
`_mapping` is only valid in four places: **style props**, **`href` on a link node**, **`html` on an embed node**, and **`if` for conditional rendering**.

Everywhere else — including component-instance `props` values, `tag`, `attributes.*`, and `children` text — use `{{propName}}` templates. Do NOT use `_mapping` to forward a parent prop to a child component's prop.
```json
// RIGHT — forward a parent prop to a child component prop
{ "type": "component", "component": "Text", "props": { "content": "{{text}}" } }

// WRONG — _mapping does not work here
{ "type": "component", "component": "Text",
  "props": { "content": { "_mapping": true, "prop": "text", "values": {} } } }
```

## Text content: HTML nodes vs component props

**HTML nodes** — use `children` for text (there is NO `text` property on nodes):
```json
{ "type": "node", "tag": "span", "children": "Hello World" }
```

**Components WITH a slot** — can receive `children`:
```json
{ "type": "component", "component": "Card", "children": [...] }
```

**Components WITHOUT a slot** — use their defined props:
```json
{ "type": "component", "component": "Button", "props": { "text": "Click me" } }
```

**Rule**: Check if a component has a `slot` in its structure. If yes, use `children`. If no, use the props from its interface.

## Finding available components

**IMPORTANT**: Components vary by project. Never assume a component exists.

Before using any component:
1. List components via `GET /api/component-data` (or list `src/components/`).
2. Read the component's `.astro` source (its `resolveProps(Astro, {...})` block is the
   authoritative interface) to see its props and structure.

If a component doesn't exist, offer to create it or suggest an alternative.
