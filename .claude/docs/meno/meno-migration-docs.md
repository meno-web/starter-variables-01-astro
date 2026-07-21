# Webflow / pure-CSS → Meno migration guide

Practical playbook for turning an imported pure-CSS site (Webflow export, HTML/CSS site,
etc.) into a scalable Meno component project (`ui` / `blocks` / `sections`), **using only
the meno-astro dialect**, while keeping the rendered result pixel-identical.

This doc fills the gaps between the dialect spec (`meno-astro-dialect.md`), the component
model (`components.md`), and what the **installed runtime actually does**. Where they
disagree, this doc reflects behavior verified empirically against **meno-astro 0.1.32** on
a running dev server — test on yours; other versions may differ.

---

## 0. The mental model you must have first

**How Meno generates the CSS for your utility classes:** the `meno()` integration
**parses every `.astro` file into the Meno model**, then collects class tokens from two
places only — `attributes.class` (literal `class="…"` strings) and `style()` objects — and
generates CSS for exactly those. Consequences that are NOT obvious from the docs:

1. **A file that fails to parse is silently skipped** — its classes get **no CSS** (you
   get a `[meno-astro] utility-CSS: could not parse …` warning in the dev-server stdout,
   which you usually can't see). The element renders with default/unstyled appearance.
   This is the #1 cause of "my component renders blank."
2. **Classes buried in a `cx()`/`variants()` call must survive parse into the model** to
   get CSS. A literal string arg to `cx(...)` becomes `attributes.class` (collected). A
   `variants(__props, {...})` table becomes `style` mappings (collected). Anything the
   parser can't interpret is **dropped** — no error, no CSS.
3. The runtime `variants()`/`cx()` helpers just **join literal strings**; `style()`
   **computes a deterministic class name**. This distinction is the root of the color bug
   in §4.

So: **author only what the parser round-trips.** Stay inside the grammar the dialect spec
documents — an out-of-grammar construct fails silently, not loudly.

---

## 1. Fastest end-to-end workflow

1. **Find the source CSS.** A Webflow import loads a big minified stylesheet (often via
   `meta.customCode.head` as a `/…/*.webflow.*.min.css` link under `public/`). Beautify it
   and build a per-selector lookup (§2). The `:root` block is a **ready-made design
   token system** — port it wholesale.
2. **Port tokens → `src/styles/theme.css`** (§5). Base palette + semantic aliases
   (`var()` aliasing works). This is your "variables".
3. **Capture ground truth** (§3): open the running site, dump `getComputedStyle` for every
   element you're about to convert. This is your pixel target.
4. **Build the `ui` atoms** (`Heading`, `Text`, `Button`, …) using the §4 pattern. Render
   them on a throwaway page and diff computed styles vs step 3.
5. **Convert one section**: replace its Webflow classes with utilities + your components,
   in place, by line range. Keep the outer page wrapper and other sections untouched (the
   original CSS stays loaded and styles them — see §6).
6. **Verify in the browser** (§3), section by section. Extract `blocks/` and
   `sections/` once the atoms are proven.

Keep the original stylesheet loaded for the whole transition; remove it only when the last
section is converted.

---

## 2. Source-CSS lookup

**`cssq.py`** — pull the exact rules for a class out of the (beautified) source CSS, with
their `@media` context. Brace-match `@media`/rule blocks; print rules whose selector
contains any argv term. (Trivial to reproduce; saves guessing token values.)

**Don't build parse-checking tooling.** The editor surfaces parse failures on its own —
don't write a `parsecheck`/`modeldump` script, don't hunt for a sibling `meno-astro` install
to import the codec from, and don't re-check files after each edit. Author inside the
grammar (§0) and let the editor report what didn't parse.

---

## 3. Ground-truth capture (in-browser)

Before converting, snapshot the real computed styles; after, diff against them.
```js
// run in the page console via the browser tool
const cs=(sel,ps)=>{const e=document.querySelector(sel);if(!e)return{sel,missing:1};
  const s=getComputedStyle(e),o={};ps.forEach(p=>o[p]=s[p]);return o;};
JSON.stringify({ h1: cs('h1.heading', ['fontSize','lineHeight','letterSpacing','fontWeight','color']), /* … */ });
```
- **Scope selectors to the section** — navbars/repeated components match first otherwise.
- **The MCP browser renders at a fractional device scale** (a `1px` border reads as
  ~`0.556px`, columns as `571.45px`). It's consistent, so **compare converted-vs-original
  in the same browser**, not against absolute px.
- **Images `loading="lazy"`** report `complete:false`/`naturalWidth:0` until scrolled in +
  a beat — a blank image box is usually just lazy-load timing, not a bug. Set
  `loading='eager'` / await `onload` before measuring.

---

## 4. Component authoring — the pattern that works

### Canonical prop-variant component
```astro
---
import { resolveProps, cx, variants, style } from 'meno-astro';

const __props = resolveProps(Astro, {
  text: { type: "string", default: "Heading" },
  level: { type: "select", options: ["1", "2", "3"], default: "2" },
  size: { type: "select", options: ["h1", "h2", "h3"], default: "h2" },
  color: { type: "select", options: ["primary", "secondary"], default: "primary" }
});
const { text, level, size, color, class: className } = __props;
const Tag_0 = `h${level}`;
---
<Tag_0 class={cx("font-[400]",
  variants(__props, {
    size: {
      h1: "text-[4.75rem] leading-[1] tracking-[-0.19rem]",
      h2: "text-[3.5rem] leading-[1.2] tracking-[-0.14rem]",
      h3: "text-[2.75rem] leading-[1.2] tracking-[-0.11rem]"
    }
  }),
  style({ base: { color: { _mapping: true, prop: "color",
    values: { primary: "var(--text-primary)", secondary: "var(--text-secondary)" } } } }, __props),
  className)}>{text}</Tag_0>
```

Rules embedded in that skeleton, each learned the hard way:

- **`const __props = resolveProps(...)` then destructure from `__props`.** The first arg to
  `variants(...)` and the props arg to `style(...)` **must be the literal `__props`** — the
  parser only recognizes that shape. `variants({ size }, …)` or `variants({size:size}, …)`
  fails or drops.
- **Dynamic element tag**: `const Tag_0 = \`h${level}\`` (or bare `` `${tag}` `` for an
  arbitrary element name) then `<Tag_0 …>`. Both round-trip. Lets one component render
  `<h1>`–`<h6>` / `<p>`/`<div>`/`<span>` from a prop.
- **`variants(__props, { prop: { value: "utility classes" } })`** — for prop-driven styling.
  Its runtime output is the **literal class string**, so it only works when that string is
  **emit-stable** (see §4 color rule). Good for: sizes, spacing, radius, gap, flex/grid
  layout, gradients — anything expressed as a **bracket value**.
- **`style({ base: {...}, hover: {...}, mobile: {...} }, __props)`** — for prop-driven
  **colors** and responsive/interactive mappings. Use `_mapping` entries:
  `{ cssProp: { _mapping: true, prop: "<propName>", values: { <propValue>: "<css value>" } } }`.
  Unmatched values degrade gracefully (property omitted). `style()` **computes** its class
  name at runtime so it matches the build-generated CSS. Multiple props/properties can live
  in one `style()`.
- **`cx("static base", variants(...), style(...), className)`** — assemble. `cx` is a
  last-wins Tailwind-style merge; the static first arg becomes `attributes.class`; keep
  `className` last so instance overrides win.
- Components render `<Link href={href}>` for links (import from `meno-astro/components`);
  a `<slot/>` for arbitrary inner content (icons + label). One slot max.
- `<Link>` intrinsically applies a `block no-underline text-inherit` reset (conflict-aware:
  dropped per-property when your classes set that property). So set `flex`/`inline-flex`
  and an explicit color on link-based buttons.

### THE COLOR RULE (biggest single gotcha)
The build canonicalizes any **color that equals a defined token** to a named class
`.text-<tokenname>` (e.g. `#6d6d6d` → `--neutral` → `.text-neutral`). Therefore:

| Position | Token color form | Works? |
|---|---|---|
| Static `class="…"` / `className` passthrough | `text-(--token)` | ✅ yes (collected verbatim) |
| `variants(__props, {…})` value | `text-(--token)` **or** `text-[#hex]` | ❌ **no** — variants emits the literal, build emits `.text-<name>` → mismatch, color never applies |
| `style({ base:{ color:{_mapping…, values:{v:"var(--token)"}}}}, __props)` | via `_mapping` | ✅ yes — `style()` computes the matching name |

So: **prop-driven colors → `style()`. Fixed colors → static `class`. Never colors in `variants()`.**
Non-color bracket utilities (`text-[3.5rem]`, `gap-[8px]`, gradients) are fine in `variants()`.

---

## 5. Utility syntax cheat-sheet (verified)

- **CSS var / token ref:** `text-(--token)`, `bg-(--token)`, `border-(--token)`
  (border-**color** only), `rounded-(--radius-lg)`. Aliased tokens resolve
  (`--text-primary: var(--black)` → `#0c0c0c`). ✅ in static positions.
- **Arbitrary literal:** `text-[3.5rem]`, `p-[32px]`, `leading-[1.2]`, `tracking-[-0.14rem]`,
  `font-[500]` (font-weight), `w-[1rem]`, `max-w-[54rem]`, `rounded-[4px]`. Use `_` for
  spaces inside `[…]`.
- **Arbitrary CSS property:** `[column-gap:0.5rem]`, `[row-gap:1rem]`,
  `[font-family:var(--font-mono)]`, `[transition:all_0.3s]`. Use for anything without a
  named utility.
- **Gradient:** `bg-[linear-gradient(189deg,var(--a)_12%,var(--b))]` — works verbatim.
- **BORDER:** bare `border` / `border-2` / `border-t` / `border-b-4` / `border-solid` now render a
  visible `1px solid` border (the width you name + `solid`; the color is left off so it inherits the
  current text color) — Meno supplies the style a Preflight-less setup otherwise lacks. Set the **color**
  with a token or literal — `border` `border-(--token)` (or `border-[#0c0c0c]`); the per-side forms emit
  no color at all, so a `border-<token>` class controls it with no cascade fight — and the **style** with
  `border-dashed` / `border-dotted`. `border-x` / `border-y` target the inline / block axes. Still
  unsupported: Tailwind's palette (`border-gray-200`) — use a token. The fully-explicit
  `border-[1px_solid_var(--token)]` / `[border-bottom:1px_solid_var(--token)]` forms remain valid if you
  prefer to name everything in one utility.
- **Layout:** `flex`, `inline-flex`, `flex-col`, `grid`, `grid-cols-2`, `items-center`,
  `justify-center`, `justify-start`, `gap-[8px]`, `flex-wrap`, `h-full`, `w-full`,
  `overflow-auto`, `hidden`, `inline-block`, `uppercase`, `no-underline`.
- **Responsive:** desktop-first utility prefixes `max-lg:` (tablet, ≤1024px) / `max-sm:` (mobile,
  ≤540px) — base wins, narrower tiers override down (`max-lg:p-[16px]`). Bare `tablet:`/`mobile:` is
  legacy (accepted on parse but re-emitted to the `max-` form — don't author it). Thresholds come from
  `project.config.json` `breakpoints`. (Note: the `style({...})` object still keys tiers as
  `base`/`tablet`/`mobile` — that's the object-key form, distinct from the class prefix.)
  **States:** `hover:` / `focus:` / `active:`.
- Foreign/unmodeled tokens (e.g. a `no-scrollbar` class defined in an injected `<style>`)
  are **preserved verbatim** alongside utilities — handy for one-off effects you don't want
  to reimplement.

---

## 6. Migration strategy & fidelity

- **Keep the original stylesheet loaded during the transition.** It provides `@font-face`,
  base resets, the body font, and styles every not-yet-converted section. Your converted
  section stops using the old semantic class names, so there's no collision — your utility
  classes fully re-create the look. Remove the old CSS only after the last section.
- **Convert section-by-section, in place, by line range** (splice with a script rather than
  fragile whole-file string edits). Convert the **outer page wrapper / shared containers
  last** — they affect every section.
- **Element-level globals win by cascade the right way:** a utility `class` (specificity
  0,1,0) beats the old CSS's element rules (`h1{…}`, 0,0,1), so a `<Heading>` rendering
  `<h1 class="text-[3.5rem]…">` overrides the imported `h1` sizing. Good.
- **Desktop is exact; responsive is approximate.** Webflow breakpoints (991/767/479) ≠
  Meno's (config 1024/540). Also `project.config.json` `responsiveScales` may auto-scale
  values at tablet/mobile. Nail desktop first, then **verify tablet/mobile separately** and
  decide whether to disable `responsiveScales` or add explicit `max-lg:`/`max-sm:` overrides.
- **Fonts:** custom `@font-face` usually lives only in the imported stylesheet. While it's
  loaded, components inherit the body font. When you drop the old CSS, port `@font-face` +
  font-family tokens into the theme.

---

## 7. Parser & environment facts (save yourself the debugging)

- **Every component needs the `resolveProps(Astro, {…})` call — even with no props.** It's the marker
  that makes the `.astro` a *component*. Omit it and the parser reads the file as a *page* (a `root`,
  no component `structure`); `/api/component-data` then returns 400 and **Studio fails to open it with
  "This component is missing its structure definition."** So when you extract a section into a
  component, always include `const { class: className } = resolveProps(Astro, {});` (add props to the
  `{…}` as needed). This — NOT a literal `class="…"` — is the usual cause of that Studio error (a
  component with all-literal classes opens fine as long as `resolveProps` is present).
- **NO trailing commas** and **NO ES6 shorthand** in any dialect object literal
  (`resolveProps`, `variants`/`style` tables). `{ size }` → `{ size: size }`; no comma
  before `}`. Violations throw `parseLiteral: expected object key` / `expected ":"`.
- Emit **canonicalizes** authored forms: `style()` color/interactive mappings re-emit as
  `variants(__props, {…})` with `text-(--token)` — which is the broken-at-render form. So a
  component **edited & saved through the Studio visual editor** can have its token colors
  re-broken. Authored-and-file-saved components are fine (see auto-commit below). This is a
  0.1.32 codec inconsistency worth reporting.
- **Meno Studio auto-commits file writes verbatim** (commits named "update X file"); it does
  **not** re-emit through the codec on save. So hand-authored `.astro` persists as written.
- **Astro ignores `_`-prefixed files as routes** — name throwaway test pages without a
  leading underscore (`menotest.astro`, not `_test.astro`).
- Studio groups components by **folder** under `src/components/` (`ui/`, `blocks/`,
  `sections/`) — organize by folder, not metadata.
- Dev server is typically on `localhost:4321`. `.meno/selection.json` holds the
  editor's current selection.

---

## 8. Suggested component set for a marketing-site migration

- `ui/`: `Heading` (level + size + color), `Text` (tag + size + weight + color), `Button`
  (variant + href, slot for icon), maybe `Tagline`, `Icon`/embed wrapper, `Spacer` (size).
- `blocks/`: composed repeats — badge/label, card, list-item, logo-item, nav pieces.
- `sections/`: one component per page section, composing blocks + ui. Section-specific
  content (copy, images, SVG embeds) can be hardcoded in the section or lifted to props.
