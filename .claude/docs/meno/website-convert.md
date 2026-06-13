## Website to Meno Conversion Guide

This guide explains how to convert an imported website's \`analysis.json\` into Meno component and page JSON files.

### Input: analysis.json Structure

\`\`\`
{
  meta: { title, description, favicon },
  fonts: ["Font Name", ...],
  fontFaces: [{ family, src, weight?, style? }],
  colors: { backgrounds: [...], text: [...], accents: [...] },
  typography: [{ tag: "h1", style: { fontSize, fontWeight, ... } }],
  cssVariables: { "--var-name": "value" },
  breakpoints: [{ name: "tablet"|"mobile", maxWidth: number }],
  spacingScale: ["24px", "16px", ...],
  sections: [
    {
      index, type, suggestedComponent, label,
      background: { color?, image?, gradient? },
      layout: "column"|"row"|"grid",
      content: {
        headings: [{ level, text }],
        paragraphs: ["..."],
        links: [{ text, href }],
        buttons: [{ text, href? }]
      },
      images: [{ src, alt }],
      items?: { count, itemSkeleton?, sample: { heading?, text?, image?, link?, buttonText? } },
      htmlSkeleton?: { tag, classes?, text?, src?, href?, children?: [...] },
      elementStyles?: [{ role, tag, style: { base, tablet?, mobile? }, interactiveStyles?: [...] }]
    }
  ]
}
\`\`\`

### Conversion Process (per section)

#### Step 1: Analyze the Section

Read the section's \`type\`, \`label\`, and \`htmlSkeleton\`. The skeleton shows DOM nesting with semantic hints (\`classes\`, \`text\`, \`src\`, \`href\`). Use it as the structural blueprint.

#### Step 2: Build the Node Tree

Map each skeleton node to a Meno node:

| Source element | Meno node |
|---------------|-----------|
| \`<div>\`, \`<section>\`, \`<header>\`, \`<article>\`, \`<aside>\`, \`<main>\` | \`{ "type": "node", "tag": "div" }\` |
| \`<nav>\`, \`<ul>\`, \`<ol>\`, \`<li>\` | \`{ "type": "node", "tag": "nav"/"ul"/"ol"/"li" }\` |
| \`<a>\` with href | \`{ "type": "link", "href": "{{linkPropName}}" }\` |
| \`<img>\` | \`{ "type": "node", "tag": "img", "attributes": { "src": "{{imageProp}}", "alt": "..." } }\` |
| \`<svg>\` | \`{ "type": "embed", "html": "<svg>...</svg>" }\` |
| \`<button>\` | \`{ "type": "node", "tag": "div" }\` (style as button) |
| \`<h1>\`-\`<h6>\`, \`<p>\`, \`<span>\` | \`{ "type": "node", "tag": "h1"/"p"/"span", "children": "{{textProp}}" }\` |

**Important rules:**
- Preserve the nesting structure from htmlSkeleton
- Use \`"children"\` for text content, NEVER a \`"text"\` property
- Simplify deeply nested wrapper divs when they add no layout value
- Use semantic tags where appropriate (h1-h6, p, nav, ul/li)

#### Step 3: Apply Styles from elementStyles

Each \`elementStyle\` has \`{ role, tag, style: { base, tablet?, mobile? } }\`.

Match styles to nodes by their role and tag:
- \`role: "section"\` -> root wrapper node
- \`role: "container"\` -> inner container divs
- \`role: "h1"\`-\`"h6"\` -> heading nodes
- \`role: "paragraph"\` -> paragraph nodes
- \`role: "button"\` -> button-styled nodes
- \`role: "link"\` -> link nodes
- \`role: "image"\` -> image nodes
- \`role: "repeating-item"\` -> list item template

Apply styles in Meno format:
\`\`\`json
"style": {
  "base": { "display": "flex", "gap": "24px", "padding": "80px 0" },
  "tablet": { "padding": "48px 0" },
  "mobile": { "flexDirection": "column", "padding": "32px 16px" }
}
\`\`\`

**Style rules:**
- Always include at least \`"base": {}\` even if empty
- Only include \`"tablet"\` and \`"mobile"\` keys when there are actual overrides
- All CSS property names must be camelCase
- Preserve layout properties (display, flexDirection, grid*, gap, justifyContent, alignItems)
- Preserve spacing (padding, margin)
- Preserve typography (fontSize, fontWeight, lineHeight, letterSpacing, color)
- Preserve visual properties (backgroundColor, borderRadius, border, boxShadow)

#### Step 4: Apply Interactive Styles

If an elementStyle has \`interactiveStyles\`, convert them:

\`\`\`json
"interactiveStyles": [
  {
    "prefix": "",
    "postfix": ":hover",
    "style": {
      "base": { "backgroundColor": "#333", "transform": "translateY(-2px)" }
    }
  }
]
\`\`\`

Map the analysis \`postfix\` values:
- \`:hover\` -> \`"postfix": ":hover"\`
- \`:focus\` -> \`"postfix": ":focus"\`
- \`:active\` -> \`"postfix": ":active"\`

Always set \`"prefix": ""\` unless you need ancestor-context targeting.

#### Step 5: Extract Props for the Interface

Turn dynamic content into component props:

| Content type | Prop type | Example |
|-------------|-----------|---------|
| Headings | \`string\` | \`"title": { "type": "string", "default": "Welcome" }\` |
| Paragraphs | \`string\` | \`"description": { "type": "string", "default": "Lorem ipsum..." }\` |
| Button text | \`string\` | \`"ctaText": { "type": "string", "default": "Get Started" }\` |
| Images | \`file\` | \`"heroImage": { "type": "file", "accept": "image/*", "default": "" }\` |
| Links/buttons | \`link\` | \`"ctaLink": { "type": "link", "default": { "href": "/" } }\` |
| Boolean flags | \`boolean\` | \`"showBadge": { "type": "boolean", "default": true }\` |

Use \`{{propName}}\` templates in the node tree to reference props:
\`\`\`json
{ "type": "node", "tag": "h1", "children": "{{title}}" }
\`\`\`

**Naming conventions:**
- Use descriptive camelCase names: \`title\`, \`subtitle\`, \`description\`, \`ctaText\`, \`ctaLink\`, \`heroImage\`
- For multiple items of same type, add index: \`feature1Title\`, \`feature2Title\` (only when NOT using list)
- Use the actual text content from \`content.headings\`, \`content.paragraphs\`, etc. as default values

#### Step 6: Handle Repeating Items

When a section has \`items\` with \`count > 1\`:

1. Create a **sub-component** for the repeating item (e.g., \`FeatureCard.json\`)
2. Use the \`itemSkeleton\` for its structure
3. In the parent, use a \`list\` node:

\`\`\`json
{
  "type": "list",
  "sourceType": "prop",
  "source": "items",
  "itemAs": "item",
  "style": { "base": { "display": "grid", "gridTemplateColumns": "repeat(3, 1fr)", "gap": "24px" } },
  "children": [
    {
      "type": "component",
      "component": "FeatureCard",
      "props": {
        "title": "{{item.title}}",
        "description": "{{item.description}}",
        "icon": "{{item.icon}}"
      }
    }
  ]
}
\`\`\`

4. Define the \`items\` prop as an array in the parent interface. There is no array type in Meno, so do NOT define it in the interface. The list node will receive the items prop when the user provides data.

#### Step 7: Map Colors

Read the project's \`colors.json\` to find existing CSS variables.

- If an analysis color matches a project color, use \`var(--colorName)\`
- For unmatched colors, use the hex/rgb value directly
- Common mappings:
  - Dark backgrounds -> \`var(--background)\` or direct hex
  - Text colors -> \`var(--text)\` or direct hex
  - Accent/button colors -> \`var(--primary)\` or \`var(--accent)\`

### Output Format

#### Component File (\`components/{Name}.json\`)

\`\`\`json
{
  "component": {
    "interface": {
      "title": { "type": "string", "default": "Section Title" },
      "description": { "type": "string", "default": "Description text here" },
      "ctaText": { "type": "string", "default": "Learn More" },
      "ctaLink": { "type": "link", "default": { "href": "/" } },
      "backgroundImage": { "type": "file", "accept": "image/*", "default": "" }
    },
    "structure": {
      "type": "node",
      "tag": "div",
      "style": { "base": { "padding": "80px 0" } },
      "children": [
        {
          "type": "node",
          "tag": "div",
          "style": { "base": { "maxWidth": "1200px", "margin": "0 auto" } },
          "children": [
            { "type": "node", "tag": "h2", "children": "{{title}}" },
            { "type": "node", "tag": "p", "children": "{{description}}" }
          ]
        }
      ]
    }
  }
}
\`\`\`

#### Page File (\`pages/{name}.json\`)

\`\`\`json
{
  "meta": {
    "title": "Page Title",
    "description": "Page description"
  },
  "root": {
    "type": "node",
    "tag": "div",
    "children": [
      { "type": "component", "component": "Navbar01", "props": {} },
      { "type": "component", "component": "Hero01", "props": { "title": "Welcome" } },
      { "type": "component", "component": "Features01", "props": {} },
      { "type": "component", "component": "Footer01", "props": {} }
    ]
  }
}
\`\`\`

### Naming Components

Use the \`suggestedComponent\` from each section (e.g., \`Hero01\`, \`Features01\`, \`Footer01\`). If a component with that name already exists, increment the number (e.g., \`Hero02\`).

### Page Screenshots

After analysis, per-section screenshots are captured at:
\`rendered-websites/{domain}/screenshots/section-{index}.png\`

Each screenshot corresponds to one section from \`analysis.json\` (same index).
They are cropped to the section's actual bounding rect at 1440px viewport width.
Use them as design reference when converting sections — match layout, spacing,
colors, and visual hierarchy.

### Common Pitfalls

1. **NO \`text\` property on nodes** - Always use \`children\` for text content
2. **NO \`image\` prop type** - Use \`{ "type": "file", "accept": "image/*" }\`
3. **Only ONE slot per component** - Use nested components if you need multiple content areas
4. **All JSON must be strict** - No trailing commas, no comments, no single quotes
5. **camelCase CSS properties** - \`backgroundColor\`, not \`background-color\`
6. **Don't over-nest** - Simplify wrapper divs that serve no layout purpose
7. **Don't include empty style objects** - Omit \`style\` entirely if a node needs no styling
8. **Use link type for navigation** - Map \`<a>\` to \`{ "type": "link" }\` nodes, not \`<a>\` tags
9. **Preserve responsive behavior** - Always carry over tablet/mobile style overrides from elementStyles