---
description: Mine the section components used by pages/<slug>.json for repeating UI primitives (Button, Badge, Input, Checkbox, Tag, IconButton) and block components (FAQItem, TeamCard, FeatureCard, PricingTier, ProcessStep, Testimonial, Stat, BlogCard, BrandLogo, ...). Creates the new components, rewrites sections to reference them via { type: "component" }, and batches all writes through the Studio API. Intended order: /split-page → /extract-components → /add-interactivity.
allowed-tools: Task, Bash, Read
argument-hint: "<slug> [--port=N]"
---

# /extract-components $ARGUMENTS

Factor repeating UI patterns from a page's sections into globally-named, reusable components.

> **Non-interactive contract.** Never ask the user questions during this skill — see `.claude/docs/meno/studio-port.md`. Validation halts with a one-line error; uncertainty becomes a line in the final report.

## What to do

1. **Parse `$ARGUMENTS`.** First token is the page slug; optional `--port=N` overrides Studio port detection.
   - Halt with one-line error if the slug is empty, contains a slash, or ends in `.json`.
   - If `--port` is present and not an integer in 1024–65535, drop it (don't halt).

2. **Validate the page exists.** Confirm `pages/<slug>.json` is readable. If missing, halt with a one-line error.

3. **Delegate to the `component-extractor` subagent** via the Task tool. The agent resolves the Studio port per `.claude/docs/meno/studio-port.md` and uses it for all API calls.

```
Task({
  description: "Extract components from <slug>",
  subagent_type: "component-extractor",
  prompt: "Analyze pages/<slug>.json transitively. Studio port hint: <port-or-auto>. Detect repeating UI primitives + block components across all referenced sections, build them as globally-named components, rewrite the sections to reference them, and save everything via batched API calls. Follow .claude/agents/component-extractor.md exactly. Resolve the Studio port per .claude/docs/meno/studio-port.md. Report when done."
})
```

   Pass `auto` when the user didn't supply `--port`; otherwise pass the explicit number.

4. **When the subagent returns**, print its final report verbatim and stop. Do not summarize, kick off follow-up work, or ask the user what to do next.

## Notes

- **Intended order**: `/split-page <slug>` → `/extract-components <slug>` → `/add-interactivity <slug>`.
  - `/split-page` produces zero-prop section components with inline node trees.
  - `/extract-components` (this skill) factors repeating subtrees from those sections into reusable components and patches the sections to reference them.
  - `/add-interactivity` then walks the multi-level component tree and adds JS at the smallest meaningful scope (Button.js for hover, FAQItem.js for row toggle — not HomeFAQ.js).
- **This skill only touches structure.** It does NOT write JS files. If a section already has a `.js` file (e.g. you ran `/add-interactivity` first), this skill leaves it alone — the user should re-run `/add-interactivity` after extraction to move JS to the right level.
- **Globally-named** (FAQItem, not HomeFAQItem). Numeric suffix on collision (FAQItem, FAQItem2).
- **Closed UI primitive catalog**: Button, Badge, Input, Checkbox, Tag, IconButton. Block components are open-ended with semantic naming.
- The Studio **editor** server must be running on some port between 3000–3009 (NOT the SSR preview, which uses 8080–8089). The agent detects which.
