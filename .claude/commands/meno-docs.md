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
| `meno-astro-dialect` | The `.astro` dialect grammar — page/component shape, round-tripping |
| `meno-migration-docs` | Webflow / pure-CSS → Meno migration playbook (manual, component-first) |
| `javascript` | defineVars, vanilla JS, component communication |
| `libraries` | External scripts and CSP configuration |
| `redirects` | URL redirects for static hosting |
| `studio-port` | Resolving the Studio editor port (non-interactive) |

## Instructions

$ARGUMENTS contains the topic requested by the user.

1. Parse the topic from $ARGUMENTS (e.g., "components", "meno-astro-dialect")
2. If no topic provided or topic is "all", list available topics
3. Read the documentation file from `.claude/docs/meno/{topic}.md`
4. Present the documentation content to help with the current task

### Topic Aliases
- `dialect` → `meno-astro-dialect`
- `migration` → `meno-migration-docs`
- `js` → `javascript`
- `port` → `studio-port`

### Multi-topic Loading
If user requests multiple topics (comma-separated), load all of them:
- `/meno-docs dialect,javascript` → Load both the dialect and javascript docs

## Example

User: `/meno-docs dialect`

Response: Read and present the content of `.claude/docs/meno/meno-astro-dialect.md`
