---
description: Build a CMS collection (schema + card component + items + template page) from a sitemap template group, independently of the full site import. Can run before, alongside, or after /import-site. Multiple groups process in parallel.
allowed-tools: Task, Bash, Read, Write, Edit, Glob, Grep, TodoWrite
argument-hint: "<url> [--group=<pattern>]"
---

# /import-cms $ARGUMENTS

You have been asked to import CMS data from a sitemap template group, independently of any full-site import.

## What to do

1. **Parse `$ARGUMENTS`.**
   - First positional argument: site URL (must be http/https).
   - Optional `--group=<pattern>` flag: restrict to one template group (e.g. `--group=/blog/*`). If absent, process every group with ≥3 instances.
   - If the URL is missing or malformed, stop and ask the user.

2. **Discover groups.**
   POST `/api/fetch-sitemap` with `{ url }`. Filter the returned template families to those with ≥3 instances. If `--group` was given, intersect with that pattern.
   - Zero matching groups → tell the user "No template groups with ≥3 instances found at that URL (filter: `<pattern>`)." and stop.
   - One or more matching groups → continue.

3. **Fan out — one Task per group.**
   For each matching group, dispatch a parallel Task invocation. Use ONE assistant response with ALL Task calls inside, so they run concurrently:

   ```
   Task({
     description: "Import CMS group <id>",
     subagent_type: "site-importer-cms-group",
     prompt: "Process the CMS template group `<urlPattern>` from `<url>`. Instances:
<list of full URLs>. Follow .claude/agents/site-importer-cms-group.md exactly. Save the
collection, card component, items, and templates/<id>.json. Report when done."
   })
   ```

   For 5 groups, that's 5 Task tool calls in one message.

4. **When all sub-agents return**, collect their one-line reports and print a combined summary:
   ```
   /import-cms — done
   ✅ <id1>: <card> + <N> items
   ✅ <id2>: <card> + <M> items
   ⚠ <id3>: failed — <reason>
   ```

5. **Halt conditions:**
   - No working component library (`components/Layout.json` absent) — warn but proceed; sub-agents handle missing library with passthrough roots.
   - Site root unreachable / not http(s) — stop, ask for a valid URL.

## What you do NOT do

- You do NOT process unique pages — that's `/import-site` or `/import-pages`.
- You do NOT build Layout/Header/Footer — that's `/import-site`.
- You do NOT touch variables.json or colors.json — sub-agents only read them; the homepage pass owns writes.

Re-running `/import-cms <url>` is safe: each sub-agent matches existing CMS items by slug and updates instead of duplicating.
