---
description: Load Meno documentation for a specific topic
allowed-tools: Read, Glob
---

# Meno Documentation Loader

Load Meno documentation for the specified topic to provide context for your task.

## Usage

```
/meno-docs [topic]
```

## Available Topics

| Topic | Description |
|-------|-------------|
| `core` | Essential editing rules, node types, style objects |
| `components` | Component interfaces, props, slots, structure |
| `cms-schema` | CMS collections, field types, URL patterns |
| `list` | List node iteration (prop-based and CMS) |
| `styling` | Interactive styles, hover/focus states |
| `javascript` | defineVars, vanilla JS, component communication |
| `embeds` | Raw HTML/SVG content injection |
| `localization` | Locale list for language switching |
| `conditional` | Conditional rendering with `if` property |
| `libraries` | External scripts and CSP configuration |
| `redirects` | URL redirects for static hosting |
| `meno-filter` | Client-side filtering with data attributes |
| `meno-filter-api` | MenoFilter JavaScript API |
| `website-convert` | Converting imported website analysis to Meno components |
| `comments` | Reading & resolving pinned review comments via files (feedback queue) |

## Instructions

$ARGUMENTS contains the topic requested by the user.

1. Parse the topic from $ARGUMENTS (e.g., "components", "cms-schema")
2. If no topic provided or topic is "all", list available topics
3. Read the documentation file from `.claude/docs/meno/{topic}.md`
4. Present the documentation content to help with the current task

### Topic Aliases
- `cms` → `cms-schema`
- `filter` → `meno-filter`
- `filter-api` → `meno-filter-api`
- `js` → `javascript`
- `styles` → `styling`
- `convert` → `website-convert`
- `import` → `website-convert`
- `comment` → `comments`

### Multi-topic Loading
If user requests multiple topics (comma-separated), load all of them:
- `/meno-docs components,styling` → Load both components and styling docs

## Example

User: `/meno-docs components`

Response: Read and present the content of `.claude/docs/meno/components.md`
