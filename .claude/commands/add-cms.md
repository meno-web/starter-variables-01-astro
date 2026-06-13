---
description: Add a new CMS collection
allowed-tools: Read, Write, Glob
---

# Add CMS Collection

Set up a new CMS collection with schema, template page, and sample content.

## Usage

```
/add-cms [content type]
```

## Instructions

1. **Understand the request**: Parse $ARGUMENTS for the content type
2. **Design the schema**: Choose appropriate field types for the content
3. **Create files**:
   - `templates/{collection}.json` - Template page with CMS schema
   - `cms/{collection}/sample.json` - Sample content item

## Key Rules

### Schema Location
The `cms` object goes **inside** `meta`, not at root level. Also set `meta.source: "cms"` so the runtime knows this is a template page:
```json
{
  "meta": {
    "title": "{{cms.title}}",
    "source": "cms",
    "cms": {
      "id": "posts",
      "name": "Blog Posts",
      "slugField": "slug",
      "urlPattern": "/blog/{{slug}}",
      "fields": { ... }
    }
  }
}
```

### Field Types
| Type | Description | Example Default |
|------|-------------|-----------------|
| `string` | Single line text | `""` |
| `text` | Multi-line text | `""` |
| `rich-text` | HTML content | `"<p></p>"` |
| `number` | Numeric value | `0` |
| `boolean` | True/false | `false` |
| `image` | Image file path | `""` |
| `date` | ISO date string | `""` |
| `select` | Dropdown options | `"draft"` |
| `reference` | Link to other item | `""` |

### Schema Example
```json
"cms": {
  "id": "posts",
  "name": "Blog Posts",
  "slugField": "slug",
  "urlPattern": "/blog/{{slug}}",
  "fields": {
    "title": { "type": "string", "required": true },
    "slug": { "type": "string", "required": true },
    "excerpt": { "type": "text" },
    "content": { "type": "rich-text" },
    "image": { "type": "image" },
    "publishedAt": { "type": "date" },
    "status": {
      "type": "select",
      "options": ["draft", "published"],
      "default": "draft"
    }
  }
}
```

### Content Item Structure

**Every CMS item file MUST include `_id`, `_filename`, and `_createdAt` — the CMS will not list items missing these fields.** Use a short random id, a slug-like filename, and the current ISO timestamp.

```json
// cms/posts/hello-world.json
{
  "_id": "abc123",
  "_filename": "hello-world",
  "_createdAt": "2024-01-15T10:00:00Z",
  "title": "Hello World",
  "slug": "hello-world",
  "excerpt": "My first blog post",
  "content": "<p>Welcome to my blog!</p>",
  "image": "/uploads/hero.jpg",
  "publishedAt": "2024-01-15",
  "status": "published"
}
```

### Template Interpolation
Use `{{cms.fieldName}}` in templates:
```json
{
  "tag": "h1",
  "children": "{{cms.title}}"
}
```

### Creating CMS Directory
Ensure the collection directory exists:
```
cms/
  posts/
    hello-world.json
    another-post.json
```

### Rendering a list of CMS items

Use a `list` node with `sourceType: "collection"` on any page:

```json
{
  "type": "list",
  "sourceType": "collection",
  "source": "posts",
  "itemAs": "post",
  "sort": { "field": "publishedAt", "order": "desc" },
  "limit": 10,
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
```

## Reference

- Schema details: `.claude/docs/meno/cms-schema.md`
- Copy-ready CMS template snippet: `.claude/docs/meno/examples.md`

## Example

User: `/add-cms blog posts`

Actions:
1. Create `templates/posts.json` with:
   - Meta with title template and CMS schema
   - Body with article layout for content
2. Create `cms/posts/` directory
3. Create `cms/posts/sample-post.json` with example content
