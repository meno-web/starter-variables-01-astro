## Creating New Components (CRITICAL - Follow Exactly)

When creating component JSON files, you MUST use the Meno component structure. NEVER use raw HTML/CSS format.

### CORRECT FORMAT (Always use this):
\`\`\`json
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
\`\`\`

### Component Structure Rules:
1. Root must be \`{ "component": { ... } }\`
2. \`structure\` defines the DOM tree using nodes, NOT raw HTML
3. \`interface\` defines props with type and default value
4. Only ONE slot per component is allowed - multiple slots are NOT supported. Workaround: use nested components (e.g., Tabs -> TabNav + TabContent, each with their own slot)
5. Component JS files (Name.js) must use vanilla JavaScript, NOT React - no JSX, no hooks, no React imports

### Component Prop Names
Most prop names work fine, including: type, style, tag, component, props, attributes, src, alt, title, name, variant.

**Reserved name in interface - \`children\`**: NEVER define \`children\` in the component \`interface\`. It's reserved for child nodes passed to the component. Use a different name (like \`content\` or \`text\`) for text props.

**Reserved keys at the node level** (interpreted by the renderer; not free for arbitrary use):
- All nodes: \`type\`, \`if\`, \`label\`, \`style\`, \`interactiveStyles\`, \`attributes\`, \`children\`, \`generateElementClass\`
- \`type: "node"\`: also \`tag\`, \`props\`
- \`type: "component"\`: also \`component\`, \`props\`
- \`type: "link"\`: also \`href\`
- \`type: "embed"\`: also \`html\`
- \`type: "list"\`: also \`sourceType\`, \`source\`, \`itemAs\`, \`items\`, \`filter\`, \`sort\`, \`limit\`

These are node-level fields, not interface props. Interface prop names (which appear as keys inside a component instance's \`props\` object) are independent and only \`children\` is reserved there.

### Node Types in Structure

#### 1. HTML Element (\`type: "node"\`)
Standard HTML element with styling and children.
\`\`\`json
{
  "type": "node",
  "tag": "div",
  "style": { "base": { "padding": "16px" } },
  "attributes": { "data-id": "hero" },
  "children": [...]
}
\`\`\`
**Properties**: \`tag\` (required), \`style\`, \`attributes\`, \`children\`, \`label\`, \`interactiveStyles\`

#### 2. Component Instance (\`type: "component"\`)
Instance of a defined component with props.
\`\`\`json
{
  "type": "component",
  "component": "Button",
  "props": { "text": "Click me", "variant": "primary" },
  "children": [...]
}
\`\`\`
**Properties**: \`component\` (required), \`props\`, \`children\`, \`attributes\`

**Styling component instances**: By default, component instances cannot carry their own \`style\` — define props on the component and map them to styles internally via \`_mapping\`.

**Exception — \`acceptsStyles\`**: a component definition can opt in by setting \`"acceptsStyles": true\` on its top-level \`component\` object. When set, instances **may** carry an instance-level \`style\` (base/tablet/mobile) that's merged on top of the component's internal styles. The editor exposes a "Styles" toggle on the component definition (PropsPanel) and renders a Style section on each instance when enabled.

\`\`\`json
// components/Card.json — opt in
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
\`\`\`

Prefer \`_mapping\` for styles that vary with a known set of prop values; reach for \`acceptsStyles\` when callers genuinely need ad-hoc layout/spacing tweaks per instance.

#### 3. Slot (\`type: "slot"\`)
Placeholder where component children are injected. Only ONE slot per component.
\`\`\`json
{ "type": "slot" }
\`\`\`
**Properties**: None. Used only in component \`structure\`.

#### 4. Link (\`type: "link"\`)
Clickable link rendered as \`<a>\` tag in SSR, \`<div>\` in editor.
\`\`\`json
{
  "type": "link",
  "href": "/about",
  "style": { "base": { "color": "var(--primary)" } },
  "children": ["Learn more"]
}
\`\`\`
**Properties**: \`href\` (required - string or link object), \`children\`, \`style\`, \`attributes\`
**href formats**: \`"/path"\` or \`{ "href": "/path", "target": "_blank" }\`

**Dynamic href in components** - use template interpolation with link-type prop:
\`\`\`json
// In component structure:
"href": "{{link}}"

// In interface:
"link": { "type": "link" }
\`\`\`

### Interface Prop Types (IMPORTANT - Only these are valid):
| Type | Description | Example |
|------|-------------|---------|
| \`string\` | Text input | \`{ "type": "string", "default": "Hello" }\` |
| \`number\` | Numeric input | \`{ "type": "number", "default": 0 }\` |
| \`boolean\` | Toggle | \`{ "type": "boolean", "default": false }\` |
| \`select\` | Dropdown | \`{ "type": "select", "options": ["a", "b"], "default": "a" }\` |
| \`link\` | URL with target | \`{ "type": "link", "default": { "href": "/", "target": "_blank" } }\` |
| \`file\` | File upload | \`{ "type": "file", "accept": "image/*", "default": "" }\` |
| \`rich-text\` | HTML content | \`{ "type": "rich-text", "default": "" }\` |

### Writing rich-text values inline

\`rich-text\` prop values accept raw HTML when written by hand in page/component JSON. The SSR pipeline emits them unescaped. Supported inline patterns:

| Pattern | Use |
|---------|-----|
| \`<strong>text</strong>\` | Bold |
| \`<em>text</em>\` | Italic |
| \`<a href="/about">text</a>\` | Internal link |
| \`<a href="https://…" target="_blank">text</a>\` | External link (auto \`rel="noopener noreferrer"\`) |
| \`<span class="custom-span" data-meno-span="true">text</span>\` | Class-based styling hook (pair with component \`css\`) |
| \`<br>\` | Line break |

Example — span-highlighted heading:
\`\`\`json
"title": "Everything you need to build <span class=\\"custom-span\\" data-meno-span=\\"true\\">professional</span> website"
\`\`\`
Companion CSS on the receiving component (e.g. \`Heading.json\` \`css\` field):
\`\`\`css
h1 .custom-span, h2 .custom-span, h3 .custom-span { color: var(--h-span); }
\`\`\`

**Always include \`data-meno-span="true"\`** on styled spans so the editor round-trips cleanly. Allowed link protocols: \`http:\`, \`https:\`, \`mailto:\`, \`tel:\`, plus \`/path\` and \`#anchor\` — other schemes are dropped.

**Only works on \`rich-text\` props.** Plain \`string\` props HTML-escape their values — \`<strong>\` would render as literal text. Full allowlist: \`packages/core/lib/shared/richtext/tiptapToHtml.ts\`.

**CRITICAL: There is NO \`"image"\` type!** For images, use \`file\` with accept pattern:
\`\`\`json
// CORRECT
"avatar": { "type": "file", "accept": "image/*", "default": "" }

// WRONG - "image" is not a valid type
"avatar": { "type": "image", "default": "" }
\`\`\`

### Template Variables ({{...}})
- \`{{propName}}\` - Component props from interface (used in component structure)
- \`{{item.field}}\` - CMS list context (default), or custom name via \`itemAs\`
- \`{{itemIndex}}\`, \`{{itemFirst}}\`, \`{{itemLast}}\` - CMS list loop helpers
- \`{{cms.field}}\` - CMS template pages only (pages in templates/)

### Using Props in Structure:
- Text interpolation: \`"children": "{{propName}}"\`
- Conditional styles with \`_mapping\`:
\`\`\`json
"fontSize": {
  "_mapping": true,
  "prop": "size",
  "values": { "small": "14px", "medium": "16px", "large": "20px" }
}
\`\`\`

### Property Mappings vs. Templates — Critical
\`_mapping\` is only valid in four places: **style props**, **\`href\` on a link node**, **\`html\` on an embed node**, and **\`if\` for conditional rendering**. See \`styling.md\` → "Property Mappings (\`_mapping\`)" for the full table.

Everywhere else — including component-instance \`props\` values, \`tag\`, \`attributes.*\`, and \`children\` text — use \`{{propName}}\` templates. Do NOT use \`_mapping\` to forward a parent prop to a child component's prop.

\`\`\`json
// RIGHT — forward a parent prop to a child component prop
{ "type": "component", "component": "Text", "props": { "content": "{{text}}" } }

// WRONG — _mapping does not work here
{ "type": "component", "component": "Text",
  "props": { "content": { "_mapping": true, "prop": "text", "values": {} } } }
\`\`\`

### Text Content: HTML Nodes vs Component Props

**HTML nodes** - Use \`children\` for text (there is NO \`text\` property on nodes):
\`\`\`json
{ "type": "node", "tag": "span", "children": "Hello World" }
\`\`\`

**Components WITH a slot** - Can receive \`children\`:
\`\`\`json
// Component has { "type": "slot" } in structure, so children work:
{ "type": "component", "component": "Card", "children": [...] }
\`\`\`

**Components WITHOUT a slot** - Use their defined props:
\`\`\`json
// Button has "text" prop but NO slot, so use props:
{ "type": "component", "component": "Button", "props": { "text": "Click me" } }
\`\`\`

**Rule**: Check if a component has a \`slot\` in its structure. If yes, use \`children\`. If no, use the props from its interface.

### Finding Available Components

**IMPORTANT**: Components vary by project. Never assume a component exists.

Before using any component:
1. Use \`get_available_sections\` tool to list all available components
2. Use \`get_component_info(componentName)\` to see its props and structure

If a component doesn't exist, offer to create it or suggest an alternative.