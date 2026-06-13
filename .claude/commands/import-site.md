---
description: Convert a live website URL into a finished Meno project (pages, components, CMS, interactive styles). Resumes from a checkpoint if invoked twice for the same URL.
allowed-tools: Task, Bash, Read, Write, Edit, Glob, Grep, TodoWrite
argument-hint: "<url>"
---

# /import-site $ARGUMENTS

You have been asked to import a website end-to-end into the current Meno project.

This is the **one-shot** entry point. If the user wants to walk through the import step by step instead, the individual phases are available as standalone skills — see "Step-by-step alternative" at the bottom.

**Prerequisite:** the Meno app drives Playwright against the user's installed Google Chrome. If the Playwright sidecar returns `CHROME_NOT_INSTALLED`, tell the user to install Chrome from https://www.google.com/chrome/ and re-run `/import-site` — do not retry.

## What to do

1. **Validate the argument.** `$ARGUMENTS` must be a single http(s) URL. If it's empty, malformed, or non-http, stop and ask the user for a valid URL.

2. **Delegate to the `site-importer` subagent** via the Task tool. The subagent has its own playbook and runs autonomously — do not duplicate its work here.

```
Task({
  description: "Import <domain> into Meno",
  subagent_type: "site-importer",
  prompt: "Import the website at <url> into the current Meno project. Follow .claude/docs/meno/import-site-loop.md exactly. Run to completion and report at the end."
})
```

3. **When the subagent returns**, print its final report verbatim and stop. Do not summarize, embellish, or kick off follow-up work — the user will decide what to do next.

## If the subagent halts mid-run

The subagent writes a checkpoint to `.claude/plans/progress/import-<domain>-checkpoint.md`. If it stops with unresolved work, tell the user:

```
The import stopped before completing. Re-run `/import-site <url>` to resume from the checkpoint at .claude/plans/progress/import-<domain>-checkpoint.md
```

Do not try to manually patch up partial state — re-invoking the command is the supported resume path.

## Step-by-step alternative

If the user wants control over the import, point them at the individual skills that cover the same pipeline:

| Stage | Skill |
|---|---|
| 1. Pre-flight: see what's at the URL before importing | **`/sitemap <url>`** — classifies template-groups vs unique pages |
| 2. Refresh design tokens only (no pages, no components) | **`/import-design-tokens <url>`** — writes `variables.json` + `colors.json` |
| 3. CMS template families (independent — runs without a library) | **`/import-cms <url> [--group=<pattern>]`** |
| 4. Specific unique pages (assumes library exists) | **`/import-pages <url1> <url2> …`** |
| 5. Carve a saved page into Layout + section components | **`/split-page <slug>`** |
| 6. Mine repeating primitives/blocks out of sections | **`/extract-components <slug>`** |
| 7. Attach JS behaviour (mobile menu, tabs, accordion, …) | **`/add-interactivity <slug>`** |
| 8. Visually verify a page against the live site | **`/verify-import [slug]`** |

A typical step-by-step run looks like:

```
/sitemap                https://acme.com
/import-design-tokens   https://acme.com
/import-cms             https://acme.com --group=/blog/*
/import-pages           https://acme.com/about https://acme.com/pricing
/split-page             about
/extract-components     about
/add-interactivity      about
/verify-import          about
```

Only mention this section to the user if (a) they asked about it, or (b) `/import-site` halted and they want to resume manually with finer control.
