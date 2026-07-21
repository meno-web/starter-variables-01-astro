---
description: Author or edit valid meno-astro dialect (.astro files used as a Meno project's source of truth). Grammar cheat-sheet + do/don't rules so emitted/edited .astro round-trips through meno-astro's emit()/parse() codec.
allowed-tools: Read, Glob, Grep, Edit, Write
argument-hint: "[component|page|node-type to author/edit]"
---

# /meno-astro $ARGUMENTS

You are editing **meno-astro dialect**: a constrained, round-trippable subset of `.astro`
that the `meno-astro` codec emits and parses. A Meno project in this format stores pages
under `src/pages/*.astro` and components under `src/components/*.astro`. The codec
guarantees `parse(emit(normalizeModel(x))) === normalizeModel(x)` — so anything you write
**must stay inside the grammar below** or it will not round-trip.

The project `CLAUDE.md` already covers the everyday cases (the tripwires, node/prop forms, and
file skeletons) — this skill is the **deeper reference** for the specialized forms below (islands,
custom components, prop-variant / component-root styling, `LocaleList`, verbatim-JS markers, and the
full round-trip caveats). Full spec: `docs/meno/meno-astro-dialect.md`. Read it if `$ARGUMENTS`
needs detail beyond this cheat-sheet.

## The golden rules (do / don't)

1. **Static styling is a utility class string — `class="p-4 flex"`.**
   Meno's own Tailwind-*looking* utilities (its engine, not real Tailwind), written directly on the
   element: a **named spacing/size scale** (`p-4` = 16px, `gap-2` = 8px — 4px grid), **named design
   tokens** (`bg-muted`, `text-primary` — a color/var from `src/styles/theme.css`), and
   **arbitrary brackets** for off-scale / literal values (`p-[13px]`, `bg-[#fff]`, `text-(--custom)`);
   responsive tiers via a desktop-first `max-lg:` (tablet, ≤1024px) / `max-sm:` (mobile, ≤540px) prefix
   (`max-lg:p-2` — base wins, narrower tiers override down; bare `tablet:`/`mobile:` is legacy, accepted on
   read but re-emitted to the `max-` form), states via `hover:` / `focus:` / `active:` (`hover:bg-[#222]`). The build
   generates the CSS; unmodeled library classes (`swiper`, `prose`) pass through verbatim. **The canonical
   form** — the editor canonicalizes on-scale + known-token values to the named form on save (`p-[16px]`
   re-emits as `p-4`).
   ✅ `<div class="flex gap-[12px] p-[24px] max-lg:p-[16px] hover:bg-[#222]">` · foreign coexist: `class="p-[24px] swiper"`
   ❌ **Don't scaffold a NEW design as semantic classes + CSS** (`class="hero"` + a `<style>` /
   stylesheet defining `.hero { … }`) — it builds, but it's foreign CSS the visual styles panel
   can't represent, so the design lands visually un-editable. Even on a blank project: define the
   design system as tokens in `src/styles/theme.css` first, then style with utility classes bound
   to them. A component `<style>` is only for what utilities can't express — `@keyframes`,
   `::before`/`::after`, complex selectors — never layout/spacing/color/typography.
   **Every styleable node carries it the same way** — an `<Embed>`, `<Link>`, or `<Markdown>` takes
   `class="…"` (incl. `hover:`/`focus:`/`active:`) just like a `<div>`; only `list`/`island`/`slot`/`custom` have no styling.
   **Named VALUE scales bind to YOUR variables — never Tailwind's defaults.** `text-lg`, `font-semibold`,
   `rounded-md`, `shadow-lg`, `max-w-md`, `leading-tight`, `tracking-wide`, `font-sans` emit
   `prop: var(--text-lg)` (etc.) and render **only if that variable is defined** in `src/styles/theme.css`;
   otherwise the declaration is inert (Meno is token-based — it does NOT fall back to Tailwind's px
   values). For a one-off, use an **arbitrary bracket** (`text-[18px]`, `rounded-[10px]`,
   `shadow-[0_4px_12px_#0002]`) or a defined token — don't assume a named scale "just works".
   *Computed* forms DO work standalone (these are Tailwind's definitions, not opinionated values):
   fractions (`w-1/2`→50%), negatives (`-mt-4`), grid (`grid-cols-3`, `col-span-2`, `row-span-2`),
   transforms (`scale-105`, `rotate-45`, `translate-x-2`, `skew-y-3`, `scale-x-95`), transitions
   (`duration-300`, `ease-in-out`),
   filters (`blur-[70px]` → `filter: blur(70px)`, `brightness-50` → `brightness(0.5)`, `grayscale`,
   `invert-25`, `hue-rotate-90`, `drop-shadow-[0_4px_6px_#0003]`, `backdrop-blur-[8px]`, `blur-(--glow)`;
   the length scales `blur-sm`/`blur-md`/`drop-shadow-md` are unsupported — use brackets),
   and borders — `border`, `border-b`, `border-2`, `border-t-4`, `border-x`, `border-solid` render a
   visible `1px solid` border, color inherits (Meno has no Preflight, so a width-only border would be
   invisible); set the color with `border-<token>`/`border-[#hex]`, the style with `border-dashed`.
   Tailwind palette colors (`border-gray-200`) stay unsupported — use a token.
   **Tailwind idioms with NO effect here — write the working form instead:**
   - `md:`/`lg:`/`sm:` min-width variants → desktop-first `max-lg:` (≤1024px) / `max-sm:` (≤540px) only.
   - `dark:`, `group-hover:`, `peer-*` → not modeled; only `hover:`/`focus:`/`active:` exist (theme via tokens).
   - Gradient stops `bg-gradient-to-r from-… via-… to-…` → ONE arbitrary value:
     `bg-[linear-gradient(to_right,#111,#333)]`.
   - `space-y-4`/`space-x-*`/`divide-*` (child selectors) → flex/grid + `gap-4`.
   - `truncate` → `overflow-hidden text-ellipsis whitespace-nowrap`; `line-clamp-3` →
     `[display:-webkit-box] [-webkit-line-clamp:3] [-webkit-box-orient:vertical] overflow-hidden`.
   - `ring-2` → `outline-2 outline-<token> outline-offset-2` (or `shadow-[0_0_0_3px_#0003]`).
   - `animate-spin`/`animate-*` → define `@keyframes` in a component `<style>` (an allowed use) and
     reference it: `[animation:spin_1s_linear_infinite]`.
   - `container` → `w-full max-w-[1200px] mx-auto`.
   - `sr-only`/`antialiased` (multi-property) → arbitrary properties (`[clip:rect(0,0,0,0)]`, …) or omit.
   Three things CAN'T be a static class (they need per-instance prop values) → runtime helpers:
   - **Prop-bound `{{template}}`** (`gap: "{{gap}}px"`) — keeps a `style({...})` call (round-trip)
     AND emits inline. On a component root wrap the inline as
     `style={inlineStyle({ gap: `${gap}px` }, __props)}` (not a bare `` style={`gap: ${gap}px`} ``)
     so an instance override of that property wins — an inline `style=` otherwise outranks the
     instance's utility class.
   - **Prop-variant** (one prop selecting class sets) — `variants()` is for **bracket-value**
     utilities (size / spacing / layout / gradients), e.g.
     `class={cx("p-[24px]", variants(__props, { size: { sm: "text-[14px]", lg: "text-[20px]" } }))}`.
     ⚠ **Colors can't go through `variants()`**: it emits the literal class string, but the build
     canonicalizes a token/hex color to a *named* class (`.text-<token>`), so they mismatch and the
     color silently never applies. Prop-driven colors use a `style()` `_mapping` instead (it *computes*
     the matching class name): `class={cx(style({ base: { color: { _mapping: true, prop: "tone",
     values: { muted: "var(--muted)", strong: "var(--text)" } } } }, __props), className)}`.
   - **Component STRUCTURE ROOT** — merges the parent's instance overrides via
     `cx(<own classes>, className)` (instance wins per property): class-only root
     `class={cx("p-[24px] …", className)}`, style-less `class={cx(className)}`, with dynamic styling
     `class={cx(style(OBJ, __props), className)}`. A per-use override on an instance rides its `class`
     prop (`<Card class="p-[24px]" />`); the `instance`/`root`/`__menoStyle` markers are emit-only
     (dropped on parse) — match emit's forms when hand-authoring.
   A node's editor **layer name** rides the reserved `data-meno-label="…"` attribute (parses to the
   model's `label`, never to a real attribute/prop — keep it when editing, add one to name a layer);
   only a node that already carries a `style()` call keeps its label inside the `style()` meta
   argument (`style({…}, __props, { label: "…" })`) instead.

2. **i18n values live in `i18n({...})`** with the `{ _i18n: true, en, pl, ... }` shape.
   ✅ `<Heading text={i18n({ _i18n: true, en: "About", pl: "O nas" })} />`

3. **Meno templates are `{{expr}}` in the model → `{expr}` (or `` `…${expr}…` ``) in markup.**
   To put a template back by hand, write a JSX `{expr}` with a bare identifier/member/ternary;
   the parser turns it into `{{expr}}`. A whole-string template → bare expr; a mixed string →
   backtick literal.
   ✅ `<span>{item.title}</span>` ⟶ model `"{{item.title}}"`
   ✅ `<span>{`$${item.price}`}</span>` for `"${{item.price}}"`

4. **Component props are JSX attributes.**
   - string → `text="Hi"` (or `text={"a \"quoted\" value"}` if it has quotes/newlines)
   - number → `size={1}` · boolean → `isMarginTop={true}`
   - object/link → `link={{ href: "/x", target: "_blank" }}`
   - i18n → `text={i18n({ _i18n: true, ... })}`
   Component tags are Capitalized and need a matching local import in the frontmatter
   (`import Name from '../components/Name.astro'` for pages, `'./Name.astro'` for components).
   The **built-in node components** — `Link`, `Embed`, `Markdown`, `MenoImage`, `LocaleList` —
   import from **`meno-astro/components`** instead (`import { Link } from 'meno-astro/components'`),
   never from `../components/`. Emit auto-injects this import, so it's only ever missing when
   hand-authoring: a file that uses `<Link>` without it parses and round-trips fine, then throws
   `Link is not defined` at render until the next save (a runtime `ReferenceError`, not a parse
   error — the round-trip check won't catch it).

5. **The `resolveProps(Astro, {…})` argument is authoritative for component props.**
   There is no separate `interface Props`/`__meno_props`: a component declares its props
   exactly once as `const { …names…, class: className } = resolveProps(Astro, {...})`.
   The `{...}` literal is authoritative (it's what the parser reads); the destructured
   names + their TS types are inferred/regenerated on save. If you change a prop, change
   that literal. Always keep `class: className` in the destructure; emit the call even for
   an empty interface (`const { class: className } = resolveProps(Astro, {});`).
   ⚠ **The parser is strict about these object literals** (`resolveProps`, and the `variants()` /
   `style()` tables): **no trailing commas** and **no ES6 shorthand** — write `{ size: size }`, not
   `{ size }`, and no comma before a closing `}`. A violation throws `parseLiteral: expected object
   key` / `expected ":"`, and **a file that fails to parse gets no utility CSS at all** (it renders
   unstyled, silently) — so hold this rule in mind as you write. For
   prop-driven styling, bind `variants()`/`style()` to the whole props object:
   `const __props = resolveProps(Astro, {...}); const { ...names, class: className } = __props;`.
   Component metadata (`acceptsStyles`, `libraries`) goes in
   `const __meno = {...}` (omit if empty). **Studio groups components by their folder** under
   `src/components/` (e.g. `ui/`, `sections/`), not by metadata — a `__meno.category` round-trips
   but is inert for grouping, so organize with folders. A component's JS
   that needs its props is emitted as `<script define:vars={{ a, b }}>` (native Astro
   prop-injection, `true` = all props / `string[]` = a subset); a script without it is a
   plain `<script is:inline>`. `defineVars` is **not** in `__meno`.

6. **Conditionals are `{cond && ( … )}`.** A node's `if: "{{visible}}"` → `{visible && ( … )}`;
   `if: false` → `{false && ( … )}`; a `BooleanMapping` → `{when({...}) && ( … )}`.

7. **Lists:**
   - prop list → **declare** the backing prop as `type: "list"` (**`itemSchema` is required**,
     and `default` is an **array of objects** — one `{ field: value }` record per item), then map
     it in the body and bind item **fields** (never the bare item):
     ```astro
     const { items, class: className } = resolveProps(Astro, {
       items: {
         type: "list",
         itemSchema: { label: { type: "string", default: "Item" } },
         default: [{ label: "First" }, { label: "Second" }],
       },
     });
     // body — loop var defaults to `item`, index is always `<var>Index`:
     { list(items, { limit: 6 }).map((item, itemIndex) => ( <span>{item.label}</span> )) }
     ```
     ⚠ **Anti-pattern (the single most likely first guess):** a bare-string `default`
     (`items: { type: "list", default: ["First", "Second"] }`) or a **missing `itemSchema`**.
     It round-trips through the codec **and** `astro build` renders it — but the component
     **fails to open in Studio** with `interface.items — list prop requires itemSchema and an
     object-array default`. Always give a list prop an `itemSchema` + object-array default.
   - collection list → a frontmatter `const xList = await getCollectionList("blog", { ... }, Astro,
     getCollection)` (import `getCollection` from `astro:content` — the **required** 4th arg; omit it
     and the list silently returns `[]`) then `{ xList.map((blog, blogIndex) => ( … )) }` (loop var
     defaults to `singularize(source)`).
   ⚠ If you author a collection list, make the loop variable match the templates in the
   body (`(blog, blogIndex)` + `{{blog.title}}`). Set `itemAs` if you want a specific name.
   A known bug: legacy `cms-list` migration uses `{{item.*}}` in the body but binds
   `singularize(source)` — keep them consistent when editing by hand.

8. **Other node forms (use the exact tags):**
   - `<Link href="/x">…</Link>` (link) · `href={i18n({...})}` or `href={href({...})}` for
     i18n/mapping hrefs.
   - `<Embed html={`<svg>…</svg>`} />` (single-line) or hoist multi-line HTML to a
     frontmatter `const __embedN = \`…\`` and use `html={__embedN}`. `__embedN` is the
     **canonical** name (0-based + sequential). A custom-named hoist (`const __iconChat = …`)
     still round-trips — the HTML is recovered — but emit renames it to `__embedN` on save, so
     don't expect a semantic name to survive. (Only a frontmatter backtick const is inlined;
     `html={prop}` / `html={i18n(cms.field)}` stay bindings — a prop-bound embed.)
   - `<slot />` / `<slot>fallback</slot>`. **Named slots:** `<slot name="header" />` (with
     optional fallback). Assign instance content to a named slot with a plain `slot=` attribute
     on the child: `<Card><h2 slot="header">Title</h2><p>body</p></Card>` (the default slot takes
     the unnamed children). The `slot=` attribute round-trips as a normal attribute.
   - `<LocaleList … />` (locale switcher; style sub-props wrapped in `style(...)`, editor
     meta in a single `meta={{...}}`).
   - Dynamic tag (`h{{size}}`) → frontmatter `const Tag_0 = \`h${size}\`` + `<Tag_0>…</Tag_0>`.
   - **Optimized image** → a **local** `<img src=… alt=… />` (a plain `img` node) emits the runtime
     `<MenoImage>` (`astro:assets`) **by default** — `normalizeModel` stamps the `data-meno-optimize`
     marker. Opt a single image out with `data-meno-optimize="false"`. Remote/`data:`/`.svg` srcs stay
     bare `<img>` unless explicitly marked `data-meno-optimize="true"`; a remote `src` also needs its
     host in `project.config.json` `image.domains` to actually optimize.
   - **Markdown** → `<Markdown source={`# Title\n\nbody`} />` (multi-line hoists to
     `const __mdN = \`…\``). `source` is **verbatim, never template-resolved** — no `{{…}}` inside.
   - **Island** (BYO React/Preact/Vue/Svelte) → `<Counter client:visible … />` +
     `import Counter from '../islands/Counter.tsx'` (file under `src/islands/`). Put the `client:*`
     directive on the tag (bare `load`/`idle`/`visible`; valued `media`/`only`; omit for
     server-only). `meno()` auto-wires the renderer — **don't import a renderer or any
     non-`meno-astro` package in `astro.config`** (the preview statically scans it, allow-lists
     only `astro/config` + `meno-astro`, and won't open the project otherwise). An island gets
     **no** `style()` class / instance-style / `cms` forwarding — only its explicit props.
   - **Custom component** (opaque foreign `.astro`, server-only) → `<Fancy …>children</Fancy>` +
     `import Fancy from '../custom/Fancy.astro'` (file under `src/custom/`). Author it with full
     Astro power; Meno passes **only explicit props** + slots children and never models the
     internals (black box; **no `client:*`**, no `style()` / `cms` forwarding). The server-only
     sibling of an island — use for dialect-inexpressible markup that needs no browser framework.

9. **Verbatim JS expressions + foreign frontmatter survive; raw `class` does not.** An
   un-evaluatable `{expr}` (a function/method call like `{(price * 0.8).toFixed(2)}`,
   `{items.map(fn)}`) is preserved as a `{ _code, expr }` marker and reported as a
   `verbatim` region — it round-trips and builds, it just isn't an editable binding. Prefer
   a real `{{binding}}` when the template engine can evaluate it (identifier/member/
   operators/ternary). Hand-authored frontmatter (a stray `const`/`import`/`function`) is captured
   as a verbatim `_frontmatter` passthrough block and round-trips. A static utility/foreign
   `class="…"` is now first-class (rule 1) — it parses to `attributes.class` and round-trips.

10. **Serialization is deterministic.** All literals (style/props/meta/i18n/list config) are
    printed with stable key order, JSON string escaping, and 80-col wrapping. Don't hand-tune
    formatting — a save re-emits canonically anyway. Drop empties: empty `style`, empty
    `children`, empty `meta`/`interface`, and a lone array child collapse on normalization.

## Escalation ladder (when the dialect can't express it)

Reach for the **lowest** rung that works; escalate only on a genuine wall (never trade away
visual editing for something the dialect already models):

1. **Native dialect** — nodes + `style()` + `i18n()` + `{{bindings}}` + reusable
   `src/components/*.astro`. The default.
2. **Custom component** (rule 8) — a *piece* of UI the dialect can't model → an opaque
   `src/custom/*.astro` referenced as a `type:"custom"` node (server-only, explicit props, black
   box, round-trips). Need a *client* framework instead → use an **island** (rule 8).
3. **Entire custom page** — a whole bespoke route → hand-author `src/pages/<route>.astro`.
   Dialect body + foreign frontmatter stays visually editable (`_frontmatter` passthrough); a
   fully non-dialect page opens **read-only** (lists + previews, save is a no-op). Both build as
   normal Astro.

## File skeletons

**Page** (`src/pages/<slug>.astro`):
```astro
---
import { style } from 'meno-astro';
import { BaseLayout } from 'meno-astro/components';
import Heading from '../components/Heading.astro';

const meta = {
  title: { _i18n: true, en: "About", pl: "O nas" }
};
---
<BaseLayout meta={meta}>
  <div>
    <Heading size={1} text={i18n({ _i18n: true, en: "About", pl: "O nas" })} />
  </div>
</BaseLayout>
```

**Page file naming (matters for multi-locale):** a section/listing page is a top-level file
`src/pages/<name>.astro` (→ `/<name>`, and `/pl/<name>`), **not** a nested
`src/pages/<name>/index.astro`. Only the site root is an `index.astro`. The injected locale
route ids a nested index as `<name>/index`, so its localized URL becomes `/pl/<name>/index` and
**`/pl/<name>` 404s** (the default-locale `/<name>` still works via Astro routing, masking the
bug). Pair a collection listing `blog.astro` with its item template `blog/[slug].astro`.

Optional SEO/head fields ride the same plain `const meta` (never `export`/`satisfies`):
`viewTransitions: true` (→ `<ClientRouter>`), `noindex: true`, `sitemap: { priority, changefreq,
exclude }`, `customCode: { head, bodyStart, bodyEnd }`. **`prerender: true | false`** is the
per-page static/SSR override — it's lifted OUT of `const meta` and emitted as a top-level
`export const prerender = …` (Astro's own per-route mechanism); `false` needs SSR output. Omit it
to inherit the project `output`. Project-wide config (`redirects`, remote
`image.domains`, `prefetch`, `devToolbar`, `icons`, global `customCode`) lives in
`project.config.json`, not page meta. See the dialect/API docs for the full shapes.

**CMS template page** (`src/pages/<collection>/[slug].astro`) — a page whose
`meta.source === "cms"` + `meta.cms` schema; the body renders the current item's plain
fields via `{i18n(cms.field)}` and a **rich-text** field bound as a text child as REAL HTML
via `set:html={…}` — never a text interpolation (a plain `{i18n(cms.richField)}` would print
`[object Object]`). The **render helper is picked by the field's `editor` meta**:

- **Basic** (`editor` absent/`"basic"`, the common case) →
  `<Fragment set:html={richText(cms.field)} />`. `richText` converts the TipTap value to HTML
  and does i18n + internal-link localization — but imports **no** component registry (lean).
- **Extended** (`editor:"extended"`) →
  `<Fragment set:html={richTextWithComponents(cms.field, cmsComponents)} />`.
  `richTextWithComponents` does everything `richText` does **and renders components embedded in the
  rich text** (TipTap `menoComponent` nodes) against `cmsComponents`, the generated registry module
  (`src/cmsComponents.ts` — don't hand-edit it; it's a constant `import.meta.glob` over
  `src/components/`).

The same `editor`-tiered split applies everywhere a rich-text value is shown, not just a CMS text child:
- a component's `type:"rich-text"` **prop** renders via `set:html={richText(<prop>)}` (Basic) or
  `<Fragment set:html={richTextWithComponents(<prop>, cmsComponents)} />` (Extended, + the
  `cmsComponents` import) — **never** a bare `set:html={<prop>}` (that HTML-escapes the markup);
- an **embed node** bound to a rich-text field: Extended passes the registry
  (`<Embed html={i18n(cms.field)} components={cmsComponents} />`); Basic omits it
  (`<Embed html={i18n(cms.field)} />` — Embed.astro then normalizes via `richText`).

An **Extended** value shown via a bare `set:html={value}` (or `<Embed html={value}>` without
`components`) renders text and URL embeds but **drops any component embedded in the rich text** — it
ships as an empty `<div data-meno-component="…">`. **Troubleshooting** "an embedded component doesn't
render": either the field/prop isn't marked `editor:"extended"`, or the renderer is using the
lean/bare form — mark it Extended and switch to `richTextWithComponents(value, cmsComponents)` / add
`components={cmsComponents}`, and make sure `src/cmsComponents.ts` exists (the editor stamps it on
save; if missing, create it as the `import.meta.glob` above).
The `import { getCollection }`,
`getStaticPaths()`, `const { cms } = Astro.props;`, and the `cmsComponents` import are
**derived boilerplate** — they're regenerated from the model on emit and the parser skips
them, so don't hand-edit them for meaning (edit `meta.cms` instead). The route directory
comes from `meta.cms.urlPattern` (`/blog/{{slug}}` → `src/pages/blog/[slug].astro`). The
editor still addresses it as `/templates/<collectionId>`.
```astro
---
import { getCollection } from 'astro:content';
// `richText` (Basic) / `richTextWithComponents` (Extended) — import whichever the field's `editor` needs.
import { i18n, richText, richTextWithComponents } from 'meno-astro';
import { BaseLayout } from 'meno-astro/components';
import { cmsComponents } from '../../cmsComponents';

export async function getStaticPaths() {
  const entries = await getCollection("blog");
  return entries.map((entry) => ({
    params: { slug: entry.data.slug ?? entry.id },
    props: { cms: entry.data },
  }));
}

const { cms } = Astro.props;

const meta = {
  title: "{{cms.title}}",
  source: "cms",
  cms: { id: "blog", slugField: "slug", urlPattern: "/blog/{{slug}}", fields: { /* … */ } }
};
---
<BaseLayout meta={meta}>
  <h1>{i18n(cms.title)}</h1>
  <!-- a Basic rich-text field (lean, no registry): -->
  <Fragment set:html={richText(cms.excerpt)} />
  <!-- an Extended rich-text field (`editor:"extended"`) — renders embedded components too: -->
  <Fragment set:html={richTextWithComponents(cms.body, cmsComponents)} />
</BaseLayout>
```

**Collection variants** (set on `meta.cms`):
- **Data-only collection** — OMIT `urlPattern` (and `slugField`) on the schema. It's structured
  data with no per-item page/route (Team, Testimonials, Settings); no `[slug].astro` is emitted,
  but it's still registered as a content collection you bind to lists/cards. There is no template
  page for it — only its `cms/<id>/*.json` items + the schema.
- **RSS feed** — add `rss: true` to a ROUTED collection's `meta.cms` (one with a `urlPattern`).
  A prerendered `<route-prefix>/rss.xml` feed is generated (title/description/date auto-detected
  from the fields; item links use the synthesized `_url`). Data-only collections can't have RSS
  (no item links).

**Component** (`src/components/<Name>.astro`):
```astro
---
import { resolveProps, cx } from 'meno-astro';

const { text, class: className } = resolveProps(Astro, {
  text: { type: "string", default: "Heading" }
});
---
<h2 class={cx("font-[500]", className)}>{text}</h2>
```

## How to work

1. **Parse `$ARGUMENTS`** for what to author/edit (a component, a page, a specific node
   type). If it's vague, default to inspecting the relevant `src/pages` / `src/components`
   files and proceed — do not pause to ask.
2. **Match the existing style** of the project's `.astro` files (read a couple first;
   `example-astro/src/**` is the reference for real generated output).
3. **Edit the `resolveProps(Astro, {…})` literal** for prop changes; the destructured
   names + their inferred TS types are regenerated on save.
4. **Validate mentally against the grammar** above before writing — that's the check. Don't
   shell out to the codec to round-trip a snippet, and don't write tooling to parse-check
   your edits; the editor reports parse failures on its own.
5. **Stay inside the grammar.** Anything you can't express in dialect (ad-hoc Astro frontmatter
   logic) will be lost on the next save — flag it instead of writing it. A utility/foreign
   `class="…"` IS in the grammar now (rule 1).
