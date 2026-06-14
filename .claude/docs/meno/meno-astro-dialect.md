# Meno-Astro Dialect

The **meno-astro dialect** is a constrained, fully round-trippable subset of `.astro`
syntax that the `meno-astro` codec emits and parses. It lets a Meno project use
`.astro` files as the on-disk source of truth instead of `*.json`, while preserving the
exact Meno in-memory model byte-for-byte across save → load.

This document specifies the grammar: how each Meno node type maps to dialect markup, the
frontmatter conventions, the round-trip contract, and the escape-hatch model. Every code
snippet here is taken from real generated output (`example-astro/`) or from the
round-trip gate test (`packages/astro/lib/dialect/roundtrip.test.ts`).

> **Audience.** This is for tooling authors, AI agents editing `.astro` source, and
> anyone reasoning about how Meno persists projects. If you only want the rules for
> *writing* valid dialect, jump to the [Authoring cheat-sheet](#authoring-cheat-sheet)
> or use the `/meno-astro` skill.

---

## 1. Why a dialect?

Meno's editor works on an in-memory **model**: pages are `JSONPage` trees, components are
`StructuredComponentDefinition`s (both defined in `meno-core/shared/types`). Historically
that model is persisted verbatim as JSON (`pages/*.json`, `components/*.json`).

The dual-format system adds a second on-disk representation: the same model serialized as
`.astro` files under `src/pages/` and `src/components/`. The motivation:

- **`.astro` is a real, runnable framework format.** A Meno project stored as dialect can
  (once the runtime is finished — see [API doc Status](./meno-astro-api.md#status)) be
  built with `astro build` directly, instead of through Meno's bespoke SSR.
- **Better diffs and hand-editing.** A `.astro` file with a `<style>` block, a
  `resolveProps(Astro, {…})` prop block, and JSX-ish markup reads far more naturally in
  a PR than a deeply nested JSON blob.
- **No lock-in to the JSON runtime.** JSON remains the default; nothing in `meno-core`
  moves. A project opts in via `project.config.json` `"format": "astro"` (or by having a
  `src/pages/` directory). See `detectProjectFormat` in
  `packages/astro/lib/server/detectFormat.ts`.

The codec is **editor/build-only**. It is *not* shipped into generated projects' runtime;
`meno-astro/dialect` (`emit`/`parse`) is used by the Studio editor on read/save and by
the conversion tooling. The thin runtime helpers the emitted code *imports*
(`style()`, `i18n()`, …) are a separate concern — see
[§9 Runtime contract](#9-runtime-contract).

---

## 2. The codec: `emit` / `parse`

Entry point: `packages/astro/lib/dialect/index.ts`.

```ts
import { emit, parse, normalizeModel } from 'meno-astro/dialect';

emit(model: DialectModel): string;          // model → deterministic .astro source
parse(source: string): ParseResult;          // .astro source → { model, regions }
normalizeModel(model: unknown): unknown;      // canonicalize a model (see §8)
```

- `DialectModel = JSONPage | StructuredComponentDefinition | ComponentFile`, where
  `ComponentFile = { component: StructuredComponentDefinition }`.
- `ParseResult = { model: DialectModel; regions: MenoRegion[] }`.
- `emit()` calls `normalizeModel()` on its input first, so it accepts raw models and
  always produces canonical `.astro`.
- `parse()` returns a `normalizeModel`-ed model, so the editor always sees a canonical
  model regardless of formatting in the source.

`emit` dispatches on shape:

| Input shape | Emitted as |
|---|---|
| `{ component: {…} }` | a component `.astro` file (`emitComponent`) |
| top-level `structure`/`interface`/`javascript`/`css` | a component `.astro` file |
| anything else (has `meta`/`root`/`components`) | a page `.astro` file (`emitPage`) |

---

## 3. File structure

### 3.1 Page file (`src/pages/<slug>.astro`)

A `JSONPage` becomes frontmatter (imports + `const meta`) followed by the node
tree wrapped in `<BaseLayout meta={meta}>`. From `example-astro/src/pages/list-demo.astro`:

```astro
---
import { BaseLayout } from 'meno-astro/components';
import ListSection from '../components/ListSection.astro';

const meta = {
  title: "List Demo",
  description: "Demonstrates the List node with prop-based iteration"
};
---
<BaseLayout meta={meta}>
  <main>
    <ListSection title="Our Features" items={[ /* … */ ]} />
  </main>
</BaseLayout>
```

- `const meta = {…}` is the page's `meta` payload, emitted
  as a deterministic JS literal (`MenoPageMeta = NonNullable<JSONPage['meta']>`).
  Emit a **plain `const meta`** — never `export const meta`, and **never** a
  `satisfies MenoPageMeta` annotation (nor its `import type {…}`). `satisfies` is a
  TS-only operator that breaks the `astro build` frontmatter parse (`Expected ";"`),
  an empty `export const meta = {}` fails Astro's hoist, and the runtime ships no types.
- The page body is `page.root`, indented two spaces inside `<BaseLayout>`.
- A page with no `root` emits `<BaseLayout meta={meta} />`.
- Local component imports are alphabetized, relative to the page file's directory. A
  top-level page (`src/pages/<slug>.astro`) uses `../components/`; a nested route (see
  the CMS template below, at `src/pages/<col>/[slug].astro`) uses `../../components/` —
  the `../` depth is derived from the route directory so the emitted import resolves.

> **Not yet:** page-scoped `components` are not emitted yet. See
> [API Status](./meno-astro-api.md#status).

#### 3.1.1 CMS template page (`src/pages/<collection>/[slug].astro`)

A page whose `meta.source === "cms"` and that carries a `meta.cms` schema is a **CMS
template page**. Its body renders the *current* item via `{{cms.field}}` templates. It
emits as an idiomatic Astro dynamic route at `src/pages/<collection>/[slug].astro`, where
`<collection>` is the static prefix of `meta.cms.urlPattern` (`/blog/{{slug}}` → `blog/`).
From `example/templates/blog-post.json` (a `blog` collection):

```astro
---
import { getCollection } from 'astro:content';
import { richTextWithComponents, style } from 'meno-astro';
import { BaseLayout } from 'meno-astro/components';
import Heading from '../../components/Heading.astro';
import { cmsComponents } from '../../cmsComponents';
/* …alphabetized component imports… */

export async function getStaticPaths() {
  const entries = await getCollection("blog");
  return entries.map((entry) => ({
    params: { slug: entry.data.slug ?? entry.id },
    props: { cms: entry.data },
  }));
}

const { cms } = Astro.props;

const meta = {
  title: "{{cms.title}} | Blog",
  source: "cms",
  cms: { id: "blog", slugField: "slug", urlPattern: "/blog/{{slug}}", fields: { /* … */ } }
};
---
<BaseLayout meta={meta}>
  <!-- body: plain fields {{cms.field}} → {i18n(cms.field)} (§6.4 — raw entry.data
       needs the resolver). A RICH-TEXT field bound as a text child renders through
       `<Fragment set:html={richTextWithComponents(cms.field, cmsComponents)} />`,
       NOT a text interpolation — a rich-text value is a structured object, so
       {i18n(cms.richField)} would print [object Object] — and embedded components
       (TipTap `menoComponent` nodes) render against the generated registry. See §6.4. -->
</BaseLayout>
```

- **Authoritative on parse** (read back into the model): the `const meta` literal
  (incl. `meta.cms`, `source`, `urlPattern`) is the page meta + schema; the body markup is
  `root`. The model round-trips exactly: `parse(emit(normalizeModel(t))) === normalizeModel(t)`.
- **Derived / boilerplate (emit-only)**: the `import { getCollection }`, the
  `getStaticPaths()` function, `const { cms } = Astro.props;`, and the
  `import { cmsComponents } from '<rel>/cmsComponents'` registry import (added whenever the
  body binds a rich-text field, [§6.4](#64-cms-data-bindings-wrap-in-i18n)) are regenerated
  deterministically from `meta.cms` on emit. The parser **recognizes and skips** them —
  exactly like it skips `interface Props` / the `resolveProps` destructuring for
  components — so they carry no model state. (Helpers: `packages/astro/lib/dialect/cmsRoute.ts`.)
- **Editor path.** `AstroPageProvider` maps a CMS template route back to the JSON-mode page
  path `/templates/<collectionId>` (not its on-disk `/<col>/[slug]` route), so PageService,
  the CMS panel, and template editing are unchanged. CMS items live in
  `src/content/<collection>/` (Astro's content layer); schemas are read from these template
  pages' `meta.cms` by `AstroCMSProvider`.
- **Assumptions / degradation.** The common case is a single static collection segment +
  `{{slug}}`. Multi-segment prefixes (`/docs/guides/{{slug}}` → `docs/guides/[slug].astro`)
  are kept verbatim. A pattern with no static prefix (e.g. `/{{slug}}`, or a locale-prefixed
  `/{{locale}}/blog/{{slug}}` whose first placeholder is the locale) degrades to a root-level
  `[slug].astro`; locale-prefixed multi-locale routes are not specially handled (the dialect
  is single-locale — that's the one-way `build-astro` exporter's job). The route param is
  always `slug`; `slugField` only drives `entry.data.<slugField>` inside `getStaticPaths`.

### 3.2 Component file (`src/components/<Name>.astro`)

A `StructuredComponentDefinition` becomes frontmatter (imports, a single
`resolveProps(Astro, {…})` prop block, optional `__meno` meta) + body + optional
`<style>` / `<script>`. The frontmatter is assembled by `emitComponent`
(`packages/astro/lib/dialect/emit/emitComponent.ts`):

```astro
---
import { resolveProps, href, style } from 'meno-astro';
import { Embed, Link } from 'meno-astro/components';

const { text, isMarginTop, link, class: className } = resolveProps(Astro, {
  text: { type: "string", default: "Link" },
  isMarginTop: { type: "boolean", default: false },
  link: { type: "link", default: { href: "#" } }
});

const __meno = { category: "ui" };
---
<!-- body -->
```

(verbatim from `example-astro/src/components/Button.astro`, body elided.)

The single `resolveProps(Astro, {…})` call is the key design decision — there is **no
separate `interface Props` / `__meno_props`**. One authoritative source, emitted once:

| Frontmatter member | Role | Round-tripped? |
|---|---|---|
| `resolveProps(Astro, {…})` argument | **Authoritative** prop definition — exactly what `parse()` reads back into `def.interface` (same literal the old `__meno_props` carried) | **Yes.** |
| `const { …names…, class: className } = …` destructure | **Emit-only** — binds the prop names for the body; the parser ignores it. TS types of the locals are **inferred** from the literal by `resolveProps` (no hand-written `interface Props`). | **No.** Re-generated from the literal on emit. |
| `const __meno = {…}` | Component metadata: `category`, `acceptsStyles`, `libraries` | **Yes.** Omitted entirely if empty. |

The destructure always binds `class: className` so every component instance can carry
wrapper styles, and the call is emitted even for an empty interface
(`const { class: className } = resolveProps(Astro, {});`). `resolveProps` merges
`Astro.props` over each def's `default` at runtime and infers each local's type from its
definition (`number`/`boolean`/`{ href; target? }`/`unknown[]`/a union of `select`
options / `string` fallback). The `children` prop is skipped in the destructure.

- `<style>` ← `def.css`, emitted as `<style is:global>\n{css}\n</style>`. Global, not
  Astro-scoped, for meno-core parity (component CSS is injected globally there): default
  scoping rewrites every selector with a scope attribute, which breaks selectors that
  target slotted children (`[data-el="…"] > *` — slot content comes from another
  component) and JS-created elements (`document.createElement` output is never scoped).
  The parser also accepts a plain `<style>` (files emitted before the directive existed);
  emit canonicalizes to `is:global`.
- `<script>` ← `def.javascript`. When `def.defineVars` is set (`true` = all interface
  props, or a `string[]` subset), the script is emitted as Astro's native
  `<script define:vars={{ a, b }}>` — which injects those props into the inline script
  and already forces inline (no `is:inline`). Without `defineVars`, it's a plain
  `<script is:inline>`. On parse, a `define:vars={{…}}` attribute is read back into
  `def.defineVars`; `normalizeModel` collapses a list naming every prop to `true`, and
  drops a `defineVars` that has no script to carry it. (`defineVars` is **not** in `__meno`.)
- A component with no `structure` emits `<slot />` as its body.

---

## 4. Node-type → markup mapping

This is the grammar. The walker is `packages/astro/lib/dialect/emit/emitNode.ts`; its
inverse is `packages/astro/lib/dialect/parse/parseBody.ts`. There are seven Meno node
types plus a fallback.

| `type` | Emitted markup | Notes |
|---|---|---|
| `node` | `<tag …>children</tag>` | Standard HTML element. Void tags self-close. |
| `component` | `<Name prop=… />` | Capitalized tag; props as JSX attributes. |
| `slot` | `<slot>fallback</slot>` or `<slot />` | `default` children become slot fallback. |
| `link` | `<Link href=…>children</Link>` | Runtime `Link` component. |
| `embed` | `<Embed html={…} />` | Raw HTML/SVG passthrough. |
| `list` | `{ list(src,{…}).map((item, itemIndex) => ( … )) }` (prop) or a frontmatter `getCollectionList` const + `{ X.map(…) }` (collection) | See §5. |
| `locale-list` | `<LocaleList … />` | Locale switcher. |
| *unknown* | `{/* meno:unknown "type" */}` | Nothing is silently dropped. |

### 4.1 `node` — HTML element + styles

Styles are emitted as a `class={style(STYLE_OBJECT[, META])}` attribute. The first
argument is the **verbatim Meno `StyleObject`** — responsive breakpoints (`base` /
`tablet` / `mobile`) and prop `_mapping` bindings included. From
`example-astro/src/components/Button.astro`:

```astro
<span class={style({ base: { color: "var(--text)" }, tablet: {}, mobile: {} })}>{text}</span>
```

A style mapping (a value bound to a prop) stays inline in the literal:

```astro
marginTop: {
  _mapping: true,
  prop: "isMarginTop",
  values: { true: "40px", false: "0" }
}
```

HTML `attributes` are emitted after the class. Scalar string attributes without quotes or
newlines use the bare form (`src="/x.jpg"`); strings with `{{…}}` templates become
`name={expr}` (a CMS-data binding additionally wraps in `i18n(…)` —
[§6.4](#64-cms-data-bindings-wrap-in-i18n)); numbers/booleans become `name={3}` /
`name={true}`; objects/i18n values become literal/`i18n(…)` expressions. Void elements
(`img`, `br`, `input`, …) self-close and ignore children.

```astro
<img class={style({ base: { objectFit: "cover" }, tablet: { height: "380px" }, mobile: {} })} src="/images/img.jpg" alt="" />
```

#### The `style()` second argument (`meta`)

When a node carries editor metadata — `interactiveStyles`, `label`, or
`generateElementClass` — it is emitted as a second `style()` argument, renamed:

| Model field | `meta` key |
|---|---|
| `interactiveStyles` | `interactive` |
| `label` | `label` |
| `generateElementClass` | `genClass` |

From `example-astro/src/components/Heading.astro` (a dynamic-tag heading, see §6.3):

```astro
<Tag_0 class={style({
    base: { /* … responsive + mappings … */ },
    tablet: {},
    mobile: {}
  }, {
    interactive: [
      {
        name: "onHover",
        postfix: ":hover",
        style: { base: { fontSize: "100px" } }
      }
    ],
    label: "text"
  })}>{text}</Tag_0>
```

> **Note (instance styles — how a parent override reaches a component root):** when a
> `component` instance carries a wrapper `style`, the emitter adds an `instance: true`
> marker to that meta object **and** forwards the same style as an emit-only
> `__menoStyle={…}` object prop (see below). The COMPONENT STRUCTURE ROOT's class attr
> always carries a `root: true` marker (a style-less root still emits
> `class={style({}, __props, { root: true })}`): the runtime `style()` then merges the
> instance class the parent passed (`__props.class`) over the root's own classes —
> instance wins per (breakpoint, CSS property), mirroring meno-core's instance-over-root
> style merge. On parse, the markers `instance`, `kind`, `root`, and the `__menoStyle`
> prop are intentionally dropped (`interpretStyleCall` / `otherAttrs`) — they're emit-only
> and re-derived every emit — so they do not pollute the model.

#### Prop-bound style values → an inline `style=…` (and why instance styles need `inlineStyle`)

A style value bound to a prop with a `{{template}}` (e.g. `maxWidth: "{{maxWidth}}"`) is
per-instance, so it **cannot** become a static build-time utility class. The emitter keeps
it in the `style({...})` literal (so it round-trips) but ALSO renders it as a literal inline
`style=…` attribute, resolved against the host props:

```astro
<!-- on a plain node: a bare inline template literal -->
<div class={style({ base: { gap: "{{gap}}px" } })} style={`gap: ${gap}px`}>

<!-- on a COMPONENT STRUCTURE ROOT: wrapped in inlineStyle(…, __props) -->
<Tag_0 class={style({ base: { maxWidth: "{{maxWidth}}" } }, __props, { root: true })}
       style={inlineStyle({ "max-width": `${maxWidth}` }, __props)}>
```

The wrap matters because **an inline `style=` attribute outranks any utility class.** Without
it, a parent that overrides that property via an instance style (`max-w-[889px]`, a class
that DID merge onto the root) would silently lose to the root's own inline `max-width: 100%`.
`inlineStyle()` reads the instance overrides off `__props.__menoStyle` and **drops any inline
declaration the instance overrides** — so the instance's utility class wins, restoring
meno-core's single-object instance-over-root merge (`styleProcessor.mergeComponentStyles`).
A static / `_mapping` instance value suppresses the inline (it produced a class); a
`{{template}}` instance value does **not** (it has no class, so the root keeps its own
value). `style=…` is dropped on parse (the templated value is recovered from the `style({...})`
literal), so both the plain and `inlineStyle(…)` forms round-trip identically.

> **Note (the link UA reset):** meno-core seeds every `link` node with a hardcoded `.olink`
> class (`display:block; text-decoration:none; color:inherit`). meno-astro reproduces this
> the Tailwind-native way — as the utilities `block no-underline text-inherit` — but applies
> it **intrinsically in the `Link.astro` runtime component** (via `linkClass`), NOT as a
> per-node marker in the source. So it reaches *every* `<Link>` at render with no emit change
> and no re-conversion of existing projects (the emitter emits a bare `<Link>` for a
> style-less link). It's conflict-aware: a reset utility is kept only when the link's own
> classes don't already set that CSS property, so an explicit `display:flex` drops `block`,
> an authored underline drops `no-underline`, etc. Build-time CSS (`utilityCss.ts`) emits the
> reset's rules for every link node so the classes always have matching CSS. (The `.oem`
> embed reset is not dissolved — its `.oem > *` child rule has no single-utility form — and
> stays SSR-only for now.)

### 4.2 `component` — instance

Component props become JSX attributes; the component name is registered for a local import
(`astroComponentName` upper-cases the first letter). i18n prop values are wrapped in
`i18n({…})`. From `example-astro/src/pages/about.astro`:

```astro
<Navigation language="EN" logoText="Asseco" theme="light" />
<Heading size={1} text={i18n({ _i18n: true, en: "About Us", pl: "O nas" })} align="center" />
<Button isMarginTop={true} text={i18n({ _i18n: true, en: "Services", pl: "Usługi", de: "" })} link={{ href: "/services" }} />
```

- `size={1}` — number prop.  `isMarginTop={true}` — boolean prop.
- `link={{ href: "/services" }}` — object (link) prop as a literal.
- `text={i18n({…})}` — an i18n value (`{ _i18n: true, … }`) wrapped in the runtime
  `i18n()` resolver.
- A prop bound to a CMS-data chain also wraps: `text="{{cms.title}}"` →
  `text={i18n(cms.title)}`, so the instance receives the locale-resolved string
  ([§6.4](#64-cms-data-bindings-wrap-in-i18n)).

### 4.3 `link`

```astro
<Link href="/pricing">Pricing</Link>
```

`href` resolution mirrors attribute resolution: a plain string stays `href="…"`; a string
with `{{…}}` becomes `href={expr}`; an i18n value → `href={i18n({…})}`; any other
structured value (a `LinkMapping` like `{ _mapping: true, prop: "link" }`) →
`href={href({…})}`. From `Button.astro`:

```astro
<Link href={href({ _mapping: true, prop: "link" })} class={style({ … })}>
```

### 4.4 `embed`

Raw HTML/SVG. A **single-line** payload is inlined as a backtick template literal:

```astro
<Embed html={`<svg><path d="M0 0"/></svg>`} />
```

A **multi-line** payload is hoisted to a frontmatter `const __embedN = \`…\`` (so the
placer never re-indents the verbatim HTML) and referenced by name. From
`example-astro/src/pages/index.astro`:

```astro
---
const __embed0 = `<svg width="515" height="84" …>
<path d="…" fill="#74B0FF" />
</svg>`;
---
<Embed html={__embed0} />
```

If `html` is *not* a string (a structured value), it is wrapped in `embedHtml({…})`.

### 4.5 `slot`

```astro
<slot />                              <!-- no default -->
<slot><p>fallback</p></slot>          <!-- with default children -->
```

### 4.6 `locale-list`

The locale switcher emits `<LocaleList … />` with its boolean/display props as JSX
attributes, its style sub-objects (`style`, `itemStyle`, `activeItemStyle`,
`separatorStyle`, `flagStyle`) each wrapped in `style(…)`, and any
`interactiveStyles`/`label`/`generateElementClass` collected into a single
`meta={{…}}` attribute. Unknown scalar props are passed through. Example shape (from the
round-trip fixtures):

```astro
<LocaleList displayType="nativeName" showFlag={true} style={style({ base: { display: "flex" } })} itemStyle={style({ padding: "4px" })} />
```

---

## 5. Lists

A `list` node renders differently depending on `sourceType` (default `"prop"`).

### 5.1 Prop list

```astro
{ list(items, { limit: 6 }).map((thing, thingIndex) => (
    <span>{thing.label}</span>
)) }
```

- The source is the prop expression. After normalization the source is canonicalized to a
  `{{…}}` template (e.g. `{{items}}`); the emitter unwraps it to the bare identifier
  `items` for the `list()` call.
- `itemAs` controls the loop variable (default `item`); the index variable is always
  `<itemAs>Index`.
- `limit` / `offset` become the `list()` options object; omitted when absent.

### 5.2 Collection list

A CMS-backed list hoists its query to a frontmatter `const` and maps over it. From
`example-astro/src/pages/filter-demo.astro`:

```astro
---
const productsList = await getCollectionList("products", { emitTemplate: true }, Astro);
---
<!-- … -->
{productsList.map((item, itemIndex) => (
  <div class={style({ … })} data-id={i18n(item._id) || undefined} data-category={i18n(item.category) || undefined}>
    <!-- … -->
  </div>
))}
```

- The binding name is `<sanitizedSource>List` (deduplicated with a counter if needed).
- The loop variable defaults to `singularize(source)` (this legacy `cms-list` migrated
  with `itemAs: "item"` — see the note below).
- Collection items are **raw entry data** (`getCollectionList` returns `entry.data`
  unresolved), so inside the loop the item variable is a CMS-data root: bare
  `{{item.*}}` chains emit wrapped in `i18n(…)` — see
  [§6.4](#64-cms-data-bindings-wrap-in-i18n). (The `|| undefined` is the separate
  empty-template attribute guard, meno-core's `skipEmptyTemplateAttributes` parity.)
- Query fields hoisted into the `getCollectionList` literal: `filter`, `sort`, `limit`,
  `offset`, `items`, `excludeCurrentItem`, `emitTemplate`.
- `getCollectionList` receives `Astro` as its last argument (so it can resolve the current
  route/locale at build time).

> **Note (legacy cms-list loop variable).** Legacy `cms-list` children use the implicit
> `{{item.*}}` convention, so the migration (`normalize.ts`) rewrites `cms-list → list`
> **and sets `itemAs: "item"`** — the emitted loop binds `item`, matching the children
> (e.g. `filter-demo` emits `.map((item, itemIndex) => …)`). A *native* collection list
> authored with `sourceType: "collection"` and no `itemAs` still defaults its loop
> variable to `singularize(source)`, so write its children's templates to match.

---

## 6. Templates, conditionals, dynamic tags

### 6.1 `{{expr}}` templates → JS expressions

`templateToExpr` (in `emitNode.ts`) converts Meno's `{{ … }}` template syntax:

- A string that is *exactly one* template (`"{{ expr }}"`) → the bare expression `expr`.
- A string with embedded templates (`"Hi {{name}}!"`) → a backtick template literal
  `` `Hi ${name}!` ``.

In **text children**: a sole, brace/angle-free text child may stay raw
(`<h1>Hello</h1>`); text with siblings or special characters is emitted as a `{"…"}`
expression so adjacent text nodes stay distinct on parse. Both forms parse back to the
same text. From `index.astro`:

```astro
<p class={style({ … })}>
  {"Even "}
  <span class={style({ base: { fontStyle: "italic" } })}>great products</span>
  {"when users don’t know what to do next. "}
</p>
```

> **Subtlety:** templates that appear *inside* a `StyleObject` value are **not** converted
> to `${}` — they remain string literals inside the `style()` argument. From
> `Heading.astro`: `maxWidth: "{{maxWidth}}"`. The style object is opaque to the
> template-to-JS conversion; only attribute/child/href positions get converted. (See
> [§10.1](#101-known-gaps) — this is a latent runtime concern, not a round-trip one.)

### 6.2 Conditionals (`if`)

A node with an `if` is wrapped by `applyIf`:

| `if` value | Emitted |
|---|---|
| `true` (or absent) | no wrapper |
| `false` | `{false && ( … )}` |
| `"{{visible}}"` (string template) | `{visible && ( … )}` |
| other string | used verbatim as the condition |
| `BooleanMapping` `{ _mapping, prop, values }` | `{when({…}) && ( … )}` |

```astro
{visible && (
  <div>A</div>
)}
```

For an element the wrapper is `cond && ( <markup> )`; for an expression node (a nested
list/conditional) it is `cond && (expr)`.

### 6.3 Dynamic tags (`h{{size}}`)

An HTML tag containing a template (e.g. `"h{{size}}"`) cannot be a literal JSX tag, so it
is hoisted to a frontmatter `const Tag_N = \`h${size}\`` and referenced as `<Tag_N …>`.
From `Heading.astro`:

```astro
---
const Tag_0 = `h${size}`;
---
<Tag_0 class={style({ … })}>{text}</Tag_0>
```

On parse, `parseFrontmatter` records `Tag_0 → "h{{size}}"` and `elementToNode` restores
the original tag string.

### 6.4 CMS-data bindings wrap in `i18n()`

The two CMS render paths that the emitted boilerplate drives — the default-locale
`getStaticPaths` (`props: { cms: entry.data }`, [§3.1.1](#311-cms-template-page-srcpagescollectionslugastro))
and `getCollectionList` ([§5.2](#52-collection-list)) — pass **raw** entry data. An
i18n field value (`{ _i18n: true, en: "…", pl: "…" }`) interpolated by a bare `{cms.title}`
would render as `[object Object]`. (Non-default locale routes are unaffected: the injected
`LocaleRoute` passes locale-*resolved* `cms` props.) The emitter therefore wraps these
bindings in the runtime `i18n()` resolver, which is **identity for non-i18n values**, so
the wrap is always safe.

**Emit rule** (`maybeWrapI18n` in `emitNode.ts`). A `{{expr}}` template emits wrapped as
`i18n(expr)` when **both** hold:

1. `expr` is a **bare identifier/member dot-chain** (`cms`, `cms.title`, `cms.title.pl`,
   `item._id`). Operator/ternary/call/index expressions (`{{cms.price * 2}}`,
   `{{cms.tags[0]}}`) are **not** wrapped — they already coerce their operands and are an
   authored-JS concern.
2. The chain's **root identifier is a CMS-data binding in scope**:
   - `cms` — on a CMS template page (`meta.source === 'cms'`), and inside a component
     that receives the forwarded `cms` (its `Astro.props` item bindings include `cms`);
   - the **loop variable of a collection list** (`sourceType: 'collection'`), only within
     that loop. Prop-list loop variables are never wrapped.

The wrap applies in **value positions** — text children, HTML attributes, component
props, `href`, embed `html` — in both expression forms: whole-template
(`{{cms.title}}` → `{i18n(cms.title)}`) and template-literal interpolation
(`"By {{cms.author}}"` → `` `By ${i18n(cms.author)}` ``). The empty-template attribute
guard composes with it: `fade="{{cms.fade}}"` → `fade={i18n(cms.fade) || undefined}`.
Positions that are **not** value interpolations keep the bare expression: list sources,
`if` conditions, dynamic tags, templates nested in structured-prop literals
(`link={{ href: cms.url }}`), inline `style={…}` attrs, and `StyleObject` values
([§6.1](#61-expr-templates--js-expressions)).

A **forced-locale suffix** needs no special case: `{{cms.title.pl}}` →
`{i18n(cms.title.pl)}` — the member access already yields the plain string, and `i18n()`
passes it through.

> **Rich-text CMS fields are the exception — they render as HTML, not a text
> interpolation.** A `rich-text` field value is a structured object (a TipTap doc), so
> `{i18n(cms.body)}` would print `[object Object]` (the wrap is identity on the object and
> Astro string-coerces an object child), and text interpolation HTML-escapes anyway. A
> `{{cms.body}}` **text child** whose field is declared `type:"rich-text"` (the page's own
> `meta.cms.fields`; for shared components, the project-wide union the converter threads —
> `EmitOptions.cmsRichTextFields`) emits as
> `<Fragment set:html={richTextWithComponents(cms.body, cmsComponents)} />` plus an
> `import { cmsComponents } from '<rel>/cmsComponents'` — the converter-generated registry
> module (`src/cmsComponents.ts`, an eager `import.meta.glob` over `src/components/`).
> `richTextWithComponents()` resolves the per-locale value, converts TipTap → HTML, and
> renders embedded components (TipTap `menoComponent` nodes) for real: URL-bearing embeds
> (Youtube/Vimeo) become their responsive iframe; any other component is rendered to HTML
> via Astro's Container API against the registry. An **embed node** binding a rich-text
> field (`type:"embed"` with `html: "{{cms.body}}"`) still renders through
> `<Embed html={i18n(cms.body)} />` (`Embed` normalizes the value via `toHtmlString`).
>
> **Parse rule:** `richTextWithComponents(<chain>, cmsComponents)` reverses to the
> `{{<chain>}}` text child (the registry arg is emit-only plumbing); the legacy single-arg
> `richText(<chain>)` form still reverses too, so files emitted before the registry
> existed keep parsing. Like the `i18n()` wrap, the spelling is reserved — emit is the
> sole authority on where it appears.

**Parse rule** (`reverseI18nWrap` in `parseLiteral.ts`). In every expression position
(whole expression, `${…}` interpolation, structured-literal value, the `|| undefined`
guard), `i18n(<bare member chain>)` reverses to the `{{<chain>}}` template — **always**,
regardless of root. The argument shape disambiguates the two `i18n()` forms:

| Argument | Meaning | Parses to |
|---|---|---|
| object literal — `i18n({ _i18n: true, … })` | i18n **value** ([§4.2](#42-component--instance)) | the `I18nValue` object |
| bare member chain — `i18n(cms.title)` | wrapped **binding** | `"{{cms.title}}"` |
| plain literal — `i18n("Hello")`, `i18n(42)`, `i18n(["a"])` | hand-authored identity wrap | the literal value (editable; the redundant wrap normalizes away on the next save) |
| anything else — `i18n(fn(x))`, `i18n(v, "pl")` | authored JS | verbatim `{ _code, expr }` |

Because parse always unwraps bare chains but emit re-wraps only cms/collection-item
roots, a hand-authored `i18n(<chain>)` whose root is *not* a CMS-data binding
**normalizes to the unwrapped binding** on the next save (`{i18n(someVar)}` →
`{{someVar}}` → re-emits as `{someVar}`). This is deliberate: the emitter is the single
authority on wrap placement, values reaching non-CMS scopes are already locale-resolved
(or plain), and the round-trip stays byte-stable for every emitter-produced file. A
consequence: a model template must never itself contain an `i18n(...)` call text — that
spelling is reserved as the emitted encoding of the binding (meno-core's template grammar
cannot evaluate calls anyway).

---

## 7. Deterministic serialization

Every non-structural payload (style objects, props, `meta`, the `resolveProps(Astro,
{…})` argument, i18n values, list config, mappings) is printed by `serializeLiteral`
(`packages/astro/lib/dialect/emit/serialize.ts`) — the round-trip linchpin:

- **Deterministic & diff-stable.** Stable key order (insertion order, `undefined` values
  dropped). Strings use JSON double-quote escaping.
- **Valid JS.** Object keys are unquoted when they are valid identifiers, quoted
  otherwise (`"1": "67px"`).
- **Width-aware.** Values whose inline form fits within 80 columns render inline;
  otherwise they expand to one entry per line, indented relative to where the value
  starts. This is purely cosmetic and does not affect parsing.

The parser side is `parseLiteral.ts` — a tiny total recursive-descent evaluator over the
exact grammar `serialize` emits (object | array | string | number | boolean | null). No
`eval`, no JS engine. It throws on anything outside that grammar (which, for in-dialect
input, never happens).

---

## 8. Normalization & the round-trip contract

### 8.1 The contract

The gate, enforced by `packages/astro/lib/dialect/roundtrip.test.ts` over every file in
the `example/` project plus hand-built per-node fixtures:

```
parse(emit(x)) === normalizeModel(x)                  // exact, up to normalization
parse(emit(normalizeModel(x))) === normalizeModel(x)  // exact on canonical input
```

`normalizeModel` is **idempotent**: `normalizeModel(normalizeModel(x)) === normalizeModel(x)`.

In words: round-trip is **exact** on canonical models. The codec applies `normalizeModel`
on both `emit` (input) and `parse` (output), so the editor always works with a canonical
model and never sees formatting-induced churn.

### 8.2 What `normalizeModel` does

From `packages/astro/lib/dialect/normalize.ts`:

1. **Drops content-free defaults** so emit and parse agree on absence:
   - empty/whitespace-only `style` → removed (`hasStyleContent`);
   - empty `children` / `default` arrays → removed;
   - empty `meta` (page) and empty `interface` (component) → removed.
2. **Collapses a single text child:** a one-element array `["text"]` is indistinguishable
   from the bare string `"text"` after parse, so both canonicalize to the string.
3. **Canonicalizes prop-list sources:** a bare `source: "items"` becomes
   `source: "{{items}}"` (the form the editor uses). Drops a redundant `itemAs` that equals
   the implicit default (`"item"` for prop lists, `singularize(source)` for collection
   lists).
4. **Migrates legacy node types:**
   - `cms-list` → `{ type: "list", sourceType: "collection", source: <collection> }`. If
     the `cms-list` also carried `style`/`attributes` (a styled container + repeater), it
     splits into a wrapper `div > list`.
   - `image` → `{ type: "node", tag: "img" }` with `src`/`alt` folded into `attributes`.

Because normalization is applied on load, you can hand-write a `.astro` file in
non-canonical form (extra empty `tablet: {}`, a lone array child, etc.) and it will parse
to the same canonical model — but the *next* save will re-emit it canonically.

---

## 9. Runtime contract

The emitted `.astro` imports a small set of helpers from `meno-astro` and
`meno-astro/components`. These are the symbols the grammar targets:

| Import | From | Purpose |
|---|---|---|
| `style(styleObj, props?, meta?)` | `meno-astro` | Resolve a Meno `StyleObject` (responsive + prop mappings) to a class string; the matching CSS is generated at build time by the `meno()` integration (`virtual:meno-utilities.css`). |
| `i18n(value)` | `meno-astro` | Resolve an `{ _i18n: true, … }` value for the active locale; **identity for non-i18n values**. Carries both i18n value literals (`i18n({…})`) and wrapped CMS-data bindings (`i18n(cms.title)`, [§6.4](#64-cms-data-bindings-wrap-in-i18n)). The locale context is opened per render by the injected locale middleware (`runWithLocale` over AsyncLocalStorage). |
| `href(linkValue, props?)` | `meno-astro` | Resolve a `LinkMapping` / structured href. |
| `when(mapping, props?)` | `meno-astro` | Resolve a `BooleanMapping` to a boolean (for `if`). |
| `list(src, opts?)` | `meno-astro` | Tolerant prop-list slicing (offset/limit). |
| `getCollectionList(src, query?, Astro, getCollection)` | `meno-astro` | Resolve a CMS collection list at build time. |
| `embedHtml(value, props?)` | `meno-astro` | Resolve a structured embed payload to an HTML string. |
| `richTextWithComponents(value, cmsComponents)` | `meno-astro` | Render a CMS rich-text value (TipTap doc) to HTML **including embedded components**: locale resolve → TipTap → HTML → URL-embed fast path → link localization, then each remaining `menoComponent` marker is rendered via Astro's Container API against the project registry (`src/cmsComponents.ts`, generated by the converter). Returns a promise; `set:html` awaits it natively. ([§6.4](#64-cms-data-bindings-wrap-in-i18n)) |
| `BaseLayout`, `Link`, `Embed`, `LocaleList` | `meno-astro/components` | Runtime Astro components. `Link`/`Embed` localize internal hrefs to the active locale; `BaseLayout` emits hreflang alternates; `LocaleList` renders slug-translated switcher links. |

> **Status: implemented and published** (`meno-astro` on npm; all helpers live in
> `packages/astro/lib/index.ts` + `runtime/*`, components under `lib/components/`).
> Emitted `.astro` files run under `astro dev`/`astro build` with the `meno()`
> integration registered (the converter scaffolds that config). See
> [meno-astro-api.md](./meno-astro-api.md) for the full export surface and
> [meno-astro-i18n.md](./meno-astro-i18n.md) for how localization works end to end —
> locale routing via the injected `/[locale]/[...path]` route, `meta.slugs` and the
> filename-is-default-URL invariant, link localization, hreflang, and the editor's
> slug-rename semantics.

---

## 10. Escape hatches & regions

`parse()` returns `{ model, regions }` where `regions: MenoRegion[]`. A `MenoRegion` is a
tracked source span:

```ts
interface MenoRegion {
  nodeId?: string;                              // model node this span maps to, if any
  kind: 'editable' | 'rawClass' | 'verbatim';  // see below
  start: number;                                // byte offset, inclusive
  end: number;                                  // byte offset, exclusive
}
```

| `kind` | Intent |
|---|---|
| `editable` | In-dialect, fully round-tripped. |
| `rawClass` | A foreign `class="…"` string captured as read-only passthrough. |
| `verbatim` | Arbitrary Astro/JS preserved byte-for-byte (the escape hatch). |

The intent: editing one section should never reformat an untouched region, and
hand-written / non-dialect spans (a raw Tailwind `class="…"`, arbitrary Astro frontmatter
logic) should survive a round-trip untouched.

> **Status: verbatim *expressions* are preserved and reported; `rawClass` and foreign
> frontmatter are not yet.** A `{ … }` value, attribute, or condition holding arbitrary JS
> the template engine can't evaluate (a function/method call like
> `(product.price * 0.8).toFixed(2)`, `items.map(fn)`, `Math.max(a, b)`, …) is preserved as
> a `{ _code: true, expr }` model marker: it round-trips byte-for-byte (multi-line exprs are
> hoisted to a `const __codeN = …;`), renders natively under `astro build`, and is reported
> as a `kind: 'verbatim'` region with its source span. The boundary is **meno-core's own
> template grammar** (`isSupportedTemplateExpression`, mirroring `expressionEvaluator`):
> anything it *can* evaluate — identifier, member access, the supported operators, ternary,
> array — stays a `{{binding}}`, so existing projects are unaffected.
>
> A foreign `class` — a static `class="px-4 flex"` or a non-`style()` expression, possibly
> alongside the dialect's own `class={style(…)}` on the same element — **is preserved**, but
> through the model rather than as a `rawClass` region: it parses to `attributes.class`
> (which meno-core merges into the element's class) and re-emits merged into a single
> `class={style(…) + " px-4 flex"}` attribute (or a plain `class="…"` when the node has no
> style). The merge matters: an element carrying TWO `class` attributes is invalid HTML —
> the browser keeps only the first, so in a real Astro render the foreign class silently
> drops while the meno-core canvas (which merges) looks fine. Parse accepts both the concat
> form and the legacy duplicate-attribute form. No `rawClass` regions are reported yet.
> Still **not** preserved (the next piece of work): arbitrary frontmatter
> (`const`/`import`/functions) — do not hand-author frontmatter logic expecting it to
> survive.

### 10.1 Known gaps

Semantic notes found while documenting the current emitter. They are **round-trip-safe**
(the gate passes) but affect whether the emitted `.astro` would *execute* once the runtime
exists. Also listed in
[the API doc's Known-gaps section](./meno-astro-api.md#known-semantic-gaps-in-current-output).

1. **Legacy `cms-list` loop variable — FIXED.** The migration (`normalize.ts`) now sets
   `itemAs: "item"` for legacy `cms-list`, so the emitted collection loop binds `item`
   to match the children's `{{item.*}}` templates. Verified in `dialect/docs-examples.test.ts`.
2. **Templates inside `StyleObject` values are not converted** ([§6.1](#61-expr-templates--js-expressions)).
   A value like `maxWidth: "{{maxWidth}}"` stays a literal string inside `style({...})`
   rather than becoming `${maxWidth}`. Correct for round-trip; the eventual `style()`
   runtime must resolve `{{…}}` inside style values itself.

---

## Authoring cheat-sheet

If you are writing or editing meno-astro dialect by hand (or as an AI), the rules:

1. **Styles go inside `style({...})`** — never write a raw `class="..."` string and expect
   it to round-trip. The argument is a Meno `StyleObject` (`{ base, tablet, mobile }` or a
   flat object), with prop bindings as `{ _mapping, prop, values }`.
2. **i18n values go inside `i18n({...})`** with the `{ _i18n: true, en, pl, … }` shape.
3. **Templates use `{{…}}` in the model**, which the emitter renders as `{expr}` or
   `` `…${expr}…` ``. To re-introduce a Meno template by hand in markup, write a JSX
   `{expr}` (bare identifier/member/ternary/operators) — the parser turns it back into
   `{{expr}}`. A `{expr}` the template engine *can't* evaluate (a function/method call,
   e.g. `{(price * 0.8).toFixed(2)}`) is **kept verbatim** as `{ _code, expr }` — it still
   builds and round-trips, it just isn't an editable binding.
   1. **CMS-data bindings carry an `i18n()` wrap** ([§6.4](#64-cms-data-bindings-wrap-in-i18n)):
      on a CMS template page / inside a collection list, a bare chain rooted at `cms` or
      the loop var emits as `{i18n(cms.title)}` / `${i18n(item.title)}` (raw entry data —
      the wrap resolves i18n fields; identity otherwise). `{i18n(<chain>)}` always parses
      back to `{{<chain>}}`; don't hand-write the wrap outside those scopes (it normalizes
      away on the next save).
   2. **Rich-text CMS fields bound as a text child render through
      `<Fragment set:html={richTextWithComponents(cms.field, cmsComponents)} />`**
      ([§6.4](#64-cms-data-bindings-wrap-in-i18n)) — never a text interpolation (an object
      child prints `[object Object]`). The `cmsComponents` registry import
      (`import { cmsComponents } from '<rel>/cmsComponents'`) is emit-only boilerplate;
      the whole form parses back to the `{{cms.field}}` text child.
4. **Component props are JSX attributes.** Numbers/booleans use `{…}`; objects use literal
   `{{ … }}`; i18n strings use `i18n({…})`.
5. **The `resolveProps(Astro, {…})` argument is authoritative** — there is no separate
   `interface Props`/`__meno_props`. To edit a component's props, edit that `{…}` literal
   (the destructured names + their inferred TS types are regenerated on save).
6. **Conditionals are `{cond && ( … )}`**; lists are `{ list(src,{…}).map((item, i) => ( … )) }`
   (prop) or a frontmatter `getCollectionList` const + `{ X.map(…) }` (collection).
7. **Verbatim JS *expressions* survive; foreign `class`/frontmatter do not (yet).** An
   un-evaluatable `{expr}` value/attribute/condition is preserved as `{ _code, expr }` and
   reported as a `verbatim` region. But a raw `class="px-4 flex"` (use `style({...})`) and
   arbitrary frontmatter logic still do not round-trip — don't hand-author those.

For a deeper, copy-pasteable rule set, use the `/meno-astro` skill
(`.claude/commands/meno-astro.md`).
