---
description: Import a list of unique pages into the current Meno project, reusing the existing component library (Layout / Header / Footer / variables / colors). Assumes the library exists — typically run after /import-site, or to add more pages to an already-imported site. Batches are processed in parallel.
allowed-tools: Task, Bash, Read, Write, Edit, Glob, Grep, TodoWrite
argument-hint: "<url1> [url2 …] [--batch-size=N]"
---

# /import-pages $ARGUMENTS

You have been asked to import one or more unique pages into the current Meno project, reusing the existing component library.

## What to do

1. **Parse `$ARGUMENTS`.**
   - One or more positional URLs (must all be http/https).
   - Optional `--batch-size=N` flag (default 5). Bigger batches = fewer parallel sub-agents but more sequential pages per agent.
   - If no URLs, ask the user for at least one.
   - Reject any non-http(s) URL with a clear message.

2. **Verify the library exists.**
   Glob `components/Layout.json`. If absent, warn:
   ```
   No component library found (components/Layout.json missing). Pages will be saved
   with passthrough roots and can be wrapped in Layout later. Run /import-site <root>
   first if you want a proper library.
   ```
   Continue regardless — the sub-agent handles this case.

3. **Split URLs into batches** of size `--batch-size` (default 5). Example: 23 URLs at batch size 5 → 5 batches of 5 + 1 batch of 3.

4. **Fan out — one Task per batch.**
   Dispatch in ONE assistant response with multiple Task calls, so they run concurrently:

   ```
   Task({
     description: "Import pages batch <i> of <n>",
     subagent_type: "site-importer-page",
     prompt: "Process this batch of unique pages: <list of URLs>. Library is at the
current working directory (components/ + variables.json + colors.json). Follow
.claude/agents/site-importer-page.md exactly. Reuse existing Layout/Header/Footer.
Report when done."
   })
   ```

5. **When all sub-agents return**, collect their batch reports and print a combined summary:
   ```
   /import-pages — done
   Total: <N> pages requested
   ✅ Saved:   [<slug>, ...]
   ⏭ Skipped: [<slug>: <reason>, ...]
   ⚠ Partial: [<slug>: <N section-saves failed>, ...]
   ```

## What you do NOT do

- You do NOT build Layout / Header / Footer / variables / colors — that's `/import-site`. If the user runs `/import-pages` against an empty project, sub-agents save with passthrough roots and flag follow-ups.
- You do NOT process CMS template URLs. If a user passes `/blog/post-1 /blog/post-2 /blog/post-3` here, the sub-agents will dutifully import each as a standalone page — which is wasteful. Suggest `/import-cms` instead if the URL pattern looks like a template family.
- You do NOT touch the homepage (`/` or root URL). That's `/import-site`'s job.

Re-running `/import-pages` with the same URLs is safe — sub-agents skip slugs already saved (per-page checkpoint).
