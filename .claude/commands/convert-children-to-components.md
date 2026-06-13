---
description: Convert every non-string child of a selected page node into instances of ONE newly-created component. Server-side counterpart to the Studio editor's "Convert children to components" menu action. Use when a page has a row/grid of structurally-similar siblings (cards, FAQ rows, pricing tiers, …) and you want them refactored into a reusable component with per-instance props in a single POST.
allowed-tools: Bash, Read
argument-hint: "<slug> <nodePath> <ComponentName> [--port=N]"
---

# /convert-children-to-components $ARGUMENTS

Create ONE new component from a parent node's children, and rewrite every non-string child of that parent as an instance of the new component. Mirrors the Studio editor's "Convert children to components" menu entry, but exposed as a single API call so AI doesn't have to hand-roll the file writes.

> **Non-interactive contract.** Never ask the user questions during this skill — see `.claude/docs/meno/studio-port.md`. Validation halts with a one-line error; uncertainty becomes a line in the final report.

## When to use this vs. neighbours

| Skill | Carves | Use when |
|---|---|---|
| `/split-page` | Page root → Header / Footer / Layout + per-section components | First-pass page componentization |
| `/split-node` | One parent → one component **per child** (each different) | Children have different shapes; you want them as separate sections |
| **`/convert-children-to-components`** | One parent → **one** component, **N instances** | Children share a structure; vary content via props |
| `/extract-components` | Cross-section pattern mining (Button/Badge/Card/…) | Whole-page repeating-primitive sweep |

If the children differ in shape, use `/split-node` instead — this skill needs them to share a single component shape.

## What to do

1. **Parse `$ARGUMENTS`.** Tokens, in order:
   - `<slug>` — page slug (no leading `/`, no `.json`).
   - `<nodePath>` — Meno path to the parent node, formatted as a comma-separated index list, starting with `0` (root marker). Examples: `0` for the page root; `0,1,2` for the third child of the second child of root.
   - `<ComponentName>` — PascalCase name for the new component (e.g. `FAQItem`, `PricingTier`). Numeric suffix added on collision.
   - Optional `--port=N` overrides Studio port detection.
   - Halt with one-line error if slug is empty / contains spaces / ends in `.json`; if nodePath doesn't start with `0`; if componentName isn't PascalCase.

2. **Resolve the Studio port** per `.claude/docs/meno/studio-port.md`. Substitute `<STUDIO_PORT>` for every literal `3000` below.

3. **Read the parent node** so you can analyze its children and decide whether to provide an explicit `structure` + `interface`:

   ```bash
   curl -s http://localhost:<STUDIO_PORT>/api/pages/<slug> | jq '.root'
   ```

   Walk the JSON down `nodePath` (skipping the leading `0`) to find the parent. Inspect its `children`:
   - Count non-string children — the endpoint needs **≥2**.
   - Check they share a structural shape (same tag, same nesting). If shapes diverge, abort and tell the user to use `/split-node` instead.
   - Identify which leaves vary (text, href, src). Those become props.

4. **Decide on the prop shape**. Two modes:

   **Mode A — verbatim (no props).** Skip if you want a quick "wrap these as one component, all instances identical." Omit `structure`, `interface`, and `propsForChildren`. The first child is cloned verbatim into the new component; every instance is the same. Useful as a starting point you'll edit by hand.

   **Mode B — with props (recommended).** Provide a `structure` with `{{propName}}` placeholders for varying leaves, an `interface` declaring each prop, and a `propsForChildren` array with one entry per non-string child (in order). The endpoint creates the component and assigns the per-instance props.

   For prop conventions (types, naming, `{{propName}}` templates, image as `file`, never `children`) read `.claude/docs/meno/website-convert.md` or `CLAUDE.md`'s "Component Structure" section.

5. **Call the endpoint** with one POST:

   ```bash
   curl -s -X POST http://localhost:<STUDIO_PORT>/api/make-component-from-children \
     -H 'content-type: application/json' \
     -d @/tmp/convert-children-payload.json
   ```

   Payload shape (Mode B example):

   ```json
   {
     "slug": "home",
     "nodePath": [0, 1, 2],
     "componentName": "FAQItem",
     "folder": "imported",
     "structure": {
       "type": "node",
       "tag": "div",
       "attributes": { "class": "faq-item" },
       "children": [
         { "type": "node", "tag": "h3", "children": "{{question}}" },
         { "type": "node", "tag": "p",  "children": "{{answer}}" }
       ]
     },
     "interface": {
       "question": { "type": "string", "default": "" },
       "answer":   { "type": "string", "default": "" }
     },
     "propsForChildren": [
       { "question": "What is Meno?",       "answer": "A visual editor for static sites." },
       { "question": "Is there a free tier?", "answer": "Yes." },
       { "question": "How do I deploy?",     "answer": "Hit publish in the toolbar." }
     ]
   }
   ```

   Response (success):

   ```json
   {
     "success": true,
     "slug": "home",
     "pagePath": "/home",
     "nodePath": [1, 2],
     "componentName": "FAQItem",
     "requestedName": "FAQItem",
     "renamed": false,
     "instancesCreated": 3
   }
   ```

   If `renamed` is `true`, the server suffixed a number (e.g. `FAQItem2`) because the requested name was taken — surface that in the report.

6. **On failure** (4xx/5xx), read `error` + `message` from the JSON response, surface it verbatim, and stop. The server validates before writing, so partial state is rare; do not "retry-on-anything" — fix the payload first.

7. **Report.** Print a one-screen summary and stop:

   ```
   ✅ Page:              pages/<slug>.json
   ✅ Parent node:       <nodePath>
   ✅ Component created: components/<finalName>.json  (renamed from <requestedName>? Y/N)
   ✅ Instances:         <N>
   ✅ Mode:              <verbatim | with-props>
   ```

   Do not summarize, kick off follow-up work, or ask the user what to do next.

## Hard rules

- **Parent must have ≥2 non-string children.** The endpoint rejects fewer; this skill should not retry with `/split-node`-style fallbacks — it's the user's call.
- **Children should share a shape.** No validation enforces this on the server: if you pass a `structure` that doesn't match a given child, the instance still gets created but its `props` from `propsForChildren` may not render meaningfully. AI is responsible for verifying shape match before the POST.
- **`componentName` is PascalCase.** Server rejects non-PascalCase outright.
- **`propsForChildren.length` must equal the count of non-string children.** Off-by-one → 400.
- **Never overwrite an existing component.** Server appends a numeric suffix; check `renamed` in the response.
- **One invocation = one POST.** Don't fan out across siblings — that's `/extract-components`' job.

## Failure modes

| Symptom | Action |
|---|---|
| Studio dev server unreachable | Halt with the one-line error from studio-port.md. Do NOT ask the user. |
| `pages/<slug>.json` missing | Halt; report path. |
| `nodePath` out of range | Halt; report which level overflowed. |
| Target has <2 non-string children | Halt; suggest `/extract-components` or a manual edit. |
| `propsForChildren` length mismatch | Recompute against actual non-string child count, re-POST once. Second failure → halt. |
| Children shapes diverge significantly | Halt; suggest `/split-node` instead. |
