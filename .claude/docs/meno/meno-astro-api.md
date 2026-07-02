# `meno-astro` — Package API

`meno-astro` provides two things:

1. The **dialect codec** (`emit` / `parse` / `normalizeModel`) — the round-trippable
   bridge between Meno's in-memory model and `.astro` source. See
   [the dialect spec](./meno-astro-dialect.md).
2. A **runtime surface** that Meno-generated `.astro` projects import, composed from
   `meno-core` behind a curated, stable API.

It depends on `meno-core` (single direction; no `meno-core` files move, so the existing
JSON runtime is untouched by construction).

> The full runtime surface is **implemented and published to npm** (`meno-astro`).
> Emitted projects build and run under `astro dev`/`astro build` with the `meno()`
> integration. The [Status section](#status) tracks the remaining gaps
> (raw-class/frontmatter escape hatches). Individual entry descriptions below may
> predate some later additions — `lib/index.ts` is authoritative. For localization
> (locale routing, slugs, link rewriting, CMS item i18n) see
> [meno-astro-i18n.md](./meno-astro-i18n.md).

---

## Entry points

Declared in `packages/astro/package.json`:

| Subpath | File | Use |
|---|---|---|
| `meno-astro` | `lib/index.ts` | Runtime helpers + model types (imported by generated projects). |
| `meno-astro/dialect` | `lib/dialect/index.ts` | The codec: `emit`, `parse`, `normalizeModel`. Editor/build-only. |
| `meno-astro/server` | `lib/server/index.ts` | Filesystem providers + conversion + format detection + loaders (`loadI18nConfig`, `loadSiteUrl`, `loadSlugMappings`, …). Server/build-only. |
| `meno-astro/integration` | `lib/integration/index.ts` | The `meno()` Astro integration (default export): wires i18n routing + injects the locale middleware. |
| `meno-astro/components` | `lib/components/index.ts` | The `.astro` runtime components emitted markup imports: `BaseLayout`, `Link`, `Embed`, `LocaleList`, `MenoImage`, `Markdown`. |
| `meno-astro/runtime/localeMiddleware` | `lib/runtime/localeMiddleware.ts` | The injected middleware module (`onRequest`) the integration points Astro at. |

`dialectVersion` (a `const` string, currently `'0.1.4'`) is exported from the root entry.
It is written into generated projects so a project can be migrated forward if the on-disk
dialect format evolves. It is part of the package's **semver contract**: a change to the
emitted dialect shape that older `parse()` cannot read back must bump `dialectVersion`.

---

## `meno-astro` (root, `lib/index.ts`)

### Constants

| Export | Type | Description |
|---|---|---|
| `dialectVersion` | `'0.1.7'` (literal `const`) | On-disk dialect format version; semver-tracked (see the full history beside the `const` in `lib/index.ts`). 0.1.3 = rich-text text children emit `richTextWithComponents(…, cmsComponents)` + the generated registry import. 0.1.5 = SSR page type (`loadPageData`). 0.1.6 = Sanity list source (`getSanityData`). 0.1.7 = embedded components also render in a `type:"rich-text"` **prop** (`set:html={richTextWithComponents(prop, cmsComponents)}`) and in an **embed node** bound to a rich-text field (`components={cmsComponents}`). |

### Model types (re-exported from `meno-core/shared/types`)

`JSONPage`, `PageData`, `ComponentNode`, `StructuredComponentDefinition`,
`PropDefinition`, `StyleObject`, `ResponsiveStyleObject`.

### Dialect-facing type aliases

| Type | Definition | Description |
|---|---|---|
| `MenoStyle` | `ResponsiveStyleObject \| StyleObject` | The style payload carried verbatim in `style({...})` calls. |
| `MenoProps` | `Record<string, PropDefinition>` | A component's prop definitions, carried by the `resolveProps(Astro, {…})` argument. |
| `MenoPageMeta` | `NonNullable<JSONPage['meta']>` | A page's `const meta` payload (TS type only — do **not** `satisfies`-annotate `.astro` frontmatter with it; the `satisfies` operator breaks `astro build`). |
| `MenoComponentMeta` | `Pick<StructuredComponentDefinition, 'category' \| 'acceptsStyles' \| 'libraries'>` | A component's non-interface metadata, carried by `__meno`. **`category` is parsed and round-trips but does NOT drive Studio grouping** — grouping is by the component's folder under `src/components/` (the loader's `_category`), so the `category` field is effectively cosmetic. (`defineVars` is **not** here — a component's JS is emitted as `<script define:vars={{…}}>`, native Astro, and reconstructed on parse.) |

### Runtime helpers — implemented

| Export | Signature | Description |
|---|---|---|
| `resolveProps` | `resolveProps<const T extends MenoProps>(astro: { props }, defs: T): InferMenoProps<T> & { class: string }` | The single authoritative prop block for every component. Its `defs` argument is the prop definition the dialect parser reads back; at runtime it merges `Astro.props` over each def's `default` and always supplies `class` (defaulting to `""`). The returned locals' TS types are **inferred** from `defs` (number/boolean/`{ href; target? }`/`unknown[]`/a `select` options union / `string`), replacing the old hand-written `interface Props`. |
| `list` | `list<T>(source: T[] \| null \| undefined, opts?: { offset?: number; limit?: number }): T[]` | Tolerant prop-list helper used by generated `.astro`: `list(items, { limit }).map(…)`. Returns `[]` for null/undefined; applies `offset` then `limit`. |

> **List props (`type: "list"`).** A list prop is the one `PropDefinition` variant with extra
> structure: `itemSchema` is **required** (a `Record<string, PropDefinition>` describing one item's
> fields) and `default` is an **`Array<Record<string, scalar | { href; target? } | i18n | null>>`** —
> an array of objects, *not* the bare `unknown[]` the `resolveProps` inferred-type note above implies.
> A bare-string `default` (`["First", "Second"]`) or a missing `itemSchema` passes the codec
> round-trip **and** `astro build`, but is rejected by the editor's component-load validation with
> `interface.<prop> — list prop requires itemSchema and an object-array default`. See dialect §5.1.

> **Client-script prop injection.** A component's `def.javascript` that needs its props
> is emitted as `<script define:vars={{ … }}>` — Astro's native directive injects those
> props as `const`s into the inline script. There is no custom `meno-astro` prop-injection
> helper for this; Astro does it. (Without `defineVars`, the script is a plain `<script is:inline>`.)

### i18n primitives (re-exported from `meno-core/shared/i18n`) — implemented

| Export | Description |
|---|---|
| `isI18nValue` | Type guard: is a value an `{ _i18n: true, … }` object? |
| `resolveI18nValue` | Resolve an i18n value for a locale. |
| `extractLocaleFromPath` | Pull the locale prefix out of a path. |
| `buildLocalizedPath` | Build a locale-prefixed path. |

### i18n runtime resolver + locale context (`lib/runtime/i18n.ts`) — implemented

The emitter-facing `i18n()` resolver and its locale-context seam. Built on the primitives
above (no resolution logic reinvented); the locale context uses `AsyncLocalStorage`
(`node:async_hooks`, SSR/concurrency-safe), degrading to a module-level variable if
that module is unavailable.

| Export | Signature | Description |
|---|---|---|
| `i18n` | `i18n(value, override?) => string \| unknown[] \| value` | Resolve an `{ _i18n: true, … }` value to the active locale's string (or array, for list props). Non-i18n values pass through unchanged. Locale/config come from `override` if given, else the active `runWithLocale` context, else `DEFAULT_I18N_CONFIG`'s default locale (a no-context call returns the default-locale value rather than throwing). The single-arg `i18n(value)` call shape is primary; `override` is optional and is either a locale string, `{ locale?, config? }`, or an Astro-like `{ currentLocale?, url? }`. |
| `runWithLocale` | `runWithLocale<T>(locale, config: I18nConfig, fn: () => T) => T` | Run `fn` with `{ locale, config }` as the active locale context (everything rendered inside, incl. nested `i18n()` calls, sees this locale). This is the seam the future `BaseLayout`/middleware will call per route/locale. |
| `getLocaleContext` | `() => { locale; config } \| undefined` | Read the current locale context, or `undefined` if none is active. |
| `localeFromAstro` | `(astro, config: I18nConfig) => string` | Derive the active locale from an Astro global: `astro.currentLocale`, else the locale prefix on `astro.url.pathname`, else `config.defaultLocale`. |

> **What's still pending for true per-locale rendering:** `i18n()` resolves correctly, but
> end-to-end localized output still needs `BaseLayout`/middleware to call `runWithLocale`
> once per route/locale (so emitted markup renders in the right locale). That render-path
> wiring + `astro build` integration remain pending — same bucket as the `style()`
> render-path CSS flush and the `meno-astro/components` components below.

### style runtime resolver + CSS collector (`lib/runtime/style.ts`) — implemented (PoC)

> **Authoring note (class-first).** Static styling is authored as a literal utility `class="p-[24px]"`
> string — the canonical, round-tripping form; the build generates its CSS directly from the class. The
> `style()` / `cx()` / `variants()` helpers below resolve only the **prop-bound / `{{template}}` /
> `_mapping` / component-root** rump that *can't* be a static class.

The emitter-facing `style()` resolver. **PoC scope: the prop-bound `_mapping` resolver
(the "option A" design) + a CSS collector — proven by `lib/style.test.ts`. The render-path
flush (a `BaseLayout`/integration draining the collector into a `<style>` tag) and the
emitter change that threads `props` into the call site are NOT done** (gated on this PoC).

All CSS generation is reused from `meno-core` (the same code the JSON runtime's SSR uses):
`generateInteractiveCSS` (base + responsive `@media` + interactive states, scoped to one
class), `DEFAULT_BREAKPOINTS` (tablet 1024px / mobile 540px thresholds), `shortHash`
(deterministic class-name hash → identical styleObjects dedupe), and `isStyleMapping`.
`_mapping` resolution mirrors meno-core's `resolveExtractedMappings`
(`mapping.values[String(props[mapping.prop])]`).

| Export | Signature | Description |
|---|---|---|
| `style` | `style(styleObject, props?, meta?) => string` (class name) | Resolve a Meno style payload (flat `StyleObject` or responsive `{ base, tablet, mobile }`, values may be `_mapping` prop bindings) to a deterministic CSS class name (the matching utility/interactive CSS is generated at **build time** by the `meno()` integration — `style()` returns the class name only, never CSS). On a COMPONENT STRUCTURE ROOT (`meta.root`), it also merges the instance class the parent passed (`props.class`) over the root's own classes, instance wins per property. `props` is the host component's resolved prop values — the **option-A** seam: each `_mapping` resolves to a concrete value *before* CSS generation (e.g. `{ _mapping, prop:"isMarginTop", values:{true:"40px",false:"0"} }` → `margin-top:40px` when `props.isMarginTop===true`). A `_mapping` with no `props` (or an unmatched value) **degrades gracefully** — the bound property is omitted, not thrown. `meta` is the emitted `{ interactive, label, genClass }`: `interactive` rules become `:hover`/state CSS scoped to the class; `label` is folded into the (still content-derived) class name. |
| `inlineStyle` | `inlineStyle(decls: Record<string,string>, props?) => string \| undefined` | Render a COMPONENT STRUCTURE ROOT's prop-bound inline `style="…"` — the declarations a `{{template}}`-bound style value produces (e.g. `maxWidth: "{{maxWidth}}"`), which can't be a build-time class. `decls` values are emit-resolved against the host props (`{ "max-width": \`${maxWidth}\` }`); the helper **drops any declaration the instance overrides** (read off `props.__menoStyle`) so the instance's utility class wins over the inline style — restoring meno-core's instance-over-root merge (an inline `style=` otherwise outranks the class). Returns `undefined` when nothing remains, so Astro omits the attribute. See the dialect spec §4.1. |
| `flushCollectedStyles` | `() => string` | Drain the collector, returning all accumulated CSS (insertion order). What a future `BaseLayout`/integration flushes into a `<style>` tag. |
| `resetStyleCollector` | `() => void` | Clear the collector. Call between renders. |

> **Collector design + the per-render-isolation caveat.** The collector is a module-level
> `Map` keyed by class name (so repeated `style()` calls for the same class dedupe within a
> render). SSR is concurrent, so this module-level sink races across overlapping renders;
> **production hardening** scopes it to the async call tree with `AsyncLocalStorage`
> (`node:async_hooks`) — the same pattern `runtime/i18n.ts`'s `runWithLocale` uses for the
> locale context — and a `BaseLayout` would run the render inside that scope and flush the
> per-render sink. The module-level + `resetStyleCollector()`-able collector here is
> sufficient to *prove the resolver* under unit tests.

### i18n end-to-end wiring — `loadI18nConfig` + locale middleware (`lib/runtime/middleware.ts`) — implemented

The render-path glue that turns the `i18n()` resolver + locale context into per-locale
pages. **Why middleware:** a page body's `i18n(...)` calls execute in the *page's* render
scope, not inside `BaseLayout`'s frontmatter, so `BaseLayout` can't wrap them. Astro
middleware wraps the whole page render per request/prerender, so wrapping `next()` in
`runWithLocale(locale, config, …)` establishes the `AsyncLocalStorage` context every
`i18n()` call (anywhere in the page + its components) then reads.

| Export | Signature | Description |
|---|---|---|
| `loadI18nConfig` | `(projectRoot: string) => I18nConfig` | Read `<root>/project.config.json`, take `.i18n`, run meno-core's `migrateI18nConfig` (modern `LocaleConfig[]` **and** legacy `string[]` shapes). Missing/empty/invalid → `DEFAULT_I18N_CONFIG`. **Never throws.** Also exported from `meno-astro/server`. Server/build-only (filesystem). |
| `loadSiteUrl` | `(projectRoot: string) => string \| null` | Read `<root>/project.config.json`'s `siteUrl` (the public origin), trailing slash trimmed. Missing/non-string/empty/unreadable → `null`. **Never throws.** Drives the `meno()` integration's Astro `site` option + `sitemap.xml`, and BaseLayout's canonical link + absolute hreflang. Also exported from `meno-astro/server`. Server/build-only (filesystem). |
| `createLocaleMiddleware` | `(config: I18nConfig) => LocaleMiddleware` | Pure factory returning an Astro-shaped handler `(context, next) => runWithLocale(deriveLocale(context, config), config, () => next())`. The injected module loads config once and binds this. |
| `deriveLocale` | `(context, config) => string` | Locale-selection policy: `context.currentLocale` → `localeFromAstro(context, config)` (the `/<locale>/…` URL prefix) → `config.defaultLocale`. |
| `LocaleMiddleware` / `LocaleMiddlewareContext` | (types) | The minimal structural slice of Astro's `MiddlewareHandler` / `APIContext` (`{ currentLocale?, url? }`, `next()`). Astro's real types are assignable to these. |

The **injected middleware module** is `meno-astro/runtime/localeMiddleware` — it calls
`loadI18nConfig(process.cwd())` once at module load and exports `onRequest =
createLocaleMiddleware(config)` (Astro's middleware-handler export name).

**Validated by unit tests on the resolution logic** (`lib/runtime/middleware.test.ts`,
`lib/server/loadI18nConfig.test.ts`): config load (valid / missing / legacy migration),
`deriveLocale` precedence, and the end-to-end chain — calling the middleware with a mock
`context` and a mock `next` that runs `i18n({_i18n,en:'About',pl:'O nas'})` returns
`'O nas'` for `pl`/`/pl/about` and `'About'` for the default/unknown locale. The Astro
runtime actually *invoking* `onRequest` per route needs a real `astro build`.

### Rich-text render pipeline (`lib/runtime/richText.ts`, `lib/runtime/richTextComponents.ts`) — implemented

How a CMS `rich-text` field (stored as a TipTap JSON doc) becomes page HTML — including
**embedded project components** (TipTap `menoComponent` nodes), which `tiptapToHtml`
serializes to placeholder markers
(`<div data-meno-component="Button" data-meno-props="{…}"></div>`).

| Export | Signature | Description |
|---|---|---|
| `toHtmlString` | `(value: unknown) => string` | Normalize any stored rich-text shape (plain HTML string / raw TipTap doc / `{ __richtext__, html }` / `{ __richtext__, format:'tiptap', json }`) to an HTML string — never `[object Object]`. Expands URL-bearing embed markers (Youtube/Vimeo: a `url`/`src` prop) to their responsive iframe (`expandRichTextEmbeds`); other markers pass through. Used by `Embed.astro` and `resolveProps` (rich-text props). |
| `richText` | `(value: unknown) => string` | The synchronous pipeline: `i18n()` locale resolve → `toHtmlString` → internal `<a href>`s localized (`localizeRichTextLinks`). Legacy emit target (`set:html={richText(cms.field)}`) — still parsed, no longer emitted. |
| `richTextWithComponents` | `(value: unknown, components: Record<string, unknown>) => Promise<string>` | **The current emit target** for every way a rich-text value renders — a field bound as a **text child**, a `type:"rich-text"` **prop** (`<Fragment set:html={richTextWithComponents(prop, cmsComponents)} />`), and (with the registry passed as `components={cmsComponents}`) an **embed node** bound to a rich-text field: runs `richText()`, then renders each remaining `menoComponent` marker to real HTML via Astro's **Container API** (`experimental_AstroContainer`, lazily created once per process, dynamic-imported so `astro` stays out of the static graph) against `components` — the converter-generated registry `src/cmsComponents.ts`. Unknown components / malformed props keep their marker (meno-core SSR parity); a component render error propagates. `set:html` awaits the returned promise natively. |

Why container-rendered markup is correct on any page: utility/interactive CSS is one
**build-time global stylesheet** scanned from every `.astro` source (the `meno()`
integration — `style()` only returns class names); component `<style is:global>` CSS
ships through the registry's import graph; component scripts are inline
(`is:inline`/`define:vars`), so they render into the returned string.

The registry (`src/cmsComponents.ts`, written by `convertProject` —
`buildCmsComponentsModule()`) is a **constant** file: an eager
`import.meta.glob('./components/**/*.astro')` keyed by component name (file basename), so
components created in the editor after conversion join it with no regeneration. Its
entries are lazy `get` accessors on purpose — the registry sits in an import cycle with
every rich-text-rendering component, and an eager `mod.default` read at module evaluation
throws a TDZ `Cannot access … before initialization` at build. `AstroPageProvider.save`
stamps the file into projects converted before it existed.

### `meno()` integration (`lib/integration/index.ts`) — implemented (mapping unit-tested; hook wiring needs a build)

The default export of `meno-astro/integration`. An `AstroIntegration` whose
`astro:config:setup` hook (a) maps the project `I18nConfig` → Astro's native `i18n` option
via `updateConfig`, and (b) injects the locale middleware via `addMiddleware({ entrypoint,
order: 'pre' })`.

| Export | Signature | Description |
|---|---|---|
| `meno` (default) | `() => MenoIntegration` | The integration. Add to `astro.config.mjs`: `integrations: [meno()]`. |
| `toAstroI18nOptions` | `(config: I18nConfig) => { defaultLocale, locales: string[], routing: { prefixDefaultLocale: false } }` | **Pure** project-i18n → Astro-i18n-options mapping. `locales` is the bare list of codes (de-duped; default-locale guaranteed present). `prefixDefaultLocale: false` matches Meno's convention (default locale served un-prefixed). |
| `LOCALE_MIDDLEWARE_ENTRYPOINT` | `'meno-astro/runtime/localeMiddleware'` | The entrypoint specifier the hook passes to `addMiddleware`. |

**Validated by unit tests** (`lib/integration/index.test.ts`): `toAstroI18nOptions` mapping
(codes, de-dup, default-locale presence) + the hook calling `updateConfig({ i18n: … })` and
`addMiddleware({ entrypoint, order: 'pre' })` against mock setup params. The **actual Astro
hook invocation + locale routing** are correct-by-design against Astro's documented
integration API but need a real `astro build` to validate.

### `meno-astro/components` (`lib/components/`) — written; `.astro` rendering needs a build

The runtime `.astro` components emitted markup imports
(`import { BaseLayout, Link, Embed, LocaleList } from 'meno-astro/components'`). The barrel
(`lib/components/index.ts`) re-exports each as a named export. **`.astro` files are compiled
by Astro's Vite plugin, not `tsc`** — they are not type-checked by this package's `tsc` run
(a local `*.astro` ambient shim lets the barrel resolve). Their rendering is **WRITTEN but
UNVERIFIED** pending a real `astro build`.

| Component | Role |
|---|---|
| `BaseLayout.astro` | Page shell. `<html lang={Astro.currentLocale ?? <defaultLocale>}>`; `<head>` renders `meta.title` / `meta.description` **resolved through `i18n()`** (they may be i18n values), favicons (`loadIconsConfig`, light/dark split), canonical + hreflang links, and the global utility stylesheet. Also wires the **head/SEO/config features**: `<ClientRouter>` when `meta.viewTransitions`, `<meta name="robots" content="noindex">` when `meta.noindex`, and raw author `customCode` (project-wide `loadCustomCode` merged with `meta.customCode`) injected into `<head>` / after `<body>` / before `</body>`. |
| `MenoImage.astro` | Optimized-image wrapper around Astro's `astro:assets` `<Image>`. The render target for a local `<img>` node, which optimizes by default (dialect §4.1; opt out with `data-meno-optimize="false"`). Remote sources need an allow-listed host in `project.config.json` `image.domains`. |
| `Markdown.astro` | Renders a `markdown` node's verbatim `source` to HTML at build via `set:html={renderMarkdown(source)}` (dialect §4.8). |
| `LocaleList.astro` | Locale switcher. One link per `config.locales` (via `loadI18nConfig(process.cwd())`), each pointing at the current page in that locale, **slug-translated** through the project slug map (`localeListItems`: `/about` ↔ `/pl/o-nas`; default locale un-prefixed), marking `Astro.currentLocale` (`aria-current`/`is-active`). CMS pages with `exactLocales` drop draft-hidden locales (their URLs are never built). |
| `Link.astro` | `<a href={href} class={class} {...rest}><slot /></a>` with the flattened href **localized to the active render locale** (`localizeHref` — `/about` renders as `/pl/o-nas` on pl pages). |
| `Embed.astro` | Raw-HTML injector (`set:html`; wrapped in a `<div>` only when a `class`/attrs are supplied, else a bare `<Fragment>`), with internal `<a href>`s localized (`localizeRichTextLinks`). The render form for an **embed node** bound to a CMS `rich-text` field — `<Embed html={i18n(cms.field)} components={cmsComponents} />` — it renders the value via `richTextWithComponents` when the emitter passes the registry (so embedded `menoComponent` components render too), otherwise (verbatim / URL / non-rich-text embeds, no `components`) it normalizes via `richText`/`toHtmlString`; either way a plain `{i18n(cms.field)}` (which prints `[object Object]`) is never used for rich-text. The `components` attr is destructured out so it never lands on the DOM, and is dropped on parse. (A rich-text field bound as a **text child** emits `<Fragment set:html={richTextWithComponents(cms.field, cmsComponents)} />` instead — see the rich-text render pipeline section above.) |

### CMS query parser (re-exported from `meno-core/shared/cmsQueryParser`) — implemented

| Export | Description |
|---|---|
| `parseFilterExpression` | Parse a CMS filter string into a filter config. |
| `serializeFilterExpression` | Inverse of the above. |
| `parseSortExpression` | Parse a CMS sort string (e.g. `"publishedAt desc"`) into a sort config. |
| `serializeSortExpression` | Inverse of the above. |

### Scope-aware emitter wrappers — implemented

The thin, scope-aware wrappers the generated markup calls (the rest of the
[dialect §9 runtime contract](./meno-astro-dialect.md#9-runtime-contract)):

| Symbol | Signature | Description |
|---|---|---|
| `href(linkValue, props?)` | `(LinkMapping \| { href, target? } \| string, props?) => string` | Resolve a structured/prop-mapped href against the host component's resolved props. |
| `when(mapping, props?)` | `(BooleanMapping, props?) => boolean` | Resolve a `BooleanMapping` to a boolean (for `if` conditions). |
| `getCollectionList(source, query?, Astro, getCollection)` | `(string, query?, AstroGlobal, getCollection) => Promise<any[]>` | Resolve a CMS collection list at build time (the caller passes `astro:content`'s `getCollection` — meno-astro never imports it itself). Synthesizes `_url`/`_id` per item. |
| `embedHtml(value, props?)` | `(structured, props?) => string` | Resolve a structured embed payload to an HTML string. |
| `queryList(items, query)` | `(any[], query) => any[]` | In-memory filter/sort/limit over an already-fetched list (nested collection lists filtered by an outer loop var). |
| `inlineStyle(decls, props?)` | `(Record<string, string>, props?) => string \| undefined` | Render prop-bound root styles as an inline `style=…`, suppressing declarations the instance class overrides (so instance utility classes win). |
| `renderMarkdown(source)` | `(string) => string` | Render a `markdown` node's verbatim Markdown `source` to HTML at build/SSR (markdown-it, mirroring meno-core's shared config). Used by `Markdown.astro` (dialect §4.8). |

---

## `meno-astro/dialect` (`lib/dialect/index.ts`)

The codec. Editor/build-only — never shipped into a generated project's runtime.

### Functions

| Export | Signature | Description |
|---|---|---|
| `emit` | `emit(model: DialectModel): string` | Serialize a Meno model to deterministic `.astro` dialect source. Canonicalizes (`normalizeModel`) first, then dispatches to `emitComponent` or `emitPage`. |
| `parse` | `parse(source: string): ParseResult` | Parse `.astro` dialect source back to `{ model, regions }`. Output model is `normalizeModel`-ed. |
| `normalizeModel` | `normalizeModel(model: unknown): unknown` | Canonicalize a model: drop empties, collapse single text children, canonicalize prop-list sources, migrate legacy `cms-list`/`image`. Idempotent. See [dialect §8](./meno-astro-dialect.md#8-normalization--the-round-trip-contract). |

### Types

| Export | Definition |
|---|---|
| `DialectModel` | `JSONPage \| StructuredComponentDefinition \| ComponentFile` |
| `ComponentFile` | `{ component: StructuredComponentDefinition }` |
| `MenoRegion` | `{ nodeId?: string; kind: 'editable' \| 'rawClass' \| 'verbatim'; start: number; end: number }` |
| `ParseResult` | `{ model: DialectModel; regions: MenoRegion[] }` |

> The internal emit/parse modules (`emit/serialize.ts`, `emit/emitNode.ts`, `parse/*`) are
> **not** part of the public surface — only the four functions/types above are exported
> from `dialect/index.ts`.

---

## `meno-astro/server` (`lib/server/index.ts`)

Server/build-only: filesystem providers and conversion. Not for the browser bundle.

### `AstroPageProvider` — implemented

`new AstroPageProvider(pagesDir: string)`. A drop-in `PageProvider` (the
`meno-core/shared/interfaces/contentProvider` interface) that stores pages as `.astro`
dialect files while presenting the **same JSON string interface** to `PageService`. The
codec lives inside the provider:

- `loadAll(): Promise<Map<string, string>>` — recursively read `*.astro` → `parse` →
  `JSON.stringify(model)`.
- `get(path): Promise<string | null>` — read one page as a JSON string.
- `save(path, content): Promise<void>` — `JSON.parse(content)` → `emit` → write `.astro`.
- `delete(path)`, `exists(path)` — file ops; `delete` also prunes now-empty parent dirs.

Because the interface is unchanged, `PageService` and the rest of the JSON runtime need
zero edits — selecting this provider (vs `FileSystemPageProvider`) is the only switch.

**CMS template pages** (`meta.source === 'cms'` + `meta.cms`) are stored as Astro dynamic
routes `src/pages/<collection>/[slug].astro` (with `getStaticPaths`) and mapped to the
editor page path `/templates/<collectionId>` (the JSON-mode convention) — `loadAll`/`get`/
`save`/`exists`/`delete` for `/templates/<col>` resolve to that file. Regular pages keep
their normal paths. See the [dialect §3.1.1](./meno-astro-dialect.md).

### `AstroComponentLoader` — implemented (read only)

`new AstroComponentLoader(componentsDir: string)`. Matches meno-core's `ComponentLoader`
interface (the injectable loader `ComponentService` accepts). Reads `.astro` dialect
components from `src/components`:

- `loadDirectory(_dir?): Promise<Map<string, ComponentDefinition>>` — walk the components
  dir, `parse` each `.astro`, key by component name; nested dirs become `_category`. (The
  `dir` argument is ignored — the loader owns its configured dir.)
- `loadFile(path): Promise<string | null>` — raw file read.

> **Component SAVE is NOT handled here.** Component writes still go through
> `ComponentService`'s JSON path. Making component saves write `.astro` (a format-aware
> components dir) is the remaining piece — see [Status](#status).

### Config & SEO loaders (`lib/server/*`) — implemented

Mtime-memoized `project.config.json` readers consumed by `BaseLayout` (per render) and the
`meno()` integration (`astro:config:setup`). All **never throw** — a missing/unparseable
config degrades to "feature off". Each is also re-exported from `meno-astro/server`.

| Export | Signature | Description |
|---|---|---|
| `loadCustomCode` | `(projectRoot) => { head?, bodyStart?, bodyEnd? }` | Project-wide `customCode` HTML. The dialect twin of meno-core SSR's custom-code block. |
| `mergeCustomCode` | `(global, page?) => { head, bodyStart, bodyEnd }` | Merge project-wide + a page's `meta.customCode` (global first, page appended), the order `BaseLayout` injects. |
| `loadAstroConfigExtras` | `(projectRoot) => { redirects?, image?, prefetch?, devToolbar? }` | Maps Studio settings onto **Astro config** options the integration applies via `updateConfig`: `redirects` (`[{from,to,status?}]` → Astro's map), `image.domains` (remote hosts the optimizing `<MenoImage>` may process), `prefetch` (Meno `PrefetchConfig` → Astro native prefetch), `devToolbar`. Only keys actually set are returned. **In play mode the integration drops `prefetch` and forces `devToolbar` to the explicit setting** (Astro defaults the toolbar on in dev). |
| `loadSitemapMeta` | `(projectRoot) => Map<routePath, { priority?, changefreq?, exclude? }>` | Per-page `meta.sitemap` collected from every `src/pages/**.astro` (build-only), keyed by normalized route path incl. every locale variant — consumed by the `sitemap.xml` hook. `exclude` drops the page; `priority` (0..1) / `changefreq` (enum) annotate it. |
| `loadIconsConfig` | `(projectRoot) => { favicon?, faviconDark?, appleTouchIcon? }` | Project `icons` → BaseLayout `<link rel="icon">` (light/dark split when both favicon + faviconDark set). |

### `detectProjectFormat` + dir helpers — implemented

| Export | Signature | Description |
|---|---|---|
| `detectProjectFormat` | `(projectRoot: string) => ProjectFormat` | Resolve a project's format: (1) explicit `project.config.json` `"format"`, (2) else auto-detect (`src/pages` ⇒ `astro`, else `json`), (3) else `json`. |
| `pagesDir` | `(projectRoot: string, format: ProjectFormat) => string` | `astro` → `<root>/src/pages`, else `<root>/pages`. |
| `componentsDir` | `(projectRoot: string, format: ProjectFormat) => string` | `astro` → `<root>/src/components`, else `<root>/components`. |
| `contentDir` | `(projectRoot: string, format: ProjectFormat) => string` | CMS items dir. `astro` → `<root>/src/content`, else `<root>/cms`. |
| `cmsTemplatesDir` | `(projectRoot: string, format: ProjectFormat) => string` | Dir holding CMS template pages (schema source). `astro` → `<root>/src/pages` (templates are `[slug].astro` routes scanned recursively), else `<root>/templates`. Pass as `AstroCMSProvider`'s first arg. |
| `ProjectFormat` | `'json' \| 'astro'` (type) | The on-disk format discriminator. |

JSON is the default, so a project that is not explicitly Astro keeps working exactly as
today.

### `convertProject` — implemented

| Export | Signature | Description |
|---|---|---|
| `convertProject` | `(srcRoot: string, destRoot: string) => Promise<ConvertResult>` | Opt-in JSON → `.astro` converter. Emits a parallel project under `destRoot` with pages/components as dialect `.astro` (under `src/`), writes `project.config.json` with `format: "astro"`, migrates CMS to Astro content collections, and copies assets + config verbatim. Uses the same `emit` the editor uses on save, so output round-trips. |
| `ConvertResult` | `{ pages: number; components: number; cmsCollections: number; destRoot: string }` (type) | Counts of converted files + the resolved destination. |

Copied verbatim: `components.config.json` and the `images` / `fonts` / `icons` directories.
**Design tokens → one stylesheet:** theme colors + CSS variables are written to a single
`src/styles/theme.css` (the source of truth) rather than copied as the legacy `colors.json` /
`variables.json` — those JSON token files are retired for astro projects. **CMS → Astro
content collections:** CMS items copy to `src/content/<collection>/` (Astro's content
layer), CMS template pages emit as `src/pages/<collection>/[slug].astro` dynamic routes
(with `getStaticPaths`), and a `src/content.config.ts` is generated. The root `templates/`
tree is retired.

---

## Status

A concise implemented / pending map. Verified against the source on
`feat/styles-visual-controls` (all `bun test packages/astro` tests pass).

### Implemented & tested

- **`emit`** — full per-node-type grammar (node, component, slot, link, embed, list
  [prop + collection], locale-list, dynamic tags, conditionals), deterministic literal
  serialization, frontmatter assembly (`resolveProps(Astro, {…})`/`__meno`/`meta`).
- **`parse`** — the exact inverse, including `style()`/`i18n()`/`href()`/`when()` call
  reversal, `{{…}}` template reconstruction, `.map()` list reconstruction, hoisted
  embed/tag consts, and `getCollectionList` binding reconstruction.
- **`normalizeModel`** — canonicalization + legacy `cms-list`/`image` migration; idempotent.
- **Round-trip gate** — `parse(emit(normalizeModel(x))) === normalizeModel(x)` over the
  whole `example/` project + per-node fixtures.
- **`AstroPageProvider`** — page read/save/delete as `.astro` behind the JSON interface,
  including CMS template pages (`src/pages/<col>/[slug].astro` ↔ `/templates/<col>`).
- **`AstroComponentLoader`** — component **read** as `.astro`.
- **`detectProjectFormat` / `pagesDir` / `componentsDir` / `contentDir` / `cmsTemplatesDir`** — format selection.
- **CMS dynamic routes** — CMS template pages emit/parse as
  `src/pages/<collection>/[slug].astro` with a derived `getStaticPaths()` +
  `const { cms } = Astro.props;` (emit-only boilerplate the parser skips). Schemas read by
  **`AstroCMSProvider`** from those pages' `meta.cms`; items in `src/content/<collection>/`.
- **`convertProject`** — JSON → `.astro` project conversion (pages + components + config +
  assets + CMS to content collections + CMS templates to `[slug].astro` routes).
- **`list()`** runtime helper + i18n / CMS-query primitive re-exports.
- **`i18n()`** runtime resolver + the `runWithLocale` / `getLocaleContext` /
  `localeFromAstro` locale-context API (`AsyncLocalStorage`-backed). Resolves an i18n
  value to the active locale via the meno-core fallback chain; non-i18n values pass
  through.
- **i18n end-to-end wiring (middleware + integration + BaseLayout)** — `loadI18nConfig`
  (read + migrate the project's `.i18n`), `createLocaleMiddleware` / `deriveLocale` (the
  per-render `runWithLocale` seam), the `meno()` integration (`toAstroI18nOptions` mapping
  + `addMiddleware` injection), and the `meno-astro/components` (`BaseLayout` /
  `LocaleList` / `Link` / `Embed`). **Validated by unit tests on the resolution logic:**
  config load (valid / missing / legacy `string[]` migration), `deriveLocale` precedence,
  the integration's i18n-options mapping, and — the key proof — the **middleware → `i18n()`
  end-to-end chain** (mock `context` + mock `next` calling `i18n({en:'About',pl:'O nas'})`
  → `'O nas'` for `pl`, `'About'` for default/unknown). The **`.astro` components, the
  Astro integration's actual hook invocation, and real `/pl/…` locale routing require a
  real `astro build` to validate.**
- **`style()`** runtime resolver — class-name resolution at render; the matching
  utility/interactive CSS is generated at BUILD time by the `meno()` integration
  (`virtual:meno-utilities.css`, imported by `BaseLayout`), replacing the earlier
  render-time collector design. Reuses meno-core's `generateInteractiveCSS` +
  `DEFAULT_BREAKPOINTS` + `shortHash` wholesale.
- **All runtime helper wrappers** the emitted markup imports: `href()`, `when()`,
  `getCollectionList()`, `embedHtml()` — implemented; emitted `.astro` files build and
  run.
- **i18n routing & link localization** — the integration-injected `/[locale]/[...path]`
  route (`LocaleRoute.astro`) serving non-default-locale URLs from `meta.slugs`
  (`loadSlugMappings` + `enumerateLocaleStaticPaths`), render-time internal-href
  localization in `Link`/`Embed` (`localizeHref` / `localizeRichTextLinks`),
  slug-translated `LocaleList` links, and hreflang alternates in `BaseLayout`
  (`buildHreflangLinks`). Validated by unit suites AND real `astro build`/`astro dev`
  runs over the converted `example/` project. See
  [meno-astro-i18n.md](./meno-astro-i18n.md).
- **CMS i18n** — localized CMS item URLs end to end: per-locale `slugField` values
  (`I18nValue`) route (`/blog/my-post` + `/pl/blog/moj-post`; plain-string slugs serve
  the same slug under every locale prefix), authored links to CMS items localize,
  hreflang/`LocaleList`/sitemap cover CMS pages via the merged slug map
  (`loadCmsSlugMappings` + `enumerateCmsLocaleStaticPaths` +
  `resolveCmsEntrySlug` in the generated `content.config.ts`), and `_draftLocales`
  filtering matches the JSON static build (hidden locales not built/advertised).
  NOT covered: i18n FIELD values on the *default-locale* item page still render raw
  (needs an emit-side `i18n()` wrapper — pre-existing), `/{{locale}}/…` urlPatterns
  stay collapsed to the pages root (emit-side degrade), and a default-locale
  `_draftLocales` entry cannot suppress the default URL (frozen `getStaticPaths`
  boilerplate). See [meno-astro-i18n.md](./meno-astro-i18n.md) §2.
- **Component SAVE to `.astro`** — `AstroComponentWriter` (writer-injected
  `ComponentService`).
- **`.astro` file-watcher** — provider-based page reload covers externally-edited
  `.astro` files (`FileWatcherService` → `pageService.reloadPageFromDisk`).
- **Head / SEO / project config** — `meta.viewTransitions` (`<ClientRouter>`), `meta.noindex`,
  per-page `meta.sitemap` (priority/changefreq/exclude), page + project `customCode`
  injection, favicons (`loadIconsConfig`), and the `project.config.json`-driven Astro options
  `redirects` / `image.domains` / `prefetch` / `devToolbar` (`loadAstroConfigExtras`,
  applied at `config:setup`; play drops prefetch + forces the explicit devToolbar).
- **Optimized images** — a local `<img>` → `<MenoImage>` (`astro:assets`) by default (opt out with
  `data-meno-optimize="false"`); remote/`data:`/`.svg` stay bare unless marked `="true"`, remote
  sources gated by `image.domains`.
- **Markdown node** — `type:"markdown"` verbatim source → `<Markdown>` / `renderMarkdown()`.
- **Astro Islands** — BYO React/Preact/Vue/Svelte components under `src/islands/`; the
  `meno()` integration auto-provisions the `@astrojs/<fw>` renderer (dialect §4.7).
- **Custom components** — `type:"custom"`, an opaque foreign `.astro` under `src/custom/`. A
  plain native Astro import (no renderer, **no provisioning**, ships in the app with no
  `meno-astro` publish); Meno passes only explicit props + slotted children and treats the
  internals as a server-only black box (dialect §4.9; real-build e2e `custom-e2e.mjs`). The
  server-only sibling of an island.
- **SSR output + adapter** — declared in **`project.config.json`** as `"output": "server"` +
  `"adapter": { "name": "node" | "cloudflare" | "netlify" | "vercel", "mode"?: "standalone" |
  "middleware" }` (read by `loadAstroConfigExtras`). `meno()` sets `output` and registers
  `@astrojs/<adapter>` for you (provisioned via `MENO_ASTRO_ADAPTER`); a missing adapter degrades
  to a clean static build. See the ⚠️ rule below — **never import the adapter in `astro.config.mjs`.**

> ⚠️ **Editing `astro.config.mjs` — never add an adapter or any 3rd-party import.** The Meno preview
> runs `astro dev` against a **shared runtime store** that only carries `astro`, `meno-astro`,
> `meno-core` (+ reserved). So `astro.config.mjs` may **only import from `astro/config`, `meno-astro`,
> or `meno-astro/integration`** (`ALLOWED_CONFIG_IMPORTS`). An SSR adapter (`@astrojs/node`/…), another
> integration, or any foreign package isn't in the store, so the `inspectAstroConfig` guard refuses the
> preview: *"This project has a custom astro.config that imports \"<pkg>\", which the shared Astro
> preview runtime doesn't include."* **Configure SSR in `project.config.json` (above), not the config.**
> The canonical config stays `defineConfig({ integrations: [meno()] })` (+ optional `env: { schema }`
> for `astro:env`, allowed because `envField` is from `astro/config`).

### NOT yet implemented (in-progress / pending)

- **Static `href` attributes on plain nodes** are not localized at render (link nodes and
  embed HTML are); needs an emit-side wrapper.
- **Region tracking / escape hatches — mostly done.** `verbatim` regions are populated:
  arbitrary JS in a `{ … }` value/attribute/condition that the template engine can't
  evaluate (function/method calls, etc.) is preserved as a `{ _code, expr }` marker, round-
  trips, renders natively at build, and is reported as a `kind: 'verbatim'` region.
  Hand-authored frontmatter is captured as a verbatim `_frontmatter` passthrough block and
  round-trips (the whole-component escape hatch is the `custom` node, dialect §4.9; a fully
  non-dialect page opens read-only). A static `class="…"` (utility + foreign tokens) round-trips via
  `attributes.class` (the canonical styling form); only its distinct `rawClass` *region report* and
  `editable`-span tracking are still pending.

### Known semantic gaps in current output

- **Legacy `cms-list` loop variable — FIXED.** The migration sets `itemAs: "item"` for
  legacy `cms-list`, so the emitted collection loop binds `item` to match the children's
  `{{item.*}}` templates. See
  [dialect §5.2](./meno-astro-dialect.md#52-collection-list) and
  [§10.1](./meno-astro-dialect.md#101-known-gaps).
- **Templates inside `StyleObject` values are not converted to `${}`.** A style value like
  `maxWidth: "{{maxWidth}}"` is emitted as a literal string inside the `style()` argument
  (correct for round-trip). The PoC `style()` resolves prop-bound `_mapping` values but does
  **not** yet resolve `{{…}}` string templates inside style values — that remains open. See
  [dialect §6.1](./meno-astro-dialect.md#61-expr-templates--js-expressions).

### Validate the i18n wiring on a real Astro build

The resolution logic is unit-tested; the `.astro` components + the Astro integration's
hook/middleware invocation + actual `/<locale>/…` routing need a real build. Recipe:

1. **Make a 2-locale source project.** Use `example/` (its `project.config.json` already
   declares `en` + `pl`) or any Meno JSON project whose `.i18n` has ≥2 locales and whose
   pages use i18n values (`{ _i18n, en, pl }`) and/or a `locale-list` node.
2. **Convert it:** `convertProject(srcRoot, destRoot)` (or the editor's converter). The
   scaffolded `astro.config.mjs` now imports `meno` from `meno-astro/integration` and sets
   `integrations: [meno()]`.
3. **Install + build** in `destRoot`: `npm install` (resolves `astro` + `meno-astro`),
   then `astro build` (or `astro dev`).
4. **Check the output:** confirm `/pl/...` pages are generated and render the **Polish**
   strings (page body `i18n(...)` values resolved via the middleware), `<html lang="pl">`,
   the `<title>`/`<meta name="description">` in Polish, the `LocaleList` links point at the
   per-locale paths with the active one marked, and the page's `style()` CSS landed in a
   `<style>` tag. The default-locale pages should be served un-prefixed (`/about`, not
   `/en/about`).

> A **fully** localized build also still needs the emitter to thread each component's
> `props` into its `style(styleObject, props, meta)` call so prop-bound `_mapping` styles
> resolve (see the pending item above). The runtime components now exist; that emit-side
> change is the remaining piece for prop-driven styles.
