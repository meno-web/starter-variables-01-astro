<!-- MENO_DOCS_VERSION: 0.1.33 -->
# Meno is a visual Astro editor

Meno reads and writes `.astro` files in a constrained *meno-astro dialect* — a small subset of Astro
the editor can parse back into its visual model. The result is a normal Astro codebase you can read and
hand-edit, with a visual editor layered on top.

The `meno-astro` codec guarantees a lossless round-trip (`parse(emit(model)) === model`), so **anything
you hand-write must stay inside the dialect grammar, or it's lost on the next visual save.**

**This file is enough to edit `.astro` for the everyday cases** — pages, components, styling, props,
lists, conditionals — straight from the tripwires, node/prop forms, and skeletons below. Reach for the
**`/meno-astro` skill** and the dialect/API docs only for the specialized cases under
**[When to go deeper](#when-to-go-deeper)** (CMS template pages, islands, custom components,
prop-variant / component-root styling, deep "will this round-trip?" questions, the full Studio API).
Don't load the skill for a routine edit.

---

## Where you work

**Work only in the codebase.** Do not use or interact with the Meno Studio interface — don't drive
the editor UI, open its preview/browser, or automate its panels. Make every change by editing the
project's files directly (`.astro`, CMS JSON, `project.config.json`, `src/styles/theme.css`, assets);
the visual editor picks your edits up on its own.

---

## Anatomy & conventions

- A **page** = frontmatter `const meta` + node tree wrapped in `<BaseLayout meta={meta}>`
  (`src/pages/<slug>.astro`).
- A **component** = one authoritative `resolveProps(Astro, {…})` block (optional `__meno` meta) + body +
  optional `<style>` / `<script>` (`src/components/<Name>.astro`).
- CMS items are JSON under `src/content/<collection>/`; `<id>.draft.json` is the unpublished sibling.
- Design tokens (theme colors + CSS variables) live in one stylesheet, `src/styles/theme.css`;
  project config in `project.config.json`. Assets are referenced with **absolute** paths
  (`/images/hero.webp`).

---

## Selection

Read `.meno/selection.json` for the element currently selected in the editor.

---

## Git: uncommitted changes are the user's visual edits

Meno Studio saves every visual edit straight to the working tree (`src/`, `public/`,
`project.config.json`) and **never commits or pushes**. Dirty files you did not write yourself are
the user's unsaved visual work — treat them like an open, unsaved document, never as scratch state.

- **Tree already dirty when you start, or before any branch switch / pull / rebase / commit of your
  own?** Commit those changes separately FIRST —
  `git add -A && git commit -m "chore(meno): visual edits from Meno Studio"` — so they are never
  swept into an unrelated commit or left blocking a checkout.
- **Never discard them** — no `git checkout -- .`, `git reset --hard`, or stash-and-forget to
  "clean up" the tree. If they conflict with your task, commit them first and tell the user.
- **Pushing is on you** — the editor never pushes. When the user asks whether their work "is on
  GitHub", check for BOTH unpushed commits and uncommitted visual edits, then commit + push.
- CMS drafts (`src/content/<collection>/<id>.draft.json`) are unpublished content — committing them
  is fine (production builds ignore drafts).

---

## Round-trip tripwires (the cardinal don'ts)

Scannable rules that keep an edit round-tripping and building. The positive forms for each live in the
node/prop catalog + skeletons below.

1. **Static styling is a utility class string** — `class="flex p-4 bg-muted max-lg:p-2 hover:bg-[#222]"`
   (Meno's own Tailwind-*looking* engine: named scale `p-4`=16px, named tokens `bg-muted`, brackets
   `p-[13px]` for off-scale, desktop-first `max-lg:`/`max-sm:` + `hover:`/`focus:`/`active:` prefixes; the editor
   canonicalizes on save). **Named VALUE scales bind to YOUR variables, not Tailwind defaults**:
   `text-lg`, `font-semibold`, `rounded-md`, `shadow-lg`, `max-w-md`, `leading-tight`, `tracking-wide`,
   `font-sans` emit `var(--token)` and render **only if that variable is defined** in `src/styles/theme.css` —
   else inert (Meno is token-based; no fallback to Tailwind's px/rem). For a one-off use a bracket
   (`text-[18px]`) or define the token. *Computed* forms work standalone: `w-1/2`, `-mt-4`, `grid-cols-3`,
   `col-span-2`, `scale-105`, `rotate-45`, `skew-y-3`, `duration-300`, `ease-in-out`, filters (`blur-[70px]` →
   `filter: blur(70px)`, `brightness-50`, `grayscale`, `hue-rotate-90`, `backdrop-blur-[8px]`, …; the
   length scales `blur-sm`/`drop-shadow-md` are unsupported — use brackets), and borders (`border`,
   `border-b`, `border-2`, `border-solid` → a visible `1px solid` border, color inherits; set it with
   `border-<token>`/`border-[#hex]`). **Tailwind idioms with NO effect here — write the working form
   instead**: `md:`/`lg:` min-width variants (desktop-first `max-lg:`/`max-sm:` only) · `dark:`/
   `group-hover:` (only `hover:`/`focus:`/`active:` exist) · gradient stops `bg-gradient-to-r from-… to-…`
   (→ one value: `bg-[linear-gradient(to_right,#111,#333)]`) · `space-y-*`/`divide-*` (→ flex/grid +
   `gap-*`) · `truncate` (→ `overflow-hidden text-ellipsis whitespace-nowrap`) · `line-clamp-N`
   (→ `[display:-webkit-box] [-webkit-line-clamp:N] [-webkit-box-orient:vertical] overflow-hidden`) ·
   `ring-*` (→ `outline-2 outline-<token> outline-offset-2` or a `shadow-[…]`) · `animate-*` (→
   `@keyframes` in a component `<style>` + `[animation:spin_1s_linear_infinite]`) · `container` (→
   `w-full max-w-[1200px] mx-auto`). **Only** prop-bound
   `{{template}}`, prop-variant, and component-root styling can't be a class → `style()` / `variants()` / `cx()`.
   It styles **every** node the same way — an `<Embed>`, `<Link>`, or `<Markdown>` carries `class="…"`
   just like a `<div>` (an instance rides its `class` prop); only `list`/`island`/`slot`/`custom` have no styling.
   A node's editor **layer name** rides the reserved `data-meno-label="…"` attribute (it parses to the
   model's `label`, never to a real attribute/prop — keep it when editing, add one to name a layer);
   only a node that already carries a `style()` call keeps its label inside the `style()` meta argument
   (`style({…}, __props, { label: "…" })`) instead.
   **Building something NEW — even on a blank project — uses the same form.** Never scaffold a design
   as semantic classes + CSS (`class="hero"` + a `<style>`/stylesheet defining `.hero { … }`): it
   builds, but it's foreign CSS the visual styles panel can't represent, so the design lands visually
   un-editable. Define the design system as tokens in `src/styles/theme.css` first, then style with
   utility classes bound to them (`bg-primary`, `text-muted`; brackets for one-offs). A component
   `<style>` is only for what utilities can't express — `@keyframes`, `::before`/`::after`, complex
   selectors — never layout/spacing/color/typography.
2. **i18n values are wrapped** — `i18n({ _i18n: true, en: "About", pl: "O nas" })`, never a bare string.
3. **Meno templates** — model `{{expr}}` ↔ markup `{expr}` (bare identifier / member / ternary) or
   `` `…${expr}…` ``.
4. **Component props are JSX attributes** — `text="Hi"`, `size={1}`, `link={{ href: "/x" }}`,
   `text={i18n({…})}`; Capitalized tags need a matching frontmatter import — **your** components from
   `../components/…`, but the built-in node components (`Link`, `Embed`, `Markdown`, `MenoImage`,
   `LocaleList`) from `meno-astro/components`. Emit auto-injects these, so a hand-written `<Link>`
   missing `import { Link } from 'meno-astro/components'` round-trips fine but throws `Link is not
   defined` at render until the next save.
5. **`resolveProps(Astro, {…})` is authoritative** — declare props exactly once
   (`const { …names…, class: className } = resolveProps(Astro, {…})`); keep `class: className`; emit
   the call even when empty. Optional `const __meno = {…}` carries `acceptsStyles` / `libraries`
   (omit if empty); **Studio groups components by their folder** under `src/components/` (e.g.
   `ui/`, `sections/`), not by metadata — a `__meno.category` round-trips but is inert for
   grouping, so organize with folders.
6. **Conditionals & lists** — `{cond && ( … )}`; prop list `{ list(items, {…}).map((item, itemIndex) =>
   ( … )) }`, collection list `getCollectionList("blog", {…}, Astro, getCollection)` mapped in the body
   (the loop var must match the `{{…}}` bindings inside; `getCollection` from `astro:content` is the
   **required** 4th arg — omit it and the list silently returns `[]`). A prop list's backing prop must be declared
   `type: "list"` with **`itemSchema` + an object-array `default`** (`[{ label: "First" }]`), not a
   bare-string `default` — that round-trips + builds but won't open in Studio (see Node & prop forms).
7. **`const meta` is a plain object** — never `export const meta` / `satisfies …` / `import type`
   (those break the real `astro build`). SEO/head fields (`viewTransitions`, `noindex`, `sitemap`,
   `customCode`, `prerender`) ride the same object.
8. **CMS rich-text renders via a helper** — a rich-text value renders as REAL HTML through
   `set:html={…}`, never a text interpolation (`{i18n(cms.richField)}` would print `[object
   Object]`). The helper is picked by the field/prop's `editor` meta: **Basic** (`editor`
   absent/`"basic"`, the common case) → the lean `set:html={richText(value)}` (i18n + link
   localization, **no** component registry); **Extended** (`editor:"extended"`) →
   `set:html={richTextWithComponents(value, cmsComponents)}` so project components embedded in the
   rich text render (the lean form or a bare `set:html={value}` would ship them as an empty `<div
   data-meno-component>`). Same three ways — a CMS text child (`richText(cms.field)` vs
   `richTextWithComponents(cms.field, cmsComponents)`), a `type:"rich-text"` **prop**, and an
   **`<Embed>`** of a rich-text field (Extended adds `components={cmsComponents}`; Basic omits it).
   The collection schema lives in the template page's `meta.cms`, **not** `content.config.ts` (which
   is generated with a permissive schema).
9. **Never import a renderer or adapter in `astro.config`** — add SSR adapters and island framework
   renderers via `project.config.json` (the preview allow-lists only `astro/config` + `meno-astro` and
   won't open the project otherwise).
10. **Serialization is deterministic** — don't hand-tune formatting; a save re-emits canonically (stable
    key order, JSON escaping, 80-col wrapping) and drops empties.
11. **Out-of-grammar content is lost on save** — flag it, don't write it. To escape the dialect, climb
    the escalation ladder: native dialect → custom component (or island, for a client framework) →
    hand-authored page (see below).
12. **A section/listing page is a top-level file, not a nested `index.astro`** — use
    `src/pages/blog.astro` for `/blog`, NOT `src/pages/blog/index.astro`. Only the site root
    (`src/pages/index.astro` → `/`) may be an `index.astro`. This matters for **multi-locale**
    projects: the injected locale route derives a page's id from its path, and a nested index's
    id is `blog/index` (not `blog`), so its localized URL becomes `/pl/blog/index` and **`/pl/blog`
    404s** (the default-locale `/blog` still works via Astro's own routing, which hides the miss).
    Pair a collection listing `blog.astro` with its item template `blog/[slug].astro` — both can
    coexist in Astro.

---

## Node & prop forms

Everyday building blocks. Component tags are Capitalized and need a matching frontmatter import
(`'../components/Name.astro'` from a page, `'./Name.astro'` from a component); HTML stays lowercase.
The built-in node components below — `Link`, `Embed`, `Markdown`, `MenoImage`, `LocaleList` — import
instead from `meno-astro/components` (`import { Link } from 'meno-astro/components'`).

- **Text** — in `children`: `<span>Hello</span>`; template child `<span>{item.title}</span>` (→
  `{{item.title}}`); mixed string → backtick literal `<span>{`$${item.price}`}</span>`.
- **Link** — `<Link href="/x">…</Link>`; i18n / mapping href via `href={i18n({…})}` or `href={href({…})}`.
- **Conditional** — `{cond && ( … )}` (`if: "{{visible}}"` → `{visible && (…)}`; `if: false` →
  `{false && (…)}`; `BooleanMapping` → `{when({…}) && (…)}`).
- **Collection list** — frontmatter `const blogList = await getCollectionList("blog", {…}, Astro,
  getCollection)` (import `getCollection` from `astro:content` — it's the **required** 4th arg; without
  it the list silently returns `[]`) then `{ blogList.map((blog, blogIndex) => (…)) }`; loop var
  (default `singularize(source)`) must match the `{{blog.*}}` bindings in the body.
- **slot** — `<slot />` / `<slot>fallback</slot>`; named `<slot name="header" />` filled by a child
  `slot="header"` attr; unnamed children → the default slot.
- **Embed** — `<Embed html={`<svg>…</svg>`} />` single-line; multi-line → hoist to a frontmatter
  `const __embedN = \`…\`` + `html={__embedN}` (`html={prop}` / `html={i18n(cms.field)}` stay bindings).
- **Image** — a local `<img src=… alt=… />` → runtime `<MenoImage>` (lazy + responsive) **by default**;
  opt out `data-meno-optimize="false"`; remote / `data:` / `.svg` stay bare unless `="true"` (+ host in
  `image.domains`).
- **Markdown** — `<Markdown source={`# Title\n\nbody`} />` (multi-line → `const __mdN`); `source` is
  verbatim — no `{{…}}`.
- **Dynamic tag** (`h{{size}}`) — frontmatter `const Tag_0 = \`h${size}\`` + `<Tag_0>…</Tag_0>`.
- **Component props** — JSX attributes: `text="Hi"`, `size={1}`, `isMarginTop={true}`,
  `link={{ href: "/x" }}`, `text={i18n({…})}`.

**Prop list** — declare the backing prop `type: "list"` (**`itemSchema` required** + an **object-array
`default`**), then map it and bind item fields:
```astro
const { items, class: className } = resolveProps(Astro, {
  items: { type: "list", itemSchema: { label: { type: "string", default: "Item" } },
    default: [{ label: "First" }, { label: "Second" }] },
});
// body — loop var defaults to `item`, index is always `<var>Index`:
{ list(items, { limit: 6 }).map((item, itemIndex) => ( <span>{item.label}</span> )) }
```
⚠ A bare-string `default` (`["First", "Second"]`) or a missing `itemSchema` round-trips through the codec
**and** `astro build`, but won't open in Studio (`interface.items — list prop requires itemSchema and an
object-array default`) — the most common first guess.

`resolveProps(Astro, {…})` is the one authoritative prop declaration (tripwire 5); the destructured names
+ TS types regenerate on save, so change the `{…}` literal to change a prop. Component JS that needs props
→ `<script define:vars={{ a, b }}>`; without it → `<script is:inline>`.

---

## File skeletons

**Page** (`src/pages/<slug>.astro`):
```astro
---
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
Optional head/SEO fields ride the same plain `const meta` (never `export` / `satisfies`):
`viewTransitions` (→ `<ClientRouter>`), `noindex`, `sitemap`, `customCode`. **`prerender: true | false`**
is the per-page static/SSR override — lifted OUT of `const meta` to a top-level `export const prerender =
…`; omit to inherit project `output`. Project-wide config (`redirects`, `image.domains`, `prefetch`,
`devToolbar`, `icons`, global `customCode`) lives in `project.config.json`.

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

---

## Escalation ladder

Reach for the **lowest** rung that works; escalate only on a genuine wall (never trade away visual editing
for something the dialect already models):

1. **Native dialect** — nodes + class strings + `style()` / `i18n()` / `{{bindings}}` + reusable
   `src/components/*.astro`. The default.
2. **Custom component / island** — a *piece* the dialect can't model → an opaque `src/custom/*.astro`
   (server-only, explicit props, black box); for a *client* framework use an **island** under
   `src/islands/*`. Both need the `/meno-astro` skill for the exact form.
3. **Hand-authored page** — a whole bespoke route → `src/pages/<route>.astro`. A dialect body + foreign
   frontmatter stays visually editable (`_frontmatter` passthrough); a fully non-dialect page opens
   **read-only**. Both build as normal Astro.

---

## When to go deeper

CLAUDE.md covers everyday editing. Load more **only** for the specialized cases:

- **CMS template pages** (`src/pages/<collection>/[slug].astro`) — a page with `meta.source === "cms"` +
  a `meta.cms` schema (the schema lives there, **not** `content.config.ts`); plain fields render via
  `{i18n(cms.field)}`, rich-text via `<Fragment set:html={richText(cms.field)} />` (Basic) or
  `<Fragment set:html={richTextWithComponents(cms.field, cmsComponents)} />` (Extended, `editor:"extended"`)
  (tripwire 8). The skill has the full skeleton + the data-only / RSS variants.
- the **`/meno-astro` skill** (`.claude/commands/meno-astro.md`) — the full authoring cheat-sheet: exact
  forms for islands & custom components, prop-variant / component-root styling
  (`variants()` / `cx()` / `inlineStyle()`), `LocaleList`, verbatim-JS markers, the CMS template skeleton,
  and the complete node-form detail with round-trip caveats.
- `.claude/docs/meno/meno-astro-dialect.md` — the dialect spec (grammar, normalization, the round-trip
  contract) — for deep "will this round-trip?" questions.
- `.claude/docs/meno/meno-migration-docs.md` — **read this first before migrating an imported pure-CSS
  site (Webflow export etc.) into Meno components.** The end-to-end playbook + hard-won runtime gotchas
  the specs omit: utility CSS is generated by parsing each `.astro` into the model (a file that fails to
  parse silently gets **no CSS**); the parser's **no-trailing-comma / no-shorthand** rule; when to use
  `variants()` vs `style()` (**token colors work only via `style()`**, never `variants()`); and the
  `border` gotcha.
