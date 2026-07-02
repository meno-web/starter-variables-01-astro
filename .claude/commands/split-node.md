---
description: Convert EVERY direct child of a hand-picked parent node into its OWN component (one component per child, each named via the archetype dictionary). Server-side counterpart to the Studio editor's per-child split. Use when a parent's children differ in shape and you want each carved into its own section/component — unlike /convert-children-to-components which makes ONE component with N instances.
allowed-tools: Bash, Read
argument-hint: "<slug> <nodePath> [Prefix] [--port=N]"
---

# /split-node $ARGUMENTS

Carve a chosen parent node's children, one component per child. Mirrors the
editor's per-child split as a single API call, so AI doesn't hand-roll file writes.

> **Non-interactive contract.** Never ask the user questions during this skill — see `.claude/docs/meno/studio-port.md`. Validation halts with a one-line error; uncertainty becomes a line in the final report.

> **Format-transparent.** `/api/split-node` mutates the in-memory node tree; the
> provider emits `.astro` (or legacy `.json`) underneath. You pass a slug + path, not a file path.

> **Addressing — a semantic `handle` can replace `<nodePath>`.** Instead of
> hand-counting child indices, send a `handle` string the server resolves:
> `"section@2"` (3rd section candidate), `".content"`, `"#main > section"`,
> `"section:Features"`. Each `>` step descends to the first matching descendant
> (add `:nth-of-type(N)` to disambiguate). Raw paths still work. See
> `docs/meno-astro-componentize-plan.md` §6.

## When to use this vs. neighbours

| Skill | Carves | Use when |
|---|---|---|
| `/split-page` | Page root → Header / Footer / Layout + per-section components | First-pass whole-page componentization |
| **`/split-node`** | One parent → one component **per child** (each different) | Children differ in shape; you want each as its own section |
| `/convert-children-to-components` | One parent → **one** component, **N instances** | Children share a structure; vary content via props |

## What to do

1. **Parse `$ARGUMENTS`.** Tokens, in order:
   - `<slug>` — page slug (no leading `/`, no `.astro`/`.json` extension).
   - `<nodePath>` — Meno path to the parent, a comma-separated index list starting with `0` (root marker). `0` (or empty) targets the page root; `0,1,2` is the third child of the second child of root. (Meno's convention: the leading `0` is the root marker; real child indices start at position 1.)
   - `[Prefix]` — optional PascalCase prefix for the generated component names; defaults to a slug-derived prefix.
   - Optional `--port=N`.
   - Halt with a one-line error if the slug is empty / has a slash / ends in `.astro`/`.json`; if `nodePath` doesn't start with `0`; if `Prefix` is present but not PascalCase.

2. **Resolve the Studio port** per `.claude/docs/meno/studio-port.md`. Substitute `<STUDIO_PORT>` below.

3. **(Optional) Inspect the parent** to confirm it's the right node:

   ```bash
   curl -s http://localhost:<STUDIO_PORT>/api/pages/<slug> | jq '.root'
   ```

   Walk down `nodePath` (skipping the leading `0`). The server splits **every direct
   child** of that parent; existing component-reference children are passed through
   untouched (so the action is idempotent — re-running on the same parent is a no-op).

4. **POST `/api/split-node`** with one call (convert the comma path to a JSON array,
   or send a `handle` string instead of `nodePath`):

   ```bash
   curl -s -X POST http://localhost:<STUDIO_PORT>/api/split-node \
     -H 'content-type: application/json' \
     -d '{"slug":"<slug>","nodePath":[0,1,2],"prefix":"<Prefix>"}'
   # or: -d '{"slug":"<slug>","handle":"section@2","prefix":"<Prefix>"}'
   ```

   Omit `prefix` to let the server derive it from the slug. No chrome handling —
   if a child looks like a header/footer it just becomes a section component too
   (rename later in Studio).

5. **On failure** (4xx/5xx), surface `error`/`message` verbatim and stop:
   - `400 nodePath must start with 0` → fix the path; one retry, then halt.
   - `400 prefix must be PascalCase` → fix and re-POST once.
   - Studio dev server unreachable → halt with the one-line error from `studio-port.md`.

6. **Report.** Print a one-screen summary from the response and stop:

   ```
   ✅ Page:              src/pages/<slug>.astro
   ✅ Parent node:       <nodePath>
   ✅ Components created: <Name1>, <Name2>, …   (N; existing refs passed through)
   ✅ Renamed (collide): <any suffixed names>, else none
   ```

   Do not summarize, kick off follow-up work, or ask the user what to do next.
