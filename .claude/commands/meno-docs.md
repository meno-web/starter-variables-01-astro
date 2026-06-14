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
| `meno-astro-dialect` | The `.astro` dialect grammar — page/component shape, round-tripping |
| `meno-astro-api` | Studio dev-server API surface (format-transparent reads/writes) |
| `javascript` | defineVars, vanilla JS, component communication |
| `libraries` | External scripts and CSP configuration |
| `redirects` | URL redirects for static hosting |
| `meno-filter` | Client-side filtering with data attributes |
| `meno-filter-api` | MenoFilter JavaScript API |
| `studio-port` | Resolving the Studio editor port (non-interactive) |
| `extract-components-catalog` | Catalog of UI primitives / block components to mine |
| `import-site-loop` | The import pipeline loop and checkpointing |

## Instructions

$ARGUMENTS contains the topic requested by the user.

1. Parse the topic from $ARGUMENTS (e.g., "components", "meno-astro-dialect")
2. If no topic provided or topic is "all", list available topics
3. Read the documentation file from `.claude/docs/meno/{topic}.md`
4. Present the documentation content to help with the current task

### Topic Aliases
- `dialect` → `meno-astro-dialect`
- `api` → `meno-astro-api`
- `filter` → `meno-filter`
- `filter-api` → `meno-filter-api`
- `js` → `javascript`
- `port` → `studio-port`
- `catalog` → `extract-components-catalog`
- `import` → `import-site-loop`

### Multi-topic Loading
If user requests multiple topics (comma-separated), load all of them:
- `/meno-docs components,libraries` → Load both components and libraries docs

## Example

User: `/meno-docs components`

Response: Read and present the content of `.claude/docs/meno/components.md`
