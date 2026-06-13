## Meno Pattern Examples

Annotated snippets of real-world patterns. Each snippet is a complete, valid Meno JSON — copy and adapt rather than reinvent.

---

### 1. Layout component (wraps every page via \`baseComponent\`)

Ship this as \`components/Layout.json\` and set \`"baseComponent": "Layout"\` in \`project.config.json\`. Every page's \`root\` then resolves inside this Layout's slot.

\`\`\`json
{
  "component": {
    "structure": {
      "type": "node",
      "tag": "div",
      "style": {
        "base": {
          "backgroundColor": "var(--bg)",
          "color": "var(--text)",
          "minHeight": "100vh",
          "display": "flex",
          "flexDirection": "column"
        }
      },
      "children": [
        { "type": "component", "component": "Navigation" },
        {
          "type": "node",
          "tag": "main",
          "style": { "base": { "flex": "1" } },
          "children": [{ "type": "slot" }]
        },
        { "type": "component", "component": "Footer" }
      ]
    },
    "interface": {}
  }
}
\`\`\`

Page using the Layout:

\`\`\`json
{
  "root": {
    "type": "component",
    "component": "Layout",
    "children": [
      { "type": "component", "component": "HeroCentered", "props": { "title": "Hello" } }
    ]
  },
  "meta": { "title": "Home", "description": "Site description" }
}
\`\`\`

---

### 2. Navigation with pure-CSS mobile menu (checkbox hack)

Hidden checkbox toggles a sibling's state via \`interactiveStyles\` with a prefix. No JS required.

\`\`\`json
{
  "component": {
    "structure": {
      "type": "node",
      "tag": "nav",
      "style": { "base": { "display": "flex", "alignItems": "center", "justifyContent": "space-between", "padding": "16px 24px" } },
      "children": [
        {
          "type": "node",
          "tag": "input",
          "attributes": { "type": "checkbox", "id": "menu-toggle" },
          "style": { "base": { "display": "none" } }
        },
        { "type": "link", "href": "/", "children": "Brand" },
        {
          "type": "node",
          "tag": "div",
          "label": "MenuItems",
          "style": {
            "base": { "display": "flex", "gap": "24px" },
            "mobile": { "display": "none", "position": "absolute", "top": "64px", "left": "0", "right": "0", "flexDirection": "column", "backgroundColor": "var(--bg)", "padding": "24px" }
          },
          "interactiveStyles": [
            {
              "name": "on menu open",
              "prefix": "#menu-toggle:checked ~ ",
              "postfix": "",
              "style": { "base": {}, "mobile": { "display": "flex" } }
            }
          ],
          "children": [
            { "type": "link", "href": "/about", "children": "About" },
            { "type": "link", "href": "/contact", "children": "Contact" }
          ]
        },
        {
          "type": "node",
          "tag": "label",
          "attributes": { "for": "menu-toggle" },
          "style": { "base": { "display": "none" }, "mobile": { "display": "block", "cursor": "pointer" } },
          "children": "☰"
        }
      ]
    },
    "interface": {}
  }
}
\`\`\`

---

### 3. Hero section with title, text, CTA, and image

Responsive two-column layout collapsing on mobile. Uses \`_mapping\` for theme variants.

\`\`\`json
{
  "component": {
    "interface": {
      "title": { "type": "string", "default": "Build something great" },
      "text": { "type": "string", "default": "A short supporting sentence about the product." },
      "ctaText": { "type": "string", "default": "Get started" },
      "ctaLink": { "type": "link", "default": { "href": "/" } },
      "image": { "type": "file", "accept": "image/*", "default": "" }
    },
    "structure": {
      "type": "node",
      "tag": "section",
      "style": {
        "base": { "display": "grid", "gridTemplateColumns": "1fr 1fr", "gap": "64px", "padding": "96px 24px", "alignItems": "center", "maxWidth": "1200px", "margin": "0 auto" },
        "tablet": { "padding": "64px 24px", "gap": "48px" },
        "mobile": { "gridTemplateColumns": "1fr", "padding": "48px 16px", "gap": "32px" }
      },
      "children": [
        {
          "type": "node",
          "tag": "div",
          "children": [
            { "type": "node", "tag": "h1", "children": "{{title}}", "style": { "base": { "fontSize": "64px", "lineHeight": "1.1", "margin": "0 0 24px" }, "mobile": { "fontSize": "40px" } } },
            { "type": "node", "tag": "p", "children": "{{text}}", "style": { "base": { "fontSize": "18px", "color": "var(--muted)", "margin": "0 0 32px" } } },
            {
              "type": "link",
              "href": "{{ctaLink}}",
              "children": "{{ctaText}}",
              "style": { "base": { "display": "inline-block", "padding": "14px 28px", "backgroundColor": "var(--text)", "color": "var(--bg)", "borderRadius": "8px", "textDecoration": "none" } },
              "interactiveStyles": [
                { "name": "on hover", "prefix": "", "postfix": ":hover", "style": { "base": { "opacity": "0.9" } } }
              ]
            }
          ]
        },
        {
          "type": "node",
          "tag": "img",
          "attributes": { "src": "{{image}}", "alt": "{{title}}", "loading": "eager" },
          "style": { "base": { "width": "100%", "height": "auto", "borderRadius": "16px" } }
        }
      ]
    }
  }
}
\`\`\`

---

### 4. Card grid rendered from a list prop

Array prop fed into a \`list\` node. The \`itemSchema\` tells the editor the shape of each item.

\`\`\`json
{
  "component": {
    "interface": {
      "columns": { "type": "select", "options": ["2", "3", "4"], "default": "3" },
      "items": {
        "type": "list",
        "itemSchema": {
          "title": { "type": "string", "default": "Feature" },
          "text": { "type": "string", "default": "Short description." },
          "icon": { "type": "string", "default": "zap" }
        }
      }
    },
    "structure": {
      "type": "node",
      "tag": "section",
      "style": { "base": { "padding": "80px 24px", "maxWidth": "1200px", "margin": "0 auto" } },
      "children": [
        {
          "type": "list",
          "sourceType": "prop",
          "source": "items",
          "itemAs": "item",
          "style": {
            "base": { "display": "grid", "gap": "24px" },
            "mobile": { "gridTemplateColumns": "1fr" }
          },
          "_mapping": {
            "gridTemplateColumns": {
              "_mapping": true,
              "prop": "columns",
              "values": { "2": "repeat(2, 1fr)", "3": "repeat(3, 1fr)", "4": "repeat(4, 1fr)" }
            }
          },
          "children": [
            {
              "type": "node",
              "tag": "div",
              "style": { "base": { "padding": "24px", "border": "1px solid var(--border)", "borderRadius": "12px" } },
              "children": [
                { "type": "node", "tag": "h3", "children": "{{item.title}}", "style": { "base": { "margin": "0 0 8px" } } },
                { "type": "node", "tag": "p", "children": "{{item.text}}", "style": { "base": { "margin": "0", "color": "var(--muted)" } } }
              ]
            }
          ]
        }
      ]
    }
  }
}
\`\`\`

---

### 5. CMS template page (one URL per item)

\`templates/posts.json\` — \`meta.source: "cms"\` and the \`cms\` schema make every item in \`cms/posts/*.json\` render at its own URL.

\`\`\`json
{
  "root": {
    "type": "component",
    "component": "Layout",
    "children": [
      {
        "type": "node",
        "tag": "article",
        "style": { "base": { "maxWidth": "720px", "margin": "0 auto", "padding": "80px 24px" } },
        "children": [
          { "type": "node", "tag": "h1", "children": "{{cms.title}}" },
          { "type": "node", "tag": "p", "children": "{{cms.excerpt}}", "style": { "base": { "color": "var(--muted)" } } },
          { "type": "node", "tag": "img", "attributes": { "src": "{{cms.featuredImage}}", "alt": "{{cms.title}}" }, "if": "{{cms.featuredImage}}" },
          { "type": "embed", "html": "{{cms.content}}" }
        ]
      }
    ]
  },
  "meta": {
    "title": "{{cms.title}}",
    "description": "{{cms.excerpt}}",
    "source": "cms",
    "cms": {
      "id": "posts",
      "name": "Blog Posts",
      "slugField": "slug",
      "urlPattern": "/blog/{{slug}}",
      "fields": {
        "title": { "type": "string", "required": true, "label": "Title" },
        "slug": { "type": "string", "required": true, "label": "URL Slug" },
        "excerpt": { "type": "text", "label": "Excerpt" },
        "content": { "type": "rich-text", "label": "Content" },
        "featuredImage": { "type": "image", "label": "Featured Image" },
        "publishedAt": { "type": "date", "label": "Publish Date" }
      }
    }
  }
}
\`\`\`

List of items on another page (e.g., \`/blog\`):

\`\`\`json
{
  "type": "list",
  "sourceType": "collection",
  "source": "posts",
  "itemAs": "post",
  "sort": { "field": "publishedAt", "order": "desc" },
  "limit": 12,
  "children": [
    {
      "type": "link",
      "href": "{{post._url}}",
      "children": [
        { "type": "node", "tag": "h3", "children": "{{post.title}}" },
        { "type": "node", "tag": "p", "children": "{{post.excerpt}}" }
      ]
    }
  ]
}
\`\`\`

---

### 6. Footer with column nav

\`\`\`json
{
  "component": {
    "structure": {
      "type": "node",
      "tag": "footer",
      "style": { "base": { "padding": "64px 24px 32px", "backgroundColor": "var(--bg)", "borderTop": "1px solid var(--border)" } },
      "children": [
        {
          "type": "node",
          "tag": "div",
          "style": {
            "base": { "display": "grid", "gridTemplateColumns": "repeat(4, 1fr)", "gap": "48px", "maxWidth": "1200px", "margin": "0 auto" },
            "mobile": { "gridTemplateColumns": "repeat(2, 1fr)" }
          },
          "children": [
            {
              "type": "node",
              "tag": "div",
              "children": [
                { "type": "node", "tag": "h4", "children": "Product", "style": { "base": { "margin": "0 0 16px" } } },
                { "type": "link", "href": "/features", "children": "Features", "style": { "base": { "display": "block", "padding": "4px 0", "color": "var(--muted)" } } },
                { "type": "link", "href": "/pricing", "children": "Pricing", "style": { "base": { "display": "block", "padding": "4px 0", "color": "var(--muted)" } } }
              ]
            }
          ]
        }
      ]
    },
    "interface": {}
  }
}
\`\`\`

---

### 7. Component with sibling \`.js\` and \`.css\` (FAQ toggle)

Three files work together: \`FaqItem.json\`, \`FaqItem.js\`, \`FaqItem.css\`.

\`components/FaqItem.json\`:
\`\`\`json
{
  "component": {
    "interface": {
      "question": { "type": "string", "default": "Question?" },
      "answer": { "type": "rich-text", "default": "<p>Answer.</p>" }
    },
    "structure": {
      "type": "node",
      "tag": "div",
      "style": { "base": { "borderBottom": "1px solid var(--border)" } },
      "children": [
        {
          "type": "node",
          "tag": "button",
          "attributes": { "data-el": "question", "type": "button" },
          "style": { "base": { "width": "100%", "padding": "16px 0", "textAlign": "left", "background": "none", "border": "none", "cursor": "pointer", "fontSize": "18px" } },
          "children": "{{question}}"
        },
        {
          "type": "node",
          "tag": "div",
          "attributes": { "data-el": "answer" },
          "style": { "base": { "maxHeight": "0", "overflow": "hidden", "transition": "max-height 0.2s" } },
          "interactiveStyles": [
            { "name": "when open", "prefix": ".is-open ", "postfix": " [data-el='answer']", "style": { "base": { "maxHeight": "400px", "paddingBottom": "16px" } } }
          ],
          "children": [{ "type": "embed", "html": "{{answer}}" }]
        }
      ]
    }
  }
}
\`\`\`

\`components/FaqItem.js\` (\`el\` and \`props\` are auto-injected; never use \`export default\`):
\`\`\`javascript
const question = el.querySelector('[data-el="question"]');
question?.addEventListener('click', () => {
  el.classList.toggle('is-open');
});
\`\`\`

\`components/FaqItem.css\` (optional; sibling file auto-linked to the component):
\`\`\`css
/* Additional custom CSS beyond style objects */
[data-el="question"]::after {
  content: "+";
  float: right;
}
.is-open [data-el="question"]::after {
  content: "−";
}
\`\`\`

---

### 8. Page meta with SEO, per-locale slugs, and custom head code

\`\`\`json
{
  "meta": {
    "title": { "_i18n": true, "en": "About", "pl": "O nas" },
    "description": "Learn more about our team.",
    "ogImage": "/images/og-about.webp",
    "slugs": { "en": "/about", "pl": "/o-nas" },
    "customCode": {
      "head": "<script defer src=\\"https://plausible.io/js/script.js\\" data-domain=\\"example.com\\"></script>"
    }
  },
  "root": { "type": "component", "component": "Layout", "children": [] }
}
\`\`\`

\`hreflang\` alternates and \`<link rel="canonical">\` are emitted automatically from \`siteUrl\` + \`i18n.locales\` + \`slugs\`.