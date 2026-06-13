## CMS Schema Definition

Meno has a built-in CMS for managing dynamic content. Collection names are user-defined based on content type.

### Creating a Collection From Scratch — Required Checklist

A collection needs **all three** of these to appear in the editor and resolve at runtime. The editor creates them automatically; external writers (AI tools, scripts) must produce each one explicitly. Blank projects ship with **neither** \`templates/\` nor \`cms/\` — both folders must be created the first time.

1. **Template page** — \`templates/{collection_id}.json\` with \`meta.source: "cms"\` and the \`cms\` schema **inside \`meta\`** (see schema below). The filename's stem must match \`schema.id\`.
2. **Items directory** — \`cms/{collection_id}/\` must exist (use \`mkdir -p\` before writing the first item).
3. **At least one item file** — \`cms/{collection_id}/{id}.json\` with the required system field \`_id\` (matching the file's stem, slug-shaped) plus \`_createdAt\` (see "Required System Fields" below). The collection appears empty in the editor with no error surfaced if items fail validation.

Field-key naming rule: keys must be valid JS identifiers (\`[a-zA-Z_][a-zA-Z_0-9]*\`). Use camelCase or snake_case — kebab-case keys (e.g. \`"featured-image"\`) break \`{{cms.field}}\` template lookups since \`-\` is parsed as subtraction.

### CMS File Structure
\`\`\`
project/
├── templates/         # CMS template pages (one per collection)
│   └── {collection}.json    # e.g., posts.json, products.json, team.json
└── cms/                     # CMS item data
    └── {collection}/        # Folder matches collection ID
        └── {item}.json      # One JSON file per item
\`\`\`

### Defining a CMS Collection
Create a template page at \`templates/{collection}.json\`. Add \`source: "cms"\` and a \`cms\` schema INSIDE \`meta\`:

**CRITICAL: The \`cms\` object MUST be inside \`meta\`, not at root level!**

\`\`\`json
{
  "root": {
    "type": "node",
    "tag": "article",
    "children": [
      {
        "type": "component",
        "component": "Heading",
        "props": { "text": "{{cms.title}}" }
      },
      {
        "type": "node",
        "tag": "div",
        "children": "{{cms.content}}"
      }
    ]
  },
  "meta": {
    "title": "{{cms.title}}",
    "source": "cms",
    "cms": {
      "id": "posts",
      "name": "Blog Posts",
      "slugField": "slug",
      "urlPattern": "/posts/{{slug}}",
      "fields": {
        "title": { "type": "string", "label": "Title", "required": true },
        "slug": { "type": "string", "label": "URL Slug", "required": true },
        "excerpt": { "type": "text", "label": "Excerpt" },
        "content": { "type": "rich-text", "label": "Content" },
        "author": { "type": "reference", "label": "Author", "collection": "team" },
        "featured": { "type": "boolean", "label": "Featured", "default": false }
      }
    }
  }
}
\`\`\`

**Schema properties:**
- \`id\` — Collection identifier. Must match \`templates/{id}.json\` filename stem and \`cms/{id}/\` folder name. Letters, numbers, underscore, hyphen only.
- \`name\` — Display label for the collection shown in the editor's CMS panel dropdown. Cosmetic only; does not affect storage, URLs, or templates. If omitted, the editor falls back to \`id\`.
- \`slugField\` — **Always set to the literal string \`"slug"\`.** Collections created through the editor are locked to this — the editor does not let users rename or reassign it. When hand-authoring a schema, write \`"slugField": "slug"\` and define a matching \`slug\` field of type \`string\` with \`required: true\` in \`fields\`.
- \`urlPattern\` — URL template. The placeholder is always the literal string \`{{slug}}\` and Meno substitutes it with \`item.slug\` (falling back to \`_filename\`, \`_id\` if the value is missing). Example: \`urlPattern: "/posts/{{slug}}"\` + \`item.slug: "hello"\` → \`/posts/hello\`.
- \`fields\` — Field definitions. Each field is keyed by its identifier (used in templates as \`{{cms.<key>}}\`) and carries \`type\` plus optional \`label\`, \`required\`, \`default\`, \`options\`. **Every collection MUST include two structural fields with these exact keys: \`slug\` (type \`string\`, \`required: true\`) — backs the URL, and \`title\` (type \`string\`, \`required: true\`) — drives the items-list label, the \`_filename\` auto-generation, and the auto-slug-from-title behavior in the editor.** Both keys are locked in the editor UI (their \`name\` cannot be renamed and they cannot be deleted). Any other fields are user-defined.
- \`clientData\` (optional) — Expose collection items to client-side JS (required for MenoFilter on this collection — see below).

**Field properties:**
- \`type\` (required) — see the field types table below.
- \`label\` (optional) — User-facing display name shown above the input in the editor's item form, and editable from the Fields list when defining a collection. Cosmetic only; does not affect storage, slugs, or template lookups (\`{{cms.<key>}}\` still uses the field's \`name\`/JSON key, not the label). If omitted, the editor falls back to the raw field key. Use this to rename \`"title"\` to \`"Name"\`, \`"Heading"\`, etc., without breaking the structural \`title\` key.
- \`required\` (optional, boolean) — Validated when items are saved through the editor; flagged in the UI with an asterisk.
- \`default\` (optional) — Initial value when a new item is created.
- \`options\` / \`collection\` / \`multiple\` / \`accept\` — type-specific (see field types table).

### CMS Field Types

**Note:** CMS field types are a SEPARATE type system from component interface prop types. \`image\` is a valid CMS field type here, but it is NOT a valid component interface type — for component props use \`{ "type": "file", "accept": "image/*" }\` instead. See \`CLAUDE.md\` for the interface prop types.

| Type | Description | Options |
|------|-------------|---------|
| \`string\` | Single line text | - |
| \`text\` | Multi-line textarea | - |
| \`rich-text\` | HTML rich text editor (stored as Tiptap JSON) | - |
| \`number\` | Numeric value | - |
| \`boolean\` | True/false toggle | \`default\` (also valid on \`string\`, \`text\`, \`number\`, \`date\`, \`select\`) |
| \`image\` | Image file path | - |
| \`file\` | Any file upload | \`accept: "application/pdf"\` |
| \`date\` | Date/datetime picker | - |
| \`select\` | Dropdown selection | \`options: ["a", "b"]\`, \`multiple: true\` |
| \`reference\` | Link to another collection | \`collection: "team"\` |

There is no separate \`i18n\` or \`i18n-text\` field type — \`string\`, \`text\`, and \`rich-text\` are auto-localizable at the value level (see **Localizing CMS items** below).

CMS \`rich-text\` values are stored as Tiptap JSON by the editor; the SSR pipeline converts them to HTML via the allowlist in \`packages/core/lib/shared/richtext/tiptapToHtml.ts\`. For the inline HTML vocabulary when hand-writing \`rich-text\` prop values in page/component JSON, see \`components.md\` → **Writing rich-text values inline**.

### Localizing CMS items

When a project has multiple locales declared in \`project.config.json\` and you want CMS content translated, **do not change the field types** in the template schema. Instead, replace each field's value on the item with an \`_i18n\` object. The SSR pipeline auto-detects this shape and resolves to the active locale.

**Two value shapes per field — pick per field:**

| Field's value on disk | Effect |
|-----------------------|--------|
| Plain string: \`"Hello"\` | Same value in every locale (no translation). |
| \`_i18n\` object: \`{"_i18n": true, "en": "Hello", "pl": "Cześć"}\` | Resolved to the active locale's string; falls back to \`defaultLocale\` then any available value. |

**The slug field can also be \`_i18n\`** — that's how you get per-locale URLs without changing \`urlPattern\`. Example: \`urlPattern: "/blog/{{slug}}"\` + \`slug: {"_i18n": true, "en": "hello", "pl": "czesc"}\` resolves to \`/blog/hello\` and \`/pl/blog/czesc\`.

**Worked example** — \`cms/posts/hello.json\` translated to English + Polish:

\`\`\`json
{
  "_id": "hello",
  "_createdAt": "2024-01-15T10:00:00Z",
  "title": { "_i18n": true, "en": "Hello world", "pl": "Witaj świecie" },
  "slug":  { "_i18n": true, "en": "hello", "pl": "witaj" },
  "excerpt": { "_i18n": true, "en": "First post", "pl": "Pierwszy wpis" },
  "content": { "_i18n": true, "en": "<p>Hello!</p>", "pl": "<p>Witaj!</p>" },
  "publishedAt": "2024-01-15",
  "featured": true
}
\`\`\`

**What to translate, what to leave alone:**
- **Translate**: every \`string\`, \`text\`, or \`rich-text\` schema field that holds user-visible content, including the slug field.
- **Don't translate**: \`_id\`, \`_createdAt\`, \`_filename\` (stable identifiers); \`number\`, \`boolean\`, \`date\`, \`select\`, \`reference\`, \`image\`, \`file\` (not strings).

To localize a whole site end-to-end, translate three places: (1) component prop defaults and page \`meta.*\` strings in pages/templates (covered in \`CLAUDE.md\` → Locales & i18n), (2) **CMS item field values** (this section), (3) per-locale URL slugs (\`meta.slugs\` for static pages, \`_i18n\` slug-field values for CMS items).

### Required System Fields

The editor writes these automatically when creating items. External writers (AI tools, scripts, this CLI) must populate them explicitly. Validation is enforced by \`validateCMSItem\` in the file-system provider — failures are logged to stderr (\`console.warn\`) and the item is dropped from the result set, so the user sees an empty collection with no UI error.

- \`_id\` — Canonical identifier. Must equal the filename on disk without the \`.json\` extension (\`hello-world.json\` → \`"_id": "hello-world"\`). Never changes after creation. Reference fields in other collections target this value. **When authoring items by hand, set \`_id\` and the slug-field value to the same slugified string** (e.g. \`_id: "hello-world"\` + \`slug: "hello-world"\`) — diverging values are legal but confuse URL resolution.
- \`_createdAt\` — ISO creation timestamp.
- \`_filename\` (legacy alias) — Older projects may have this set to the on-disk filename's stem. The provider backfills it from the filename on read; new items do not need to write it. If you're updating an item that already has \`_filename\` and it differs from \`_id\` (legacy data with custom \`_id\` values like \`"post-001"\`), leave both fields alone.

**Minimal valid CMS item file** — \`cms/posts/hello-world.json\` (note: the parent \`cms/posts/\` directory must exist before writing this file):
\`\`\`json
{
  "_id": "hello-world",
  "_createdAt": "2024-01-15T10:00:00Z",
  "title": "Hello World",
  "slug": "hello-world",
  "excerpt": "My first post",
  "content": "<p>Hello!</p>"
}
\`\`\`

### Reference Fields
Link collections using \`type: "reference"\` with a \`collection\` option:

\`\`\`json
"author": { "type": "reference", "label": "Author", "collection": "team" }
\`\`\`

**On disk** a reference value is a string — the referenced item's \`_filename\` (or \`_id\` as fallback). Multi-references (\`multiple: true\`) are stored as a string array. Example: \`"author": "jane-smith"\` or \`"tags": ["react", "ssr"]\`.

**Meno does not auto-expand references in template strings.** \`{{cms.author}}\` will print the raw filename string, not the full author object. To render fields from a referenced item, use a nested CMS list whose \`source\` is the reference field — \`getItemsByIds\` then fetches the linked items and you can access their fields inside the list with the loop variable (\`{{author.name}}\`, etc.).

### Template Access — System & i18n Fields

Each CMS item is exposed to templates with a few computed/system fields in addition to its schema fields:

| Token | What it resolves to |
|-------|---------------------|
| \`{{item._url}}\` (in lists) | URL produced from \`urlPattern\`, locale-aware. Added by the SSR list renderer via \`addItemUrl\`. |
| \`{{cms._url}}\` (in template pages) | **Not auto-injected** — \`cmsContext.cms\` in a template page is the raw item from disk. If you need the URL, build it yourself from \`urlPattern\` + the slug field. |
| \`{{item._id}}\`, \`{{item._createdAt}}\` | System fields written to disk. \`{{item._filename}}\` is a legacy alias kept on the in-memory item by the provider and equals the on-disk filename's stem. |
| \`{{item.field}}\`, \`{{cms.field}}\` (when the field's value is an \`_i18n\` object) | Resolved to the **active locale's** string automatically — both the CMS-template processor and the item-template processor call \`resolveI18nValue\`. Falls back to \`defaultLocale\` then any available value. See **Localizing CMS items** above for how to write \`_i18n\` values. |

### Per-locale Visibility — \`_draftLocales\`

Each CMS item may carry a \`_draftLocales: string[]\` system field. It is the on-disk representation of the CMS edit panel's **Visibility** section.

- \`undefined\` or \`[]\` → item is published in every locale.
- \`["pl", "de"]\` → item is hidden from the Polish and German builds, published everywhere else.
- Single-locale projects use the same field with a one-element array.

\`\`\`json
{
  "_id": "hello-world",
  "_draftLocales": ["pl"],
  "title": { "_i18n": true, "en": "Hello", "pl": "Cześć" }
}
\`\`\`

**Don't confuse this with the WIP draft-version concept.** A draft *version* is a sibling \`{filename}.draft.json\` file holding unpublished edits; \`_draftLocales\` lives on the live item and only controls publication visibility per locale. The field name is preserved for backward compatibility.

In **template pages** (\`templates/{collection}.json\`) the current item is exposed as \`cms\` (e.g. \`{{cms.title}}\`). In **CMS lists** elsewhere the loop variable is whatever you set on the list node (\`itemAs: "post"\` → \`{{post.title}}\`, default \`item\`).

### Client-Side Data — \`clientData\`

To run MenoFilter (or any client-side JS) over a collection, expose its items to the client. Add a \`clientData\` block to the schema:

\`\`\`json
"cms": {
  "id": "posts",
  ...
  "clientData": {
    "enabled": true,
    "strategy": "static",
    "fields": ["title", "slug", "category", "publishedAt", "featured"]
  }
}
\`\`\`

| Property | Type | Purpose |
|----------|------|---------|
| \`enabled\` | \`boolean\` | Required. Without this MenoFilter loads zero items — count stays 0, nothing filters. |
| \`strategy\` | \`'inline'\` \\| \`'static'\` \\| \`'auto'\` | Where the data lives at build time. **Read the per-strategy notes below before choosing.** |
| \`threshold\` | \`number\` | Item count cutoff for \`auto\` strategy. Default \`500\`. |
| \`fields\` | \`string[]\` | Allowlist of fields to expose. System fields (\`_id\`, \`_url\`, \`_filename\`, \`_slug\`) are always included. Omit to expose all fields. **Trim aggressively** — every field ships in the payload. |

**Strategy outcomes — choose carefully:**

- \`"static"\` (recommended for nearly all filtering) → writes \`dist/data/{id}/index.json\` once. Any page can fetch it. **The only strategy that works for filtering on static pages** (\`pages/*.json\` or components mounted there).
- \`"inline"\` → emits \`<script type="application/json" id="meno-cms-{id}">[...]</script>\` **only into the rendered HTML of CMS template pages** (\`templates/{id}.json\`, one HTML output per item). Static pages don't get the inline script and \`/data/{id}/index.json\` isn't written either, so a static-page filter will fetch a 404 and show zero results. Use \`inline\` only when a CMS template page is filtering its own collection.
- \`"auto"\` → resolves to \`inline\` if \`items.length <= threshold\`, else \`static\`. **Unsafe on static pages** because small collections fall to \`inline\` (the failure mode above). Prefer explicit \`"static"\` whenever the filter wrapper isn't on a CMS template page.

**Required for filtering.** A \`data-meno-filter="posts"\` wrapper without \`posts.cms.clientData.enabled\` will load zero items — the count display goes to 0 and no items match any filter. Pair this with \`emitTemplate: true\` on the list node; see \`meno-filter.md\` → **Filtering a CMS collection** for the full wiring including the optional \`data-id\` SSR-reuse optimisation.

### Common Collection Examples
- Blog: \`/posts/{{slug}}\` -> \`/posts/my-first-article\`
- Products: \`/products/{{slug}}\` -> \`/products/premium-widget\`
- Team: \`/team/{{slug}}\` -> \`/team/jane-smith\`
- Case Studies: \`/work/{{slug}}\` -> \`/work/client-redesign\`