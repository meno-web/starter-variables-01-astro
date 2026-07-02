---
description: Create a new Meno component
allowed-tools: Read, Write, Glob
---

# Build Component

Create a new reusable component based on the user's description.

This is an **Astro project** (meno-astro format): components are `.astro` files under
`src/components/`, authored in the round-trippable **meno-astro dialect**. Author the
`.astro` directly with the `Write` tool — never JSON, never a sibling `.js`.

## Usage

```
/build-component [description]
```

## Instructions

1. **Understand the request**: Parse $ARGUMENTS for component requirements
2. **Gather context**: Glob `src/components/**/*.astro` and read 2–3 existing components for
   the project's dialect style (prop blocks, `style({...})` usage, color vars).
3. **Pick the folder** and write a single `.astro` file:
   - `src/components/ui/<Name>.astro` — primitives (Button, Card, Badge, Heading, Icon…)
   - `src/components/form/<Name>.astro` — inputs / form controls
   - `src/components/section/<Name>.astro` — page sections (Hero, Features, Footer…)
   - (`Layout.astro` lives at `src/components/Layout.astro` — not a `<Folder>`.)
   Component JS, if any, is an embedded `<script>` inside the same file — **not** a sibling.

## Key Rules

### Component shape

A component is frontmatter (a single authoritative `resolveProps(Astro, {...})` prop block,
optional `__meno` meta) + body. There is **no** `{ "component": { ... } }` wrapper, no
separate `interface`, and no `structure` — those are JSON-format concepts.

```astro
---
import { resolveProps, cx } from 'meno-astro';

const { title, class: className } = resolveProps(Astro, {
  title: { type: "string", default: "Hello" }
});
---
<div class={cx("flex flex-col", className)}>
  <h2 class="font-[500]">{title}</h2>
</div>
```

- The `resolveProps(Astro, {...})` literal is **authoritative** — it's what the editor reads.
  Declare every prop there exactly once. Always keep `class: className` in the destructure,
  and emit the call even when there are no props
  (`const { class: className } = resolveProps(Astro, {});`).
- `const __meno = {...}` carries `acceptsStyles`, `libraries`. Omit the line entirely if it
  would be empty. **Components are grouped in Studio by their folder** under `src/components/`
  (e.g. `ui/`, `sections/`), not by metadata — save the component into the right folder; a
  `__meno.category` field round-trips but is inert for grouping.

### Prop Types

Valid types: `string`, `number`, `boolean`, `select`, `link`, `file`, `rich-text`.
Each is a field in the `resolveProps` literal:

```astro
const { title, count, visible, size, cta, avatar, content, class: className } =
  resolveProps(Astro, {
    title:   { type: "string", default: "Heading" },
    count:   { type: "number", default: 0 },
    visible: { type: "boolean", default: true },
    size:    { type: "select", default: "md", options: ["sm", "md", "lg"] },
    cta:     { type: "link" },
    avatar:  { type: "file", accept: "image/*", default: "" },
    content: { type: "rich-text", default: "<p>Text</p>" }
  });
```

(`resolveProps` is the dialect's single source of prop truth — the deterministic serializer
re-emits this literal with stable key order on every save, so don't hand-tune its formatting.)

### Image Props

Use `file` type, **NOT** `image`:

```astro
// CORRECT
avatar: { type: "file", accept: "image/*", default: "" }

// WRONG - "image" is not a valid type
avatar: { type: "image" }
```

### Reserved Names

Never use `children` as a prop name — slots are `<slot />` (or `<slot>fallback</slot>`).
Pass-through content goes through the slot, not a prop.

### Styles — a static utility `class="..."` string is the default

Static styling is a literal utility **`class="..."`** string — the canonical, round-tripping form
(it parses to `attributes.class`). Meno's Tailwind-looking engine: named scale (`flex`, `p-4`,
`gap-3`), design tokens (`bg-muted`, `text-(--text)` from `theme.css`), arbitrary brackets for
off-scale / literal values (`p-[13px]`, `bg-[#fff]`, `text-(--custom)`), plus desktop-first responsive
`max-lg:` / `max-sm:` and `hover:` / `focus:` / `active:` prefixes.

```astro
<div class="flex gap-[12px] p-[24px]">
```

Reach for the `style({...})` / `cx(...)` / `variants(...)` runtime helpers **only** for values that
can't be a static class — a prop-bound `{{template}}`, a prop-variant, or a responsive/interactive
**mapping**. Bind them to the whole props object and assemble with `cx`:

```astro
const __props = resolveProps(Astro, { variant: { type: "select", options: ["primary", "secondary"], default: "primary" } });
const { variant, class: className } = __props;
// …
<span class={cx("flex gap-[8px]", style({ base: { color: {
  _mapping: true, prop: "variant",
  values: { primary: "var(--text)", secondary: "var(--muted)" }
} } }, __props), className)}>
```

- **Colors / tokens** come from `src/styles/theme.css`. A **fixed** color is a static class —
  `class="text-(--text) bg-(--bg)"`. A **prop-driven** color must use the `style()` `_mapping` above
  — ⚠ **not** `variants()` (token colors get canonicalized to a named class and silently break there).
  `variants()` is for bracket-value utilities only (sizes, spacing, layout, gradients).
- ⚠ In `resolveProps` / `variants` / `style` object literals: **no trailing commas, no ES6 shorthand**
  (`{ size: size }`, not `{ size }`). A parse failure = no CSS, rendered silently unstyled.

### Props & templating in markup

Meno templates are `{{expr}}` in the model → JSX `{expr}` in markup:

```astro
<span>{title}</span>                            // string / member
<img src={avatar} alt={title} />                // attribute binding
<span>{`$${item.price}`}</span>                  // mixed string → backtick
```

A `rich-text` prop renders its HTML via `<Fragment set:html={content} />` (or
`<Fragment set:html={text} />`), not as plain `{text}`.

### Links

A `link`-typed prop renders through the `Link` component, bound with `href(...)`:

```astro
import { href, resolveProps, style } from 'meno-astro';
import { Link } from 'meno-astro/components';
// …
<Link href={href({ _mapping: true, prop: "cta" }, { cta })}>{title}</Link>
```

For an i18n href use `href={i18n({ _i18n: true, en: "/about", pl: "/o-nas" })}`.

### Conditionals & lists

- Conditional render: `{visible && ( <div>…</div> )}`.
- Prop-backed list: `{ list(items, { limit: 6 }).map((item, itemIndex) => ( … )) }`
  (import `list` from `'meno-astro'`; loop var defaults to `item`, index is `itemIndex`).

### JavaScript Behavior

Component JS is an embedded **`<script>`** in the same `.astro` file — there is **no**
sibling `.js`, and **no** `el`/`props` auto-injection (that's JSON-only). Use native Astro
prop injection: `<script define:vars={{ a, b }}>` makes those props available as in-scope
variables. A script that needs no props is `<script is:inline>`. Drive behavior off
`data-*` attributes you put on the markup, and dispatch `CustomEvent`s for
component-to-component communication.

```astro
---
import { resolveProps, cx } from 'meno-astro';

const { initialCount, class: className } = resolveProps(Astro, {
  initialCount: { type: "number", default: 0 }
});
---
<div class={cx("flex gap-[8px] items-center", className)}>
  <button type="button" data-action="increment">+</button>
  <span data-el="count">{initialCount}</span>
</div>

<script define:vars={{ initialCount }}>
  const el = document.currentScript.previousElementSibling;
  const button = el.querySelector('[data-action="increment"]');
  const countEl = el.querySelector('[data-el="count"]');
  let count = initialCount || 0;

  button?.addEventListener('click', () => {
    count++;
    countEl.textContent = count;
  });
</script>
```

`define:vars` is a native Astro attribute, **not** a `__meno` key. See
`.claude/docs/meno/javascript.md` for the full JS pattern (data attributes, custom-event
component communication, define:vars prop injection).

## Reference

- `CLAUDE.md` — the dialect (golden rules, file skeletons, CMS, status & caveats)
- `.claude/docs/meno/meno-astro-dialect.md` — full dialect grammar & round-trip contract
- `.claude/docs/meno/meno-astro-api.md` — the `meno-astro` package API + status
- `.claude/docs/meno/javascript.md` — component JavaScript patterns
- the **`/meno-astro`** skill — copy-pasteable authoring cheat-sheet (incl. the CMS template
  skeleton, for CMS-backed components)
- `example-astro/src/**` — real generated `.astro` components to mirror

## Example

User: `/build-component card with image, title, description and link`

Actions:
1. Glob `src/components/**/*.astro` and read existing components for dialect style.
2. Write `src/components/ui/Card.astro` with:
   - `resolveProps` block: `image` (file), `title` (string), `description` (string),
     `link` (link).
   - Body: a `style({...})` card wrapper containing `<img src={image} />`, the text content,
     and a `<Link href={href({ _mapping: true, prop: "link" }, { link })}>` CTA.
   - No `__meno` needed — the `ui/` folder already groups it (add `__meno` only for
     `acceptsStyles` / `libraries`).
