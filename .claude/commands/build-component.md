---
description: Create a new Meno component
allowed-tools: Read, Write, Glob
---

# Build Component

Create a new reusable component based on the user's description.

## Usage

```
/build-component [description]
```

## Instructions

1. **Understand the request**: Parse $ARGUMENTS for component requirements
2. **Gather context**: Read existing components in `components/` for patterns
3. **Create files**:
   - `components/ComponentName.json` - Structure and interface
   - `components/ComponentName.js` - Only if JavaScript behavior needed

## Key Rules

### Prop Types
Valid types: `string`, `number`, `boolean`, `select`, `link`, `file`, `rich-text`

```json
{
  "component": {
    "interface": {
      "title": { "type": "string", "default": "Heading" },
      "count": { "type": "number", "default": 0 },
      "visible": { "type": "boolean", "default": true },
      "size": { "type": "select", "options": ["sm", "md", "lg"], "default": "md" },
      "cta": { "type": "link", "default": { "href": "/", "target": "_self" } },
      "avatar": { "type": "file", "accept": "image/*", "default": "" },
      "content": { "type": "rich-text", "default": "<p>Text</p>" }
    }
  }
}
```

### Image Props
Use `file` type, **NOT** `image`:
```json
// CORRECT
"image": { "type": "file", "accept": "image/*", "default": "" }

// WRONG - "image" is not a valid type
"image": { "type": "image" }
```

### Reserved Names
Never use `children` as a prop name - it's reserved for slots.

### Component Structure

Root must be wrapped in `{ "component": { ... } }`:

```json
{
  "component": {
    "interface": {
      "title": { "type": "string", "default": "Hello" }
    },
    "structure": {
      "type": "node",
      "tag": "div",
      "children": [
        {
          "type": "node",
          "tag": "h2",
          "children": "{{title}}"
        }
      ]
    }
  }
}
```

### Props in Templates
Use `{{propName}}` for interpolation:
```json
{ "tag": "span", "children": "{{title}}" }
{ "tag": "img", "attributes": { "src": "{{image}}" } }
```

### JavaScript Behavior
Create a `.js` file only when needed. `el` (component root element) and `props` are auto-injected — do NOT use `export default`, do NOT use `DOMContentLoaded`:

```javascript
// components/Counter.js
const button = el.querySelector('[data-action="increment"]');
const countEl = el.querySelector('[data-el="count"]');
let count = props.initialCount || 0;

button?.addEventListener('click', () => {
  count++;
  countEl.textContent = count;
});
```

See `.claude/docs/meno/javascript.md` for the full JS pattern (data attributes, component communication, data-component auto-injection).

## Reference

- `CLAUDE.md` — node types, interface types, styles, interactiveStyles
- `.claude/docs/meno/javascript.md` — component JavaScript patterns
- `.claude/docs/meno/cms-schema.md` — CMS collections and field types

## Example

User: `/build-component card with image, title, description and link`

Actions:
1. Read existing components for style patterns
2. Create `components/Card.json` with:
   - Interface: image (file), title (string), description (string), link (link)
   - Structure: card layout with image, text content, and CTA
