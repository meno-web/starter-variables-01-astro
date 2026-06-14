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

Full spec: `docs/meno-astro-dialect.md`. Package API + status: `docs/meno-astro-api.md`.
Read those if `$ARGUMENTS` needs detail beyond this cheat-sheet.

## The golden rules (do / don't)

1. **Styles live in `style({...})`, never in a raw `class="..."`.**
   The argument is a Meno `StyleObject`: `{ base: {...}, tablet: {...}, mobile: {...} }`
   (or a flat object). Prop-bound values are `{ _mapping: true, prop: "name", values: {...} }`.
   ✅ `<div class={style({ base: { display: "flex", gap: "12px" } })}>`
   ❌ `<div class="flex gap-3">` — a raw Tailwind/CSS class string does **not** round-trip
   (the parser feeds `class` through `interpretStyleCall`, which expects `style(...)`).
   - **Instance styles** (a per-use override on a component instance) ride the instance's
     own `class={style(OBJ, __props, { instance: true })}` **and** an emit-only
     `__menoStyle={OBJ}` forward. The **component structure root** carries `{ root: true }`
     so `style()` merges that instance class over the root's own classes (instance wins per
     property). ✅ `<Card class={style({ base: { maxWidth: "320px" } }, __props, { instance: true })} __menoStyle={{ base: { maxWidth: "320px" } }} />`
   - **A root style value bound to a prop** (`maxWidth: "{{maxWidth}}"`) can't be a static
     class → it emits inline. On a component root, wrap it as
     `style={inlineStyle({ "max-width": `${maxWidth}` }, __props)}` (not a bare
     `` style={`max-width: ${maxWidth}`} ``) so an instance override of that property wins —
     an inline `style=` otherwise outranks the instance's utility class. The `instance`,
     `root`, and `__menoStyle` markers are emit-only (dropped on parse); these forms are
     normally produced by emit on save — match them when hand-authoring.

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

5. **The `resolveProps(Astro, {…})` argument is authoritative for component props.**
   There is no separate `interface Props`/`__meno_props`: a component declares its props
   exactly once as `const { …names…, class: className } = resolveProps(Astro, {...})`.
   The `{...}` literal is authoritative (it's what the parser reads); the destructured
   names + their TS types are inferred/regenerated on save. If you change a prop, change
   that literal. Always keep `class: className` in the destructure; emit the call even for
   an empty interface (`const { class: className } = resolveProps(Astro, {});`).
   Component metadata (`category`, `acceptsStyles`, `libraries`) goes in
   `const __meno = {...}` (omit if empty). A component's JS
   that needs its props is emitted as `<script define:vars={{ a, b }}>` (native Astro
   prop-injection, `true` = all props / `string[]` = a subset); a script without it is a
   plain `<script is:inline>`. `defineVars` is **not** in `__meno`.

6. **Conditionals are `{cond && ( … )}`.** A node's `if: "{{visible}}"` → `{visible && ( … )}`;
   `if: false` → `{false && ( … )}`; a `BooleanMapping` → `{when({...}) && ( … )}`.

7. **Lists:**
   - prop list → `{ list(items, { limit: 6 }).map((item, itemIndex) => ( … )) }`
     (loop var defaults to `item`; index is always `<var>Index`).
   - collection list → a frontmatter `const xList = await getCollectionList("blog", { ... }, Astro)`
     then `{ xList.map((blog, blogIndex) => ( … )) }` (loop var defaults to `singularize(source)`).
   ⚠ If you author a collection list, make the loop variable match the templates in the
   body (`(blog, blogIndex)` + `{{blog.title}}`). Set `itemAs` if you want a specific name.
   A known bug: legacy `cms-list` migration uses `{{item.*}}` in the body but binds
   `singularize(source)` — keep them consistent when editing by hand.

8. **Other node forms (use the exact tags):**
   - `<Link href="/x">…</Link>` (link) · `href={i18n({...})}` or `href={href({...})}` for
     i18n/mapping hrefs.
   - `<Embed html={`<svg>…</svg>`} />` (single-line) or hoist multi-line HTML to a
     frontmatter `const __embedN = \`…\`` and use `html={__embedN}`.
   - `<slot />` / `<slot>fallback</slot>`.
   - `<LocaleList … />` (locale switcher; style sub-props wrapped in `style(...)`, editor
     meta in a single `meta={{...}}`).
   - Dynamic tag (`h{{size}}`) → frontmatter `const Tag_0 = \`h${size}\`` + `<Tag_0>…</Tag_0>`.

9. **Verbatim JS expressions survive; foreign `class`/frontmatter do not (yet).** An
   un-evaluatable `{expr}` (a function/method call like `{(price * 0.8).toFixed(2)}`,
   `{items.map(fn)}`) is preserved as a `{ _code, expr }` marker and reported as a
   `verbatim` region — it round-trips and builds, it just isn't an editable binding. Prefer
   a real `{{binding}}` when the template engine can evaluate it (identifier/member/
   operators/ternary). The `rawClass` (raw Tailwind `class="…"`) and frontmatter escape
   hatches are still **not** implemented — stay inside the grammar for those.

10. **Serialization is deterministic.** All literals (style/props/meta/i18n/list config) are
    printed with stable key order, JSON string escaping, and 80-col wrapping. Don't hand-tune
    formatting — a save re-emits canonically anyway. Drop empties: empty `style`, empty
    `children`, empty `meta`/`interface`, and a lone array child collapse on normalization.

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

**CMS template page** (`src/pages/<collection>/[slug].astro`) — a page whose
`meta.source === "cms"` + `meta.cms` schema; the body renders the current item's plain
fields via `{i18n(cms.field)}` and a **rich-text** field bound as a text child via
`<Fragment set:html={richTextWithComponents(cms.field, cmsComponents)} />` — never a text
interpolation (a plain `{i18n(cms.richField)}` would print `[object Object]`).
`richTextWithComponents` converts the TipTap value to HTML **and renders components
embedded in the rich text** (TipTap `menoComponent` nodes) against `cmsComponents`, the
generated registry module (`src/cmsComponents.ts` — don't hand-edit it; it's a constant
`import.meta.glob` over `src/components/`). An **embed node** bound to a rich-text field
still uses `<Embed html={i18n(cms.field)} />`. The `import { getCollection }`,
`getStaticPaths()`, `const { cms } = Astro.props;`, and the `cmsComponents` import are
**derived boilerplate** — they're regenerated from the model on emit and the parser skips
them, so don't hand-edit them for meaning (edit `meta.cms` instead). The route directory
comes from `meta.cms.urlPattern` (`/blog/{{slug}}` → `src/pages/blog/[slug].astro`). The
editor still addresses it as `/templates/<collectionId>`.
```astro
---
import { getCollection } from 'astro:content';
import { i18n, richTextWithComponents } from 'meno-astro';
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
  <!-- a rich-text field (renders embedded components too): -->
  <Fragment set:html={richTextWithComponents(cms.body, cmsComponents)} />
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

## How to work

1. **Parse `$ARGUMENTS`** for what to author/edit (a component, a page, a specific node
   type). If it's vague, default to inspecting the relevant `src/pages` / `src/components`
   files and proceed — do not pause to ask.
2. **Match the existing style** of the project's `.astro` files (read a couple first;
   `example-astro/src/**` is the reference for real generated output).
3. **Edit the `resolveProps(Astro, {…})` literal** for prop changes; the destructured
   names + their inferred TS types are regenerated on save.
4. **Validate mentally against the grammar** above before writing. If the project has the
   codec available, you can sanity-check a snippet round-trips with:
   ```
   bun -e 'import {emit,parse,normalizeModel} from "meno-astro/dialect"; /* parse(src) then emit(model) */'
   ```
5. **Stay inside the grammar.** Anything you can't express in dialect (raw Tailwind, ad-hoc
   Astro logic) will be lost on the next save — flag it instead of writing it.
