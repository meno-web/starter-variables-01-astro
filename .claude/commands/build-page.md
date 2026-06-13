---
description: Create a new Meno page from description
allowed-tools: Read, Write, Glob
---

# Build Page

Create a new page, reusing existing components where possible.

## Usage

```
/build-page [description]
```

## Instructions

1. **Understand the request**: Parse $ARGUMENTS for the page description.

2. **Discover available components**:
   - List the `components/` directory with Glob (`components/**/*.json`).
   - For each candidate that matches the need, read its `.json` to learn its `interface` (props).
   - If the project is fresh/blank and has no matching components, read `.claude/docs/meno/examples.md` for ready-made Layout / Navigation / Hero / Card-grid / Footer patterns and adapt them into new component files before building the page.

3. **Check the base component**:
   - Look at the `Base component:` line in your `## Current Project` context (provided automatically — do not read `project.config.json` for this). If a base component is listed, the page's `root` should be `{ "type": "component", "component": "<baseComponent>", "children": [...] }`. If no base component is listed, use a plain `{ "type": "node", "tag": "main", "children": [...] }` root instead.

4. **Build the page using this priority order**:

   **Priority 1 — Existing components**: compose the page from what's already in `components/`.
   ```json
   { "type": "component", "component": "HeroSection", "props": { "title": "..." } }
   ```

   **Priority 2 — New components**: if a pattern repeats or the page needs a clear section (hero, feature grid, CTA), create a reusable component at `components/{Name}.json` using `/build-component`, then reference it. Use `examples.md` as a starting point.

   **Priority 3 — Raw nodes**: inline `type: "node"` only for layout scaffolding that isn't worth extracting.
   ```json
   { "type": "node", "tag": "div", "style": {...}, "children": [...] }
   ```

5. **Write the page** to `pages/{name}.json`.

## Key Rules

### Page Structure
```json
{
  "meta": {
    "title": "Page Title",
    "description": "SEO description"
  },
  "root": {
    "type": "component",
    "component": "Layout",
    "children": [
      { "type": "component", "component": "HeroSection", "props": { "title": "..." } }
    ]
  }
}
```

### Text Content
Use `children` for text, **NOT** a `text` prop:
```json
{ "type": "node", "tag": "span", "children": "Hello" }
```

### Colors
Always use CSS variables from `colors.json`:
```json
"style": { "base": { "color": "var(--text)", "backgroundColor": "var(--bg)" } }
```

### Responsive Styles
Use breakpoint objects:
```json
"style": {
  "base": { "fontSize": "48px", "padding": "80px" },
  "tablet": { "fontSize": "36px", "padding": "60px" },
  "mobile": { "fontSize": "24px", "padding": "40px" }
}
```

### Images
Reference assets by absolute path from `/images/`:
```json
{
  "type": "node",
  "tag": "img",
  "attributes": {
    "src": "/images/hero.webp",
    "alt": "Description",
    "loading": "lazy"
  }
}
```

## Reference

- `CLAUDE.md` — node types, interface types, styles, page meta
- `.claude/docs/meno/examples.md` — copy-ready Layout, Hero, Nav, Footer, CMS patterns

## Example

User: `/build-page landing page with hero section and features grid`

Actions:
1. Glob `components/**/*.json` — discover what exists.
2. If a `HeroSection` and `FeaturesGrid` already exist, read their interfaces and use them.
3. Otherwise, read `examples.md`, adapt the Hero + Card-grid snippets into new components.
4. Wrap the page in `Layout` (per `project.config.json.baseComponent`).
5. Write `pages/landing.json`:
   ```json
   {
     "meta": { "title": "Landing", "description": "..." },
     "root": {
       "type": "component",
       "component": "Layout",
       "children": [
         { "type": "component", "component": "HeroSection", "props": { "title": "..." } },
         { "type": "component", "component": "FeaturesGrid", "props": { "columns": "3" } }
       ]
     }
   }
   ```
