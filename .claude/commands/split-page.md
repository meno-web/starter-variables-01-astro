---
description: Carve an existing page (src/pages/<slug>.astro with an inline node tree) into Header/Footer/Layout + zero-prop section components, then rewrite the page as a thin shell. Reuses existing Header/Footer/Layout if already present.
allowed-tools: Task, Bash, Read
argument-hint: "<slug> [--port=N]"
---

# /split-page $ARGUMENTS

Carve the page at `src/pages/<slug>.astro` into reusable components.

> **Non-interactive contract.** Never ask the user questions during this skill — see `.claude/docs/meno/studio-port.md`. Validation halts with a one-line error; uncertainty becomes a line in the final report.

## What to do

1. **Parse `$ARGUMENTS`.** First token is the page slug; optional `--port=N` overrides Studio port detection.
   - Halt with one-line error if the slug is empty, contains a slash, or ends in `.astro`.
   - If `--port` is present and not an integer in 1024–65535, drop it (don't halt).

2. **Validate the page exists.** Confirm `src/pages/<slug>.astro` is readable. If missing, halt with a one-line error.

3. **Delegate to the `page-splitter` subagent** via the Task tool. The subagent resolves the Studio port per `.claude/docs/meno/studio-port.md` and uses it for all API calls. It performs a single `POST /api/auto-split` — section names come from the archetype dictionary, no LLM round-trip for naming.

```
Task({
  description: "Split <slug> into components",
  subagent_type: "page-splitter",
  prompt: "Componentize src/pages/<slug>.astro via POST /api/auto-split. Studio port hint: <port-or-auto>. Reuse existing Header/Footer/Layout components if present; only build what's missing. Follow .claude/agents/page-splitter.md exactly. Resolve the Studio port per .claude/docs/meno/studio-port.md. Run to completion and report at the end."
})
```

   Pass `auto` when the user didn't supply `--port`; otherwise pass the explicit number.

4. **When the subagent returns**, print its final report verbatim and stop. Do not summarize, kick off follow-up work, or ask the user what to do next.

## Notes

- This skill assumes `src/pages/<slug>.astro` already has a node tree under `root` (either a raw `type: "node"` wrapper or already wrapped in a `Layout` passthrough). It does NOT fetch, extract, or analyze the live site — that pipeline is a separate concern. (The API is format-transparent — the page is stored as `.astro` on disk but the splitter operates on the same node-tree model.)
- The Studio **editor** server must be running on some port between 3000–3009 (NOT the SSR preview, which uses 8080–8089). The subagent detects which.
- This is the first in a series of componentize skills. Future skills will split sections into smaller cards / repeating items / primitives. `/split-page` only handles the **page → Layout + Header + Footer + sections** split.
