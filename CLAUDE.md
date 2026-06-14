<!-- MENO_DOCS_VERSION: 0.1.3 -->
# Meno — Visual CMS for Astro

This is an **Astro project** — standard `src/pages` and `src/components` `.astro` files plus Astro
content collections — authored with **Meno, a visual CMS / page builder for Astro**.

Meno reads and writes these `.astro` files in a constrained, fully round-trippable convention — the
**Meno format** (the spec calls it the *meno-astro dialect*): a small, well-defined subset of Astro that
the editor can parse back into its visual model. The result is a normal Astro codebase you can read,
hand-edit, and version — with a visual editor layered on top.

You can edit this project two ways, and they stay in sync:
- **Visually**, in the Meno editor (the primary surface).
- **By hand**, editing the `.astro` files directly.

The `meno-astro` codec (`emit` / `parse`) bridges the two and guarantees a lossless round-trip — so
**anything you hand-write must stay inside the Meno-format grammar below**, or it won't round-trip
(it'll be lost on the next visual save).

> **Read this first, then keep `.claude/docs/meno/meno-astro-dialect.md` open for the full grammar,
> and use the `/meno-astro` skill when authoring or editing `.astro` by hand.**

---

## Project layout

```
project.config.json        — project config (baseComponent, locales, format: "astro")
colors.json                — theme colors (var(--text), var(--bg), …)
variables.json             — CSS design tokens
src/
  pages/<slug>.astro       — pages  (the route tree)
  pages/<collection>/[slug].astro — CMS template pages (dynamic routes; schema in meta.cms)
  components/<Name>.astro  — reusable components
  content/<collection>/    — CMS items (JSON entries; .draft.json = unpublished)
  content.config.ts        — Astro content-collection config (build-readiness)
images/  fonts/  icons/    — assets, referenced with absolute paths (/images/hero.webp)
```

- A **page** is frontmatter (`const meta`) + the node tree wrapped in `<BaseLayout meta={meta}>`.
- A **component** is frontmatter (a single authoritative `resolveProps(Astro, {…})` prop block,
  optional `__meno` meta) + body + optional `<style>` / `<script>`.

---

## The golden rules (do / don't)

1. **Styles live in `style({...})`, never in a raw `class="..."`.**
   The argument is a Meno `StyleObject`: `{ base: {...}, tablet: {...}, mobile: {...} }` (or a flat
   object). Prop-bound values are `{ _mapping: true, prop: "name", values: {...} }`.
   - ✅ `<div class={style({ base: { display: "flex", gap: "12px" } })}>`
   - ❌ `<div class="flex gap-3">` — a raw Tailwind/CSS class string does **not** round-trip.

2. **i18n values live in `i18n({...})`** with the `{ _i18n: true, en, pl, … }` shape.
   - ✅ `<Heading text={i18n({ _i18n: true, en: "About", pl: "O nas" })} />`

3. **Meno templates are `{{expr}}` in the model → `{expr}` (or `` `…${expr}…` ``) in markup.**
   To put a template back by hand, write a JSX `{expr}` with a bare identifier / member / ternary; the
   parser turns it into `{{expr}}`. A whole-string template → bare expr; a mixed string → backtick
   literal.
   - ✅ `<span>{item.title}</span>` ⟶ model `"{{item.title}}"`

4. **Component props are JSX attributes.**
   - string → `text="Hi"` (or `text={"a \"quoted\" value"}` if it has quotes/newlines)
   - number → `size={1}` · boolean → `isMarginTop={true}`
   - object / link → `link={{ href: "/x", target: "_blank" }}`
   - i18n → `text={i18n({ _i18n: true, … })}`
   Component tags are **Capitalized** and need a matching local import in the frontmatter
   (`import Name from '../components/Name.astro'` for pages, `'./Name.astro'` for components).

5. **The `resolveProps(Astro, {…})` argument is authoritative for component props.**
   There is no separate `interface Props`/`__meno_props`: a component declares its props exactly once
   as `const { …names…, class: className } = resolveProps(Astro, {...})`. The `{...}` literal is
   authoritative (it's what the parser reads); the destructured names + their TS types are
   inferred/regenerated on save. If you change a prop, change that literal. Keep `class: className`
   in the destructure, and emit the call even for an empty interface
   (`const { class: className } = resolveProps(Astro, {});`). Component metadata (`category`,
   `acceptsStyles`, `libraries`) goes in `const __meno = {...}`
   (omit if empty). A component's JS that needs its props uses native Astro
   `<script define:vars={{ a, b }}>` (`true` = all props / `string[]` = a subset); otherwise
   a plain `<script is:inline>`. `defineVars` is **not** a `__meno` key.

6. **Conditionals are `{cond && ( … )}`.** A node's `if: "{{visible}}"` → `{visible && ( … )}`;
   `if: false` → `{false && ( … )}`; a `BooleanMapping` → `{when({...}) && ( … )}`.

7. **Lists:**
   - prop list → `{ list(items, { limit: 6 }).map((item, itemIndex) => ( … )) }` (loop var defaults to
     `item`; index is always `<var>Index`).
   - collection list → a frontmatter `const xList = await getCollectionList("blog", { … }, Astro)` then
     `{ xList.map((blog, blogIndex) => ( … )) }` (loop var defaults to `singularize(source)`).
   - ⚠ If you author a collection list, make the loop variable match the templates in the body
     (`(blog, blogIndex)` + `{{blog.title}}`). Set `itemAs` if you want a specific name.

8. **Other node forms (use the exact tags):**
   - `<Link href="/x">…</Link>` (link); `href={i18n({...})}` or `href={href({...})}` for i18n / mapping hrefs.
   - `<Embed html={`<svg>…</svg>`} />` (single-line) or hoist multi-line HTML to a frontmatter
     `const __embedN = \`…\`` and use `html={__embedN}`.
   - `<slot />` / `<slot>fallback</slot>`.
   - `<LocaleList … />` (locale switcher; style sub-props wrapped in `style(...)`, editor meta in a
     single `meta={{...}}`).
   - Dynamic tag (`h{{size}}`) → frontmatter `const Tag_0 = \`h${size}\`` + `<Tag_0>…</Tag_0>`.

9. **Don't rely on escape hatches yet.** Non-dialect / hand-written spans (raw Tailwind, ad-hoc Astro
   logic) are **not** preserved across a round-trip today. Stay inside the grammar; if you can't express
   something in dialect, flag it rather than writing it.

10. **Serialization is deterministic.** All literals (style / props / meta / i18n / list config) are
    printed with stable key order, JSON string escaping, and 80-col wrapping. Don't hand-tune
    formatting — a save re-emits canonically. Empties drop on normalization (empty `style`, empty
    `children`, empty `meta` / `interface`, and a lone array child collapses to a bare string).

---

## File skeletons

**Page** (`src/pages/<slug>.astro`):
```astro
---
import { i18n } from 'meno-astro';
import { BaseLayout } from 'meno-astro/components';
import Heading from '../components/Heading.astro';

const meta = {
  title: "About",
  description: "About this site"
};
---
<BaseLayout meta={meta}>
  <main>
    <Heading size={1} text={i18n({ _i18n: true, en: "About", pl: "O nas" })} />
  </main>
</BaseLayout>
```

**Component** (`src/components/<Name>.astro`):
```astro
---
import { resolveProps, style } from 'meno-astro';

const { text, class: className } = resolveProps(Astro, {
  text: { type: "string", default: "Heading" }
});

const __meno = { category: "ui" };
---
<h2 class={style({ base: { fontWeight: "500" } })}>{text}</h2>
```

---

## CMS (content collections)

- **Items** live as JSON under `src/content/<collection>/`. Each item file has a stable `_id` (matching
  its filename stem) and `_createdAt`. An unpublished edit is a sibling `<name>.draft.json`; the published
  file is the one without `.draft`.
- **Schemas** are defined by the collection's **template page** at `src/pages/<collection>/[slug].astro`
  — an idiomatic Astro dynamic route (with `getStaticPaths`) whose `meta.source === "cms"` carries the
  schema in `meta.cms`. That template is the source of truth for the collection's fields — **not**
  `src/content.config.ts` (which is generated with a permissive schema only so `astro build` can resolve
  the collection). The route directory comes from `meta.cms.urlPattern` (`/blog/{{slug}}` →
  `src/pages/blog/[slug].astro`). In the Meno editor the template is addressed as `/templates/<collection>`.
  The `import { getCollection }`, `getStaticPaths()`, and `const { cms } = Astro.props;` lines are derived
  boilerplate (regenerated from `meta.cms`; the codec skips them) — edit `meta.cms`, not those.
- A list backed by a collection is a frontmatter `getCollectionList("<collection>", { … }, Astro)` const
  mapped in the body (see rule 7).
- **Rendering fields:** plain fields render as `{i18n(cms.field)}`; **rich-text** fields render via
  `<Fragment set:html={richTextWithComponents(cms.field, cmsComponents)} />` — never a text
  interpolation (a plain `{i18n(cms.richField)}` would print `[object Object]` since a rich-text
  value is a structured object, not a string). `richTextWithComponents` (from `meno-astro`) also
  renders **components embedded in the rich text** (TipTap `menoComponent` nodes) against
  `cmsComponents` — the generated registry `src/cmsComponents.ts` (a constant `import.meta.glob`
  over `src/components/`; don't hand-edit it). Its import
  (`import { cmsComponents } from '../../cmsComponents'`) is derived boilerplate like
  `getStaticPaths`. An **embed node** bound to a rich-text field uses
  `<Embed html={i18n(cms.field)} />`.

When adding or changing a collection, edit the template `[slug].astro`'s `meta.cms` schema and keep the
item files in `src/content/<collection>/` consistent with it.

---

## Selection

Read `.meno/selection.json` for the element currently selected in the editor. It's a **bare JSON array**
tracing the editing hierarchy from the outermost page through every component drill-in down to the
selected node — each entry is `<file>:<lineStart>-<lineEnd>` pointing into the real `.astro` source, e.g.
`["src/pages/index.astro:6-14", "src/components/section/Hero.astro:40-58", "src/components/ui/Button.astro:22-29"]`.
The **last** entry is the selected node; earlier entries are the drill-in instances (the next entry's
filename names that component, and the line range disambiguates which instance was entered when a page
uses several of the same component). Open the file at the given lines to see the element's tag,
`class={style(…)}`, props, and children in dialect source. The file contains `null` when nothing is
selected.

---

## Status & caveats (important)

This format is **new and still being completed**. Be honest about what works today:

- ✅ **Editing & round-trip work.** Pages/components read, save, and round-trip through `meno-astro`'s
  `emit`/`parse`. Visual edits and hand-edits stay in sync as long as you stay in the grammar.
- ⚠ **`astro build` is not wired yet.** The runtime helpers the emitted markup imports (`style()`,
  `href()`, `when()`, `getCollectionList()`, `embedHtml()`) and the `meno-astro/components`
  components (`BaseLayout`, `Link`, `Embed`, `LocaleList`) are **not yet implemented**, so the emitted
  `.astro` is correct Meno format but **not yet runnable** by `astro build`. Preview through the Meno
  editor, not `astro dev` / `npm run build`. (`i18n()` and `list()` are the exception — they're
  implemented; the `i18n()` resolver works, but per-locale rendering still awaits the `BaseLayout`
  wiring that calls `runWithLocale` per route.)
- ⚠ **Escape hatches (`rawClass` / `verbatim` regions) are not implemented yet** — only Meno-format
  content survives a round-trip. Don't hand-author raw `class="…"` or arbitrary Astro logic expecting it
  to persist.

For the full grammar and the implemented/pending split, see:
- `.claude/docs/meno/meno-astro-dialect.md` — the dialect spec (grammar, normalization, round-trip contract).
- `.claude/docs/meno/meno-astro-api.md` — the `meno-astro` package API + status.
- the **`/meno-astro` skill** (`.claude/commands/meno-astro.md`) — copy-pasteable authoring cheat-sheet.
