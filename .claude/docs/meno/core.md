# Meno node model — reference

This Meno project is an **Astro project**: its source of truth on disk is `.astro`
files in the **meno-astro dialect**, not JSON.

- **On-disk format** → `src/pages/<slug>.astro` (pages) and `src/components/<Name>.astro`
  (components). For the on-disk grammar (how to read/hand-edit these `.astro` files so
  they round-trip), see `meno-astro-dialect.md` and the project `CLAUDE.md`.
- **The Studio API wire model** → the editor and the import/build tools speak a JSON
  **node tree** over the Studio dev-server HTTP API (`GET /api/pages/<slug>`,
  `POST /api/save-page`, `/api/component-data`, …). That JSON is *not* what lives on
  disk — the server's astro provider serializes it to/from `.astro` for you. This doc
  describes that node model: the shapes you send/receive over the API, and the node /
  style / token vocabulary they share with the dialect.

> Tools that build pages by hand (the import agents) work through the Studio API and
> therefore work in this node model. When you edit a file directly instead, write
> dialect `.astro` (see `meno-astro-dialect.md`).

## Page vs component (API wire model)

The API path argument for a page is the page's logical id (e.g. `index.json`,
`about.json`); the provider maps it to `src/pages/<slug>.astro`. The body is a node tree:

- Page: `{ "root": {...}, "meta": {...} }`
- Component: `{ "component": { "interface": {...}, "structure": {...} } }`

A page's `root` is **required** — it's the single top-level node the rest of the
tree hangs off. A body with `meta` but no `root` (or `root: null`) fails to render
with **`Page data must have a root node`**. Wrap the page in exactly one root node
(e.g. a `<main>` / layout `node`, or a `component`) and nest everything under its
`children`; don't send a bare array of nodes or a `meta`-only payload.

## Node types

| Type | Required | Children | Key Props |
|------|----------|----------|-----------|
| node | tag | nodes/text | style, attributes, interactiveStyles |
| component | component | nodes (if slot) | props |
| link | href | nodes/text | href (string or {href, target}) |
| embed | html | - | style |
| list | source | item template | sourceType ("prop"\|"collection"), itemAs, limit, sort, filter. Not an HTML element — works like `map()`, rendering children once per item. No style support. |
| locale-list | - | - | displayType, showFlag |
| slot | - | - | (in component structure only) |

## Style object

Only `base` is required. Add `tablet`/`mobile` only when overriding:
```json
"style": {
  "base": { "padding": "24px", "backgroundColor": "var(--background)" },
  "tablet": { "padding": "16px" },
  "mobile": { "padding": "12px" }
}
```
On disk this becomes a literal utility
`class="p-[24px] bg-(--background) tablet:p-[16px] mobile:p-[12px]"` string (the build generates its
CSS) — the canonical, round-tripping styling form. Only prop-bound / `{{template}}` / `_mapping` values
keep a `style({...})` call.

## Color format

Always use `var(--colorName)` (e.g., `var(--primary)`). Raw hex values do NOT work.
Theme colors are defined in `src/styles/theme.css`: the default theme's colors live on
`:root` under a `/* Colors: <theme-name> */` section, and each additional theme is a
`[theme="dark"] { … }` block declaring the same color names.

## CSS property names

Use camelCase: `backgroundColor`, `fontSize`, `borderRadius` (not kebab-case).

## Text content

HTML nodes carry text in `children` (no `text` property) in the wire model:
```json
{ "type": "node", "tag": "span", "children": "Hello World" }
```
On disk this is `<span>Hello World</span>`.

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
- **File**: `enums.json` in project root (separate from `project.config.json`)
- **API**: GET `/api/enums`, POST `/api/save-enums`
- **Service**: `EnumService` with caching and HMR via `hmr:enums-update`
- **Migration**: If `enums.json` doesn't exist, falls back to reading the `enums` key from `project.config.json` (read-only, no auto-write)

## Variables

CSS design tokens (typography + layout) are plain custom properties on `:root` in
`src/styles/theme.css`, grouped by `/* … */` comment sections:
```css
:root {
  /* Font Size */
  --h1-size: 48px;
  --body-size: 16px;

  /* Padding */
  --section-padding: 80px;

  /* Gap */
  --card-gap: 24px;

  /* Border Radius */
  --card-radius: 12px;
}
```
- A token's `--name` **is** its identity — give it a readable, descriptive name
  (`--h1-size`, `--section-padding`, `--card-gap`, `--heading-font`). There is **no**
  separate display "name"/label and **no** `type` / `group` / `cssVar` field anymore.
- The **comment section is the group**: `/* Font Size */`, `/* Padding */`, `/* Gap */`,
  `/* Border Radius */`, etc. Grouping is automatic — a variable belongs to whatever section
  it sits under.
- Author only the **base/desktop value**. Responsive scaling is handled by regenerated
  `@media` blocks driven by `project.config.json`; you don't hand-write per-breakpoint values.

Use in styles via `var()`: `{ "fontSize": "var(--h1-size)" }`

- **File**: `src/styles/theme.css` — the single source of truth for theme colors + CSS
  variables. Edit it directly or via the Studio color/variable panels.
- **API**: GET `/api/variables-status`, GET `/api/variables-css`, POST `/api/save-variables`
- **Service**: `VariableService` with caching and HMR via `hmr:variables-update`
- **Legacy**: `colors.json` / `variables.json` are retired for astro projects — an existing
  project's JSON tokens are folded into `theme.css` and the JSON files deleted on first load.

## Common mistakes (avoid these)

- NO `type: "image"` -> use `file` with `accept: "image/*"`
- NO `text` prop on nodes -> use `children` for text
- NO manual `data-component` attr -> system adds it automatically
- NO `children` in interface -> reserved, use `content` or `text`
- Colors: always `var(--name)` not hex values
- A page body needs a single `root` node -> omitting it throws `Page data must have a root node`

## Working in this project

- **Read before editing.** When editing `.astro` files directly, read the file first
  and stay inside the dialect grammar (`meno-astro-dialect.md`).
- **Build pages via the Studio API** in the node model above when scripting (the
  import flow); the provider writes correct `.astro` for you.
- See `components.md` for component shape (interface, props, slots, interactiveStyles)
  and `meno-astro-api.md` for the full Studio dev-server API surface.
