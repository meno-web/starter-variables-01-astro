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
| `const __meno = {…}` | Component metadata: `acceptsStyles`, `libraries` (plus an optional `category` that round-trips but is **inert** — Studio groups by the component's **folder** under `src/components/`, not this field) | **Yes.** Omitted entirely if empty. |

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
inverse is `packages/astro/lib/dialect/parse/parseBody.ts`. There are ten Meno node
types plus a fallback.

| `type` | Emitted markup | Notes |
|---|---|---|
| `node` | `<tag …>children</tag>` | Standard HTML element. Void tags self-close. A local `<img>` emits `<MenoImage>` by default — opt out with `data-meno-optimize="false"` (§4.1). |
| `component` | `<Name prop=… />` | Capitalized tag; props as JSX attributes. |
| `slot` | `<slot>fallback</slot>` or `<slot />` | `default` children become slot fallback. |
| `link` | `<Link href=…>children</Link>` | Runtime `Link` component. |
| `embed` | `<Embed html={…} />` | Raw HTML/SVG passthrough. |
| `list` | `{ list(src,{…}).map((item, itemIndex) => ( … )) }` (prop) or a frontmatter `getCollectionList` const + `{ X.map(…) }` (collection) | See §5. |
| `locale-list` | `<LocaleList … />` | Locale switcher. |
| `island` | `<Counter client:visible … />` + a `../islands/<src>` import | BYO framework component (Astro island). See §4.7. |
| `markdown` | `<Markdown source={…} />` | Verbatim Markdown → HTML at build. See §4.8. |
| `custom` | `<Fancy … >children</Fancy>` + a `../custom/<src>` import | Opaque foreign `.astro` (server-only black box). See §4.9. |
| *unknown* | `{/* meno:unknown "type" */}` | Nothing is silently dropped. |

### 4.1 `node` — HTML element + styles

A node's **static styling is a literal utility `class="…"` string** — Meno's own Tailwind-*looking*
tokens: a named spacing/size scale (`p-4` = 16px, 4px grid) + named design tokens (`bg-muted`,
`text-primary` — defined in `src/styles/theme.css`), with arbitrary brackets (`p-[13px]`,
`bg-[#fff]`, `text-(--custom)`) as the escape for off-scale / literal values; plus responsive `tablet:`
/ `mobile:` prefixes and `hover:` / `focus:` / `active:` state variants. CSS is generated at build by
the `meno()` integration. This is the **default** form: it parses straight back to `attributes.class`
and round-trips losslessly (on-scale + known-token values canonicalize to the named form on save), and
unmodeled foreign/library tokens (`swiper`, `prose`) are preserved verbatim alongside it.

```astro
<span class="text-primary p-6 tablet:p-4">{text}</span>
```

Styling that **can't be a static class** — a value bound to a prop, a `{{template}}` value, or a prop
`_mapping` — is emitted instead via the `class={style(STYLE_OBJECT[, META])}` / `cx(…)` / `variants(…)`
runtime helpers (see the `style()` subsections below + [§6](#6-templates-conditionals-dynamic-tags)).
`style()`'s first argument is the **verbatim Meno `StyleObject`** — responsive breakpoints (`base` /
`tablet` / `mobile`) and prop `_mapping` bindings included:

```astro
<span class={style({ base: { color: "{{themeColor}}" }, tablet: {}, mobile: {} })}>{text}</span>
```

A style mapping (a value bound to a prop) stays inline in the `style()` literal:

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
<!-- A local <img> optimizes by default → emits the <MenoImage> wrapper (see below). -->
<MenoImage class="object-cover tablet:h-[380px]" src="/images/img.jpg" alt="" />
```

**Optimized images — local images optimize by default.** A **local** `<img>` (a non-empty `src`
that is not `http(s)://`, protocol-relative `//`, a `data:` URI, or a `.svg`) opts INTO Astro's
`astro:assets` optimization **by default**: it emits the runtime `<MenoImage>` wrapper instead of a
bare `<img>`, lazy-loading and producing responsive output. The model stays a plain `img` node; the
`data-meno-optimize` marker is canonicalized by `normalizeModel` (stamped `"true"` on local images,
left as-is when the author already set it) and is what the editor's "Optimize with Astro" toggle
reads. To **opt a single local image out**, set `data-meno-optimize="false"` (the toggle writes
this) — it then stays a bare `<img>`. **Remote, `data:`, and `.svg`** srcs are never defaulted; they
emit as bare `<img>` unless explicitly marked `data-meno-optimize="true"`. The `"true"` marker is the
parse discriminator — **consumed on emit, re-added on parse**, so it never appears as a literal
attribute (a `"false"` opt-out IS a real attribute). Every other attribute (`src`, `alt`, `width`,
`height`, a templated `src`) and `class`/inline-style flow through the same machinery as a normal
node. A **remote** `src` is only actually processed when its host is allow-listed in
`project.config.json` `image.domains` (mapped to Astro's `image.domains` by the integration).
(`emitNode.ts` `renderMenoImage`/`OPTIMIZE_ATTR`, `normalize.ts` `isLocalOptimizableSrc`.)

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
<Link href={href({ _mapping: true, prop: "link" })} class="…">
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

**The hoist-const name is canonicalized, not load-bearing.** The emitter always names these
consts `__embed<N>` — `N` a 0-based, sequential integer (`__embed0`, `__embed1`, …) — and that
is the canonical form to author. The name is *normalized on save* like every other literal
(§9): the parser recovers the verbatim HTML by resolving **any** bare `html={ident}` whose
`ident` is a frontmatter backtick-template const, so a hand-authored hoist under a different
name is **never lost** — but the next emit re-hoists it as `__embed<N>`, so the name does not
survive the round-trip:

```astro
---
const __iconChat = `<svg viewBox="0 0 24 24">
<path d="…" />
</svg>`;
---
<Embed html={__iconChat} />   <!-- HTML preserved; on the next save the const + ref come
                                   back as `__embed0` — author a semantic name only if you
                                   don't mind it being renamed. -->
```

> Only a frontmatter **backtick-template const** is inlined this way. A bare `html={prop}`
> that names a real component prop (or `html={i18n(cms.field)}` / `html={embedHtml(…)}`) stays
> a binding — that is a prop-bound embed, not a hoist.

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

### 4.7 `island` — BYO framework component (Astro Islands)

An `island` node is a **bring-your-own framework component** (React/Preact/Vue/Svelte)
placed as a real [Astro island](https://docs.astro.build/en/concepts/islands/). The user
authors the component file under `src/islands/`; the dialect emits a standard Astro
instance with a `client:*` hydration directive and a default import:

```astro
---
import Counter from '../islands/Counter.tsx';
---
<Counter client:visible initial={3} />
```

The model node:

```jsonc
{ "type": "island", "src": "Counter.tsx", "client": { "directive": "visible" }, "props": { "initial": 3 } }
```

- **`src`** — the file relative to `src/islands/` (e.g. `Counter.tsx`, `widgets/Chart.vue`).
  It is the single source of truth: its **extension derives the framework**
  (`.tsx`/`.jsx` → React, `.vue` → Vue, `.svelte` → Svelte), which drives the
  `@astrojs/<fw>` integration that gets provisioned. The emitted JSX tag is the
  capitalized basename, uniquified against component tags (the import path carries `src`,
  so the parser recovers it regardless of the identifier). Imports resolve to
  `<…>/islands/<src>` at the page/component's own `../` depth.
- **`client`** — `{ directive, value? }`, the single Astro `client:*` directive.
  `load`/`idle`/`visible` are bare; `media` carries a query
  (`client:media="(max-width: 50em)"`); `only` carries the framework
  (`client:only="react"`). **Omit `client` entirely** for a server-rendered island
  (valid Astro, zero JS).
- **`props`** — emitted as JSX attributes exactly like `node` attributes (`{{…}}`
  templates become expressions). Unlike a Meno `component`, an island gets **no**
  `style()` class, no instance-style merge and no `cms`/loop/ambient prop forwarding —
  it's a framework file, so only its explicit props are passed (a `class` prop can be
  passed explicitly as a string).
- **`children`** — slotted content, rendered server-side into the island's `<slot/>`.
- **`if`** — conditional, same `{cond && ( … )}` wrapper as every other node.

On **parse**, a tag whose frontmatter import resolves to a framework-extension file under
`islands/` becomes a `type:"island"` node; `client:*` attributes split off into `client`,
the rest become `props`. The whole thing round-trips exactly.

**Editor prop controls.** An island carries no Meno prop schema, so the PropsPanel discovers its
props by reading the source file (`POST /api/component-props` parses the `interface Props` /
`defineProps<{…}>` / `$props()` / `export let` declarations) and renders one input per prop. The
declared **type picks the control**: a **string-literal union** (`size?: 'sm' | 'md' | 'lg'`)
renders as a **dropdown** of those literals, `boolean`→toggle, `number`→number, everything else→a
text input. To give an editor a fixed set of choices, type the prop as a union of string literals.
A union with any non-literal member (`'a' | string`, `'a' | 1`) stays free-text; a `{{binding}}` or
other off-list value falls back to the text input so it is never stranded. (Same behavior for a
`custom` node — §4.9.)

**Runtime / provisioning (not codec).** `meno()` **auto-registers** the matching
`@astrojs/<fw>` renderer for every island framework whose `@astrojs/<fw>` package is
**installed and resolvable from `meno-astro`**, returning them as top-level integrations
alongside `meno()` — so **no `astro.config` edit is ever needed**. *Which* frameworks are
installed is decided by **provisioning**, not by `meno()`: the **studio/play runtime**
scans `src/islands/`, derives the frameworks in use (`MENO_ASTRO_FRAMEWORKS`), and installs
only those `@astrojs/<fw>` packages into its shared store (a converted project lists them
in its own `package.json` for standalone builds). React and Preact share `.jsx`/`.tsx`, so
Preact is selected via the `MENO_ISLAND_FRAMEWORKS` override rather than detected by
extension. **Adding the first island of a framework to a running play server auto-provisions
its renderer and restarts the preview** (the studio watches `src/islands/` and re-points
`MENO_ASTRO_FRAMEWORKS`), so it hydrates without a manual restart — otherwise the first
`.tsx`/`.vue`/`.svelte` would `NoMatchingRenderer` until the user restarted by hand.

> ⚠ **Never import a renderer — or any other package — in `astro.config`.** Do **not** add
> `import react from '@astrojs/react'` / `react()` (nor `@astrojs/vue`, an adapter, etc.),
> not even via a dynamic `import()` / `require()`. The Meno preview **statically scans
> `astro.config` for every import form** (static `import`, `export … from`, dynamic
> `import()`, `require()`, side-effect `import`) and allows **only** `astro/config`,
> `meno-astro`, and `meno-astro/integration`. Any other specifier disables the preview —
> *"This project has a custom astro.config that imports …, which the shared Astro preview
> runtime doesn't include"* — so the project won't open in the editor. The renderer is
> auto-registered (above), so importing it is both **redundant and breaking**. Keep the
> config exactly `integrations: [meno()]`. (A bare CLI `astro build` outside the studio
> still works only when the matching `@astrojs/<fw>` is in the project's own `package.json`
> so `meno()` can resolve it — but never satisfy that by importing it in `astro.config`.)

Island hydration **works in the play dev server** (open the preview in a browser /
"Open in browser") and in a real deployed `astro build`. The integration adds the play
runtime's **hoisted** framework `node_modules` to `vite.server.fs.allow`, so the client
hydration chunk (`@astrojs/<fw>/dist/client.js`, fetched over `/@fs/…`) is served instead
of 403ing — that 403, not the play CSP, is what previously kept islands inert in the
preview. The embedded in-app preview is exempt from the Electron play CSP (via the
`x-meno-astro-play` marker), so it should hydrate too; if an island is still inert *only*
inside the embedded preview, that's a separate CSP limitation to track — see the play-CSP note.

> **meno-core canvas:** meno-core can't run a framework component, so the design canvas
> renders a labelled placeholder for an island (`⛶ Island: Counter (client:visible)`).
> Real hydration is play/build only.

### 4.8 `markdown` — verbatim Markdown block

A `markdown` node renders a block of **verbatim, whitespace-significant Markdown** to HTML
at build/SSR. It emits the runtime `<Markdown source={…} />` component (which renders
`set:html={renderMarkdown(source)}`):

```astro
<Markdown source={`# Title

Some **bold** copy with a [link](/about).`} />
```

The model node:

```jsonc
{ "type": "markdown", "source": "# Title\n\nSome **bold** copy with a [link](/about)." }
```

- **`source`** — the raw Markdown string. It is **never template-resolved** (like an `embed`
  payload): a literal `{{x}}` or `${x}` in the source survives verbatim. It therefore always
  emits as a backtick string literal (`escapeBacktick`); a **multi-line** source is hoisted to a
  never-reindented frontmatter `const __mdN = \`…\`` (the same mechanism as `__embedN`) and
  referenced as `source={__mdN}`, while a single-line source inlines as ``source={`…`}``.
- **class / inline style / passthrough attributes** mirror `embed`, so a styled markdown block
  round-trips.
- Rendered through the runtime `renderMarkdown(source)` (`meno-astro`, backed by markdown-it),
  which mirrors meno-core's shared markdown config so the editor canvas and the real Astro build
  agree. (`emitNode.ts` `renderMarkdown` node renderer; node schema `MarkdownNodeType.ts`.)

### 4.9 `custom` — opaque foreign `.astro` (server-only black box)

A `custom` node is a **hand-authored `.astro` component that Meno treats as a black box**. The
user authors a full-power `.astro` file under `src/custom/` (any frontmatter, `import`s,
`getCollection`, helper functions, arbitrary markup); the dialect emits a standard Astro instance
plus a default import, but **Meno never models its internals** — you can place it, pass props, and
slot children, but not edit what's inside. It is the **native-Astro sibling of an island** (§4.7):
same "bring-your-own file" shape, but server-rendered with **no framework renderer and no
hydration**.

```astro
---
import Fancy from '../custom/Fancy.astro';
---
<Fancy label="Hello" count={7}>
  <span>slotted child</span>
</Fancy>
```

The model node:

```jsonc
{ "type": "custom", "src": "Fancy.astro",
  "props": { "label": "Hello", "count": 7 },
  "children": [{ "type": "node", "tag": "span", "children": "slotted child" }] }
```

- **`src`** — the file relative to `src/custom/` (e.g. `Fancy.astro`, `widgets/Banner.astro`).
  The emitted JSX tag is the capitalized basename, uniquified against component/island tags (the
  import path carries `src`, so the parser recovers it regardless of the identifier). The import
  resolves to `<…>/custom/<src>` at the page/component's own `../` depth (`customAstroImportPath`).
- **`props`** — emitted as JSX attributes exactly like `node` attributes (`{{…}}` templates become
  expressions). Like an island and **unlike** a Meno `component`, a custom node gets **no**
  `style()` class, no instance-style merge, and **no `cms`/loop/ambient prop forwarding** — Meno
  can't introspect a foreign file's prop needs, so **only the props the user explicitly sets are
  passed** (`label`, `count` above). Anything the foreign file needs from CMS/loop context must be
  passed in by hand as an explicit prop.
- **`children`** — slotted content, rendered server-side into the component's default `<slot/>`.
- **`if`** — conditional, same `{cond && ( … )}` wrapper as every other node.
- **No `client:*`.** A `.astro` component is server-only by nature; a custom node carries no
  hydration directive and ships zero client JS. (For client-side framework interactivity, use an
  **island** instead — §4.7.)

On **parse**, a tag whose frontmatter import resolves to a file under `src/custom/` becomes a
`type:"custom"` node; its attributes become `props` and its children are captured. The whole thing
round-trips exactly.

**Editor prop controls.** Like an island (§4.7), a custom node carries no Meno prop schema, so the
PropsPanel discovers its props by reading the `.astro` source — its frontmatter `interface Props` or
`const { … } = Astro.props` destructure — and renders one input per prop. The declared **type picks
the control**: a **string-literal union** (`variant?: 'info' | 'warn' | 'success'`) renders as a
**dropdown** of those literals, `boolean`→toggle, `number`→number, everything else→a text input. So
to give an editor a fixed set of choices for a custom prop, type it as a union of string literals. A
union with any non-literal member (`'a' | string`) stays free-text; a `{{binding}}` or other
off-list value falls back to the text input so it is never stranded.

**Runtime/provisioning:** none — a custom component is a plain native Astro
import, so `astro build`/`dev` render it with no extra dependency (no `@astrojs/<fw>` renderer, no
provisioning step), and the codec change ships in the app with no `meno-astro` publish. A real
`astro build` is exercised end-to-end by `packages/astro/scripts/custom-e2e.mjs`.

> **meno-core canvas:** meno-core can't execute a foreign `.astro` file, so the design canvas
> renders a quiet placeholder for a custom node (its slotted children, or an inline marker with the
> file's basename). Real rendering is play/build only.

> **custom vs island.** Both reference a BYO foreign file and pass only explicit props. The
> difference is the **runtime**: `custom` = a server-only native `.astro` under `src/custom/` (no
> `client:*`, no renderer); `island` = a *client-hydrated* framework component under `src/islands/`
> (carries a `client:*` directive, auto-provisions an `@astrojs/<fw>` renderer — §4.7). Pick by the
> question "does this need to run in the browser?": yes → island; no → custom.

---

## 5. Lists

A `list` node renders differently depending on `sourceType` (default `"prop"`).

### 5.1 Prop list

A prop list maps over a `type: "list"` prop, so the backing prop has to be **declared** in
`resolveProps` before the body can map it. The declaration carries a required `itemSchema` (the
shape of one item) and an **object-array `default`** (one `{ field: value }` record per item):

```astro
---
const { items, class: className } = resolveProps(Astro, {
  items: {
    type: "list",
    itemSchema: { label: { type: "string", default: "Item" } },
    default: [{ label: "First" }, { label: "Second" }],
  },
});
---
{ list(items, { limit: 6 }).map((thing, thingIndex) => (
    <span>{thing.label}</span>
)) }
```

- The source is the prop expression. After normalization the source is canonicalized to a
  `{{…}}` template (e.g. `{{items}}`); the emitter unwraps it to the bare identifier
  `items` for the `list()` call.
- `itemAs` controls the loop variable (default `item`); the index variable is always
  `<itemAs>Index`. Bind item **fields** in the body (`{{thing.label}}`), never the bare item.
- `limit` / `offset` become the `list()` options object; omitted when absent.
- **`itemSchema` is required and `default` must be an array of objects.** A bare-string `default`
  (`default: ["First", "Second"]`) or a missing `itemSchema` is the most common authoring mistake:
  the codec round-trips it and `astro build` renders it, but the component **fails to open in the
  editor** — its load path validates the prop and rejects it with
  `interface.<prop> — list prop requires itemSchema and an object-array default`. Give every list
  prop an `itemSchema` + object-array default.

### 5.2 Collection list

A CMS-backed list hoists its query to a frontmatter `const` and maps over it. From
`example-astro/src/pages/filter-demo.astro`:

```astro
---
const productsList = await getCollectionList("products", { emitTemplate: true }, Astro);
---
<!-- … -->
{productsList.map((item, itemIndex) => (
  <div class="…" data-id={i18n(item._id) || undefined} data-category={i18n(item.category) || undefined}>
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

#### 5.2.1 Client-side filtering (`emitTemplate: true` → MenoFilter)

A collection list with **`emitTemplate: true`** is *filter-wired*: it powers the client-side
**MenoFilter** runtime (filter / search / sort / paginate the CMS list, with facet + result
counts) declaratively, via `data-meno-*` attributes the converter already round-trips (a
`[data-meno-filter="<collection>"]` wrapper around `[data-meno-list]` + filter controls).
There is no new authoring surface — the JSON `cms-list` already carried `emitTemplate` and the
filter attributes; the dialect just emits the three things the runtime needs:

1. **The runtime.** `BaseLayout` injects `menoFilterScript` before `</body>` (self-gating —
   a no-op when the page has no `[data-meno-filter]`), alongside `formHandlerScript`. Off the
   already-emitted `data-<field>` card attributes alone it does **DOM-only** filtering
   (string filters, text search, sort, pagination).
2. **Inline data.** After the page/component body (a sibling of the page root) the emitter
   adds, per distinct collection, `<script type="application/json" id="meno-cms-<collection>"
   set:html={serializeClientCmsData(<binding>)}>` — the queried items (with their synthesized
   `_url`/`_id`). This is what unlocks **JSON mode**: type coercion (`data-meno-types`),
   numeric/date range filters, and facet/total counts. The runtime reuses the SSR cards by
   `data-id`, so the static HTML stays the SEO / no-JS baseline.
3. **An item template.** As the last child of `[data-meno-list]` the emitter adds
   `<template data-meno-item>` — the card rendered over a *synthetic placeholder item*, so
   `style()`/component calls resolve to real build-time output while each `{{item.<field>}}`
   survives as a literal placeholder. Its **presence** is what switches the runtime into JSON
   mode and keys the SSR cards by `data-id`; its content renders an item that wasn't
   server-rendered (a `data-id` miss).

For pages that don't embed the list inline (or large collections), every collection whose
schema sets **`meta.cms.clientData.enabled: true`** also gets a prerendered static endpoint at
**`src/pages/data/<collection>/index.json.ts`** (→ `/data/<collection>/index.json`) — the
runtime's `static` fetch strategy, the same projected items as the inline payload.

All three artifacts are **emit-derived**: the parser drops the data script, the item template,
and the endpoint, and they are re-derived from the list's `emitTemplate` flag (and the schema's
`clientData`) on every emit — so the model round-trips unchanged. The `<` in the JSON payload is
escaped (`<`) so a field value containing `</script>` can't break out of the inline block.

> **Caveat (play preview).** The runtime + inline data are `<script is:inline>`, which the
> Electron play preview's CSP blocks (it has no nonce — see the play CSP note in the docs).
> Client filtering therefore works in a real deployed build but is inert in the in-app play
> iframe, the same limitation as `formHandlerScript`.

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
<p class="…">
  {"Even "}
  <span class="italic">great products</span>
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
<Tag_0 class={cx("…", className)}>{text}</Tag_0>
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
> via Astro's Container API against the registry. The **same registry-backed render** also
> covers the two other ways a rich-text value reaches the page, so embedded components render
> everywhere a rich-text field can be shown — not just as a text child:
>
> - A **rich-text prop** (`{{body}}` where `body` is a `type:"rich-text"` prop, e.g. a CMS field
>   forwarded `<RichBlock body={cms.body} />`) emits
>   `<Fragment set:html={richTextWithComponents(body, cmsComponents)} />` (+ the registry import).
> - An **embed node** binding a rich-text field (`type:"embed"` with `html: "{{cms.body}}"`)
>   emits `<Embed html={i18n(cms.body)} components={cmsComponents} />` — the emitter passes the
>   registry so `Embed` renders embedded components via `richTextWithComponents`; a verbatim /
>   URL / non-rich-text embed keeps the lighter `toHtmlString` path (`components` omitted). The
>   `components` attr is emit-only plumbing, dropped on parse.
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

> **Status: verbatim *expressions*, foreign frontmatter, and foreign/static `class` strings are
> all preserved; only a distinct `rawClass` *region report* isn't emitted yet (a static
> `class="…"` is preserved via `attributes.class` — see below).** A `{ … }` value, attribute, or
> condition holding arbitrary JS
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

1. **Static styling is a literal utility `class="..."`** — Meno's Tailwind-*looking* tokens: a named
   scale (`p-4`=16px, `gap-2`) + design tokens (`bg-muted`, `text-primary`), with arbitrary brackets
   (`p-[13px]`, `bg-[#fff]`) for off-scale / literal values; `tablet:`/`mobile:` + `hover:`/`focus:`/`active:`
   variants. It parses to `attributes.class`, round-trips (on-scale / known-token values canonicalize to
   the named form), and the build generates the CSS; foreign/library classes are preserved verbatim. Only **prop-bound / `{{template}}` / `_mapping`** styling uses the
   `style({...})` / `cx(…)` / `variants(…)` helpers (`style()`'s arg is a Meno `StyleObject` —
   `{ base, tablet, mobile }`, prop bindings as `{ _mapping, prop, values }`); a component root merges
   instance overrides via `cx(<own classes>, className)`.
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
7. **Verbatim JS *expressions*, foreign frontmatter, and `class` strings all survive.** An
   un-evaluatable `{expr}` value/attribute/condition is preserved as `{ _code, expr }` and
   reported as a `verbatim` region. Hand-authored frontmatter (a stray `const`, a foreign
   `import`, a helper `function`) is captured as a verbatim `_frontmatter` passthrough block and
   round-trips (§4.9 covers the whole-component escape hatch; page-level passthrough keeps a
   mostly-dialect page editable). A static `class="p-[24px] flex"` (utility + foreign tokens)
   parses to `attributes.class` and round-trips — it's the canonical styling form (rule 1).
8. **Islands, custom components, markdown, optimized images:**
   - **Islands** are framework components under `src/islands/` ([§4.7](#47-island--byo-framework-component-astro-islands)):
     `<Counter client:visible … />` with a `../islands/Counter.tsx` import → a `type:"island"`
     node. Put the `client:*` directive on the tag (bare for `load`/`idle`/`visible`, valued
     for `media`/`only`; omit for a server-only island). Drop the file in `src/islands/` (and
     its deps in `package.json`) and `meno()` auto-wires the renderer — **never** add
     `react()`/`vue()` (or any non-`meno-astro` import) to `astro.config`, or the Meno preview
     refuses to open the project ([§4.7](#47-island--byo-framework-component-astro-islands)).
   - **Custom components** ([§4.9](#49-custom--opaque-foreign-astro-server-only-black-box)): an
     opaque foreign `.astro` under `src/custom/` → `<Fancy … >children</Fancy>` with a
     `../custom/Fancy.astro` import → a `type:"custom"` node. Meno passes **only explicit props**
     and slots children; it never models the internals (server-rendered black box, **no
     `client:*`**, no renderer/provisioning). The server-only sibling of an island — use it for
     markup the dialect can't express that needs no browser framework.
   - **Markdown** ([§4.8](#48-markdown--verbatim-markdown-block)): `<Markdown source={\`…\`} />`,
     verbatim source (multi-line hoists to `const __mdN`). Never put `{{templates}}` inside — the
     source is not template-resolved.
   - **Optimized images** ([§4.1](#41-node--html-element--styles)): a **local** `<img>` emits
     `<MenoImage>` (astro:assets) **by default** — opt out per-image with `data-meno-optimize="false"`.
     Remote/`data:`/`.svg` srcs stay bare `<img>` unless explicitly marked `="true"`; a remote `src`
     also needs its host in `project.config.json` `image.domains`.

For a deeper, copy-pasteable rule set, use the `/meno-astro` skill
(`.claude/commands/meno-astro.md`).
