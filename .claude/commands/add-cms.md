---
description: Add a new CMS collection
allowed-tools: Read, Write, Glob
---

# Add CMS Collection

Set up a new CMS collection with its template page and sample content.

## Usage

```
/add-cms [content type]
```

## Instructions

1. **Understand the request**: Parse $ARGUMENTS for the content type
2. **Design the schema**: Choose appropriate field types for the content
3. **Create files**:
   - `src/pages/{collection}/[slug].astro` — the collection's **template page** (a
     dynamic route; the CMS schema lives in `meta.cms`)
   - `src/content/{collection}/{item}.json` — one or more sample content items

## Key Rules

### The template page is a dynamic route

A collection's schema is carried by its **template page**, an idiomatic Astro dynamic
route at `src/pages/<collection>/[slug].astro`. The route **directory** comes from
`meta.cms.urlPattern` — `/blog/{{slug}}` → `src/pages/blog/[slug].astro`. The template's
`meta.source === "cms"` marks it as a CMS page, and `meta.cms` holds the schema (`id`,
`name`, `slugField`, `urlPattern`, `fields`).

```astro
---
import { getCollection } from 'astro:content';
import { i18n } from 'meno-astro';
import { BaseLayout, Embed } from 'meno-astro/components';

export async function getStaticPaths() {
  const entries = await getCollection("posts");
  return entries.map((entry) => ({
    params: { slug: entry.data.slug ?? entry.id },
    props: { cms: entry.data },
  }));
}

const { cms } = Astro.props;

const meta = {
  title: "{{cms.title}}",
  description: "{{cms.excerpt}}",
  source: "cms",
  cms: {
    id: "posts",
    name: "Blog Posts",
    slugField: "slug",
    urlPattern: "/blog/{{slug}}",
    fields: {
      title: { type: "string", required: true, label: "Title" },
      slug: { type: "string", required: true, label: "URL Slug" },
      excerpt: { type: "text", label: "Excerpt" },
      content: { type: "rich-text", label: "Content" },
      image: { type: "image", label: "Featured Image" },
      publishedAt: { type: "date", label: "Publish Date" }
    }
  }
};
---
<BaseLayout meta={meta}>
  <article>
    <h1>{i18n(cms.title)}</h1>
    <p>{i18n(cms.excerpt)}</p>
    <Embed html={i18n(cms.content)} />
  </article>
</BaseLayout>
```

The `content` field is **rich-text**, so it renders through `<Embed html={…} />` (a
`set:html` injector) — **not** `{i18n(cms.content)}`. See "Rendering fields in the body" below.

**`meta.cms` is the source of truth — edit it, not the boilerplate.** The
`import { getCollection }`, the `getStaticPaths()` function, and
`const { cms } = Astro.props;` are **derived boilerplate**: they're regenerated from
`meta.cms` on save and the parser skips them. Author them as shown, but design the
collection by editing `meta.cms` (and the body). In the Meno editor the template is
addressed as `/templates/<collectionId>`.

### Rendering fields in the body

The current item is `cms`. The `i18n` wrapper resolves a per-locale value to the active
locale (and passes plain strings through). Render depends on the field **type**:

- **Plain fields** (`string` / `text` / `number` / `date` / `select` / `boolean` /
  `image` / `reference`) → a text interpolation `{i18n(cms.field)}`.
- **Rich-text fields** → `<Embed html={i18n(cms.field)} />` (needs
  `import { Embed } from 'meno-astro/components';`). `Embed` is a `set:html` injector that
  renders the field's HTML. A rich-text value is a structured object, so a plain text
  interpolation `{i18n(cms.richField)}` would print `[object Object]` and **must not** be
  used — rich-text always goes through `<Embed>`.

```astro
<h1>{i18n(cms.title)}</h1>          <!-- string field   -->
<p>{i18n(cms.excerpt)}</p>          <!-- text field     -->
<Embed html={i18n(cms.content)} />  <!-- rich-text field -->
```

A whole-string Meno template `"{{cms.title}}"` (e.g. in `meta.title`) is fine in
frontmatter literals; in markup, write a plain field as a JSX expression
`{i18n(cms.field)}` and a rich-text field as `<Embed html={i18n(cms.field)} />`.

### Field Types
| Type | Description | Example Default |
|------|-------------|-----------------|
| `string` | Single line text | `""` |
| `text` | Multi-line text | `""` |
| `rich-text` | HTML / rich content (render via `<Embed html={i18n(cms.field)} />`) | `"<p></p>"` |
| `number` | Numeric value | `0` |
| `boolean` | True/false | `false` |
| `image` | Image file path | `""` |
| `date` | ISO date string | `""` |
| `select` | Dropdown options | `"draft"` |
| `reference` | Link to other item | `""` |

A `select` field carries its choices and a default:

```astro
status: {
  type: "select",
  options: ["draft", "published"],
  default: "draft",
  label: "Status"
}
```

### Content item structure

Sample items live as **JSON** files under `src/content/<collection>/`. Each item file
**MUST** include `_id` (matching the filename stem) and `_createdAt` (an ISO timestamp).
An unpublished edit is a sibling `<name>.draft.json` — the published item is the one
**without** `.draft`; draft sidecars are excluded from builds and read surfaces.

```json
// src/content/posts/hello-world.json
{
  "_id": "hello-world",
  "_createdAt": "2024-01-15T10:00:00.000Z",
  "title": "Hello World",
  "slug": "hello-world",
  "excerpt": "My first blog post",
  "content": "<p>Welcome to my blog!</p>",
  "image": "/images/hero.webp",
  "publishedAt": "2024-01-15"
}
```

Field keys must match `meta.cms.fields` on the template page.

### content.config.ts (don't author by hand)

`src/content.config.ts` carries a **permissive generated schema** for each collection so
that `astro build` can resolve it. It is **not** the source of truth for the collection's
fields — the template page's `meta.cms` is. Don't redefine your field schema there; keep
`meta.cms` and the item files consistent with each other.

### Rendering a list of CMS items elsewhere

To list a collection on another page, add a frontmatter
`getCollectionList("posts", { … }, Astro)` const and map it in the body (loop var
defaults to the singularized collection name):

```astro
---
import { getCollectionList } from 'meno-astro';
import { Link } from 'meno-astro/components';

const postList = await getCollectionList("posts", {
  sort: { field: "publishedAt", order: "desc" },
  limit: 10
}, Astro);
---
{ postList.map((post, postIndex) => (
  <Link href={post._url}>
    <h3>{i18n(post.title)}</h3>
    <p>{i18n(post.excerpt)}</p>
  </Link>
)) }
```

The same field-type rule applies inside a list: a plain field on a loop item is
`{i18n(post.field)}`, a rich-text field is `<Embed html={i18n(post.field)} />`.

## Reference

- CMS template skeleton + grammar: the `/meno-astro` skill
  (`.claude/commands/meno-astro.md`)
- Dialect spec: `.claude/docs/meno/meno-astro-dialect.md`
- Real example: the adv-19 / example astro project (`src/pages/blog/[slug].astro`,
  `src/content/posts/*.json`, `src/content.config.ts`)

## Example

User: `/add-cms blog posts`

Actions:
1. Create `src/pages/posts/[slug].astro` with:
   - `meta.source: "cms"` and a `meta.cms` schema (id, name, slugField, urlPattern, fields)
   - the derived `getCollection`/`getStaticPaths`/`const { cms } = Astro.props` boilerplate
   - a body rendering plain fields via `{i18n(cms.field)}` and rich-text fields via
     `<Embed html={i18n(cms.field)} />`
2. Create `src/content/posts/hello-world.json` (with `_id` + `_createdAt`)
3. Note that `src/content.config.ts` already carries a permissive schema for the build;
   `meta.cms` remains the source of truth for fields
