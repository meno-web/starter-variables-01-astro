---
description: Foundation step for the mirror→scalable conversion. Derives design tokens — brand colors and typography/layout variables, written to src/styles/theme.css — from a mirror-imported site's LOCAL copied CSS (public/_mirror/css) and fonts/. No live fetch, no Studio server, no headless browser. Idempotent: only ADDS missing tokens, never overwrites tokens you set by hand, never touches pages/components/images.
allowed-tools: Bash, Read, Write, Edit
argument-hint: "[--theme=light]"
---

# /tokens-from-mirror $ARGUMENTS

A site imported with the **mirror** importer renders via its own verbatim copied
CSS (`public/_mirror/css/*.css`), with class names kept as plain attributes — it
looks pixel-perfect but its design system is locked inside opaque Webflow/builder
CSS. This skill is the **first foundation step** of converting that faithful
mirror into a scalable Meno project: it lifts the site's **colors** and
**typography/layout scale** into Meno's single token stylesheet
(`src/styles/theme.css`) so the project gains a real, globally-editable design system.

It reads the mirror **entirely offline** — no URL, no sidecar, no Studio port. It
writes only `src/styles/theme.css` and leaves pages, components, images, and the
`_mirror/` CSS untouched (de-mirroring of individual components happens later, in
the per-component style migration step).

> **Non-interactive contract.** Never ask the user mid-run. Halt with a one-line
> error on an unrecoverable problem; never call AskUserQuestion. Uncertainty
> becomes a line in the final report, not a question.

## Preconditions

This skill operates on an already-mirrored project. Verify, and halt with a
one-line error if missing:

- `public/_mirror/css/` exists and contains at least one `*.css` file.
- `.meno/mirror-manifest.json` exists (proves this is a mirror import, not the
  legacy lossy import).

If there is no mirror yet, halt: `No mirror found — run the mirror importer first (public/_mirror/css is empty).`

## What to do

1. **Parse `$ARGUMENTS`.** Optional `--theme=<name>` selects which color theme
   block in `src/styles/theme.css` to write into — `:root` for the default theme,
   `[theme="<name>"]` otherwise (default `light`). Any other argument is ignored.
   Never halt on a bad flag — drop it and continue.

2. **Inventory the mirror.** One read-only batch:

   ```bash
   ls -la public/_mirror/css 2>/dev/null
   # Font files actually shipped (filenames carry the family + weight). The mirror
   # lands fonts at the project-standard `fonts/`; older mirrors kept them under
   # `public/_mirror/fonts` — list both.
   ls fonts public/_mirror/fonts 2>/dev/null
   # @font-face declarations (the authoritative family list):
   grep -ho 'font-family:[^;}]*' public/_mirror/css/*.css | sort | uniq -c | sort -rn | head -30
   ```

3. **Detect the design system — variables first.** Modern Webflow/Framer mirrors
   ship their design system as **named CSS custom properties** — that IS the token
   set, already structured; lift it directly. Only older class-only sites need raw
   aggregation. Check which case you're in:

   ```bash
   # Every custom-property definition (sorted, deduped). A named system shows up as
   # families like --typography--*, --color--*, --spacings--*, --main--*, --brand--*.
   grep -hoE '\-\-[a-z0-9-]+:[^;}{]*' public/_mirror/css/*.css | sort -u | head -120
   ```

   - **A named `--*` system is present (the common case)** → do 3a.
   - **No meaningful custom properties** → do 3b (fallback).

3a. **Lift the existing CSS variables (preferred).** These already are the design
   system — write them into `src/styles/theme.css`, keeping the source values:
   - **Resolve alias chains.** Semantic tokens often point at a base palette
     (`--color--text: var(--brand--brand-900)`, `--brand--brand-900: #14193d`).
     Follow the chain to the literal value before writing it.
   - **Write only base values.** A token defined twice — once in `:root` and once
     inside an `@media` — is responsive in the source (e.g. `--typography--h1` is
     `5rem` base, `3rem` on mobile). Write just the base value as the `:root`
     custom property; Meno regenerates the responsive `@media` blocks from
     `project.config.json`, so you don't hand-author the breakpoint overrides. If a
     source override is a deliberate, non-proportional value worth keeping, note it
     in the report rather than baking a one-off `@media` rule.
   - **Place each token by family (the comment section IS the group):**
     - `--typography--h1..h6`, `--typography--text*` → under `/* Font Size */`.
     - `--main--*-font` / `--*--*-font` → under `/* Font Family */`.
     - `--main--*-weight` → under `/* Font Weight */`.
     - `--spacings--*` → under `/* Padding */` / `/* Gap */` (by usage).
     - `--main-size` / container widths → under `/* Size */`.
     - `--color--*` (resolved) → the `/* Colors: <theme> */` section, NOT a variable group.
   - **Keep the source variable names** when they're already clear
     (`--typography--h1`, `--spacings--l`) — re-pointing every reference to a renamed
     token is out of scope for this step. Only normalize names if the source ones
     are opaque hashes.

3b. **Aggregate raw declarations (fallback, class-only sites).** No variable system —
   derive from the most-frequent declarations:

   ```bash
   grep -hoE 'font-family:[^;}]*' public/_mirror/css/*.css | sort | uniq -c | sort -rn | head -8
   grep -hoE 'font-size:[^;}]*'   public/_mirror/css/*.css | sort | uniq -c | sort -rn | head -20
   grep -hoE 'font-weight:[^;}]*' public/_mirror/css/*.css | sort | uniq -c | sort -rn | head -10
   grep -hoE '#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)' public/_mirror/css/*.css | tr 'A-F' 'a-f' | sort | uniq -c | sort -rn | head -30
   ```

   Materialize with canonical Meno names (only the levels the CSS surfaced — never
   fabricate), each placed under its comment section in `theme.css`: families →
   `--font-family-sans/serif/mono` (`/* Font Family */`); heading sizes →
   `--font-heading-xl/lg/md/sm` (`/* Font Size */`); body → `--font-body-lg/md/sm`
   (`/* Font Size */`); line heights → `--line-height-tight/snug/normal/relaxed`
   (`/* Line Height */`); weights → `--font-weight-regular/medium/semibold/bold`
   (`/* Font Weight */`).

4. **Palette → `theme.css` colors.** From the resolved `--color--*` (3a) or the
   frequency-ranked literals (3b), map the named ones into the chosen theme's color
   section (`:root` for the default theme, `[theme="<name>"] { … }` for any other):
   `text`, `bg`, `muted`, `border`, plus brand tokens you can name (`primary`,
   `accent`, `surface`). Normalize to 6-digit hex where lossless; keep `rgba()` with
   alpha as-is. Leave ambiguous one-offs alone (report as skipped).

6. **Merge — never clobber.** `theme.css` may carry hand-added tokens. Read it with
   the Read tool, splice the missing custom properties into the right comment
   section, Write it back. **Existing declarations win** — only ADD tokens whose
   `--name` isn't already present; do not overwrite a token the user already set.
   Track added vs preserved for the report.

7. **Report and stop** (see format below). Do not kick off componentization or any
   follow-up — that's the next skill.

## Token file — `src/styles/theme.css`

All tokens live in ONE stylesheet. Colors are custom properties under a
`/* Colors: <theme> */` section; the default theme sits on `:root`, each additional
theme is a `[theme="<name>"] { … }` block with the SAME color names. Typography /
layout variables are plain custom properties on `:root`, grouped under
`/* Font Family */`, `/* Font Size */`, `/* Line Height */`, `/* Font Weight */`,
`/* Padding */`, `/* Gap */`, … comment sections. The comment section IS the group —
there is no separate `label`/`name`/`type`/`group`/`cssVar` field; a token's `--name`
is its identity. Write only base values; Meno regenerates responsive `@media` blocks
from `project.config.json`.

```css
:root {
  /* Colors: light */
  --text: #1f2937;
  --bg: #ffffff;
  --muted: #6b7280;
  --border: #e5e7eb;
  --primary: #4f46e5;

  /* Font Family */
  --main--main-font: "Manrope, sans-serif";

  /* Font Size */
  --typography--h1: 3.5rem;
  --typography--text-l: 1.25rem;

  /* Font Weight */
  --main--bold-weight: 700;

  /* Gap */
  --spacings--l: 2rem;
}

[theme="dark"] {
  /* Colors: dark */
  --text: #f9fafb;
  --bg: #0b0b0f;
  --muted: #9ca3af;
  --border: #1f2937;
  --primary: #6366f1;
}
```

Keep the source variable names when they're already clear (`--typography--h1`,
`--spacings--l`); only normalize opaque hashed names. The legacy per-token JSON
files are retired — existing projects auto-migrate them into `theme.css` on first
load.

## Report

```
/tokens-from-mirror  (theme: light)

🎨 src/styles/theme.css — colors (:root)
    + --primary     #4f46e5
    + --text        #1f2937
    = --bg          (already present, preserved)
📝 src/styles/theme.css — variables (:root)
    + --font-family-sans   "Manrope, sans-serif"   /* Font Family */
    + --font-heading-xl    3.5rem                   /* Font Size */
    = --font-weight-bold   (already present, preserved)

📊 Added: 11   Preserved: 3   Skipped: 4 (ambiguous colors)
Next: /componentize-mirror <slug>  — carve the mirror pages into Layout + sections.
```

Use `+` added, `=` present-and-kept, `~` only if the user explicitly asked you to overwrite.

## Edge cases

- **Mixed system** — a site may define some tokens as `--*` variables and hardcode
  others. Lift the variables (3a) and backfill only the missing slots from raw
  aggregation (3b); never duplicate a token that already has a variable.
- **Alias-only variables** — if `--color--text` resolves through two or three
  `var()` hops to a literal, write the literal. If a chain dead-ends with no
  literal, skip it and report it.
- **Minified single-line CSS** — never `cat` it; always grep for the declaration
  you want. The greps above handle minified files.
- **Greyscale / no brand color** — write `text`/`bg`/`muted`/`border` only and say
  so in the report.
- **Multiple visual themes on the source** (light/dark) — only populate the
  `--theme` you were given; note the other exists.

## What you do NOT do

- Do NOT touch `src/pages/`, `src/components/`, `src/content/`, `images/`, or
  anything under `public/_mirror/` — this step is tokens only.
- Do NOT delete or rewrite the mirror CSS. De-mirroring styles is a later,
  per-component step; tokens coexist with the mirror CSS until then.
- Do NOT fetch the live URL or start the Studio/sidecar — everything is read from
  the local mirror.
- Do NOT overwrite the whole stylesheet or hand-added tokens.

Re-running `/tokens-from-mirror` is safe and idempotent — it always preserves tokens
you've added or changed by hand.
