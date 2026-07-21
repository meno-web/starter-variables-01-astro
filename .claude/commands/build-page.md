---
description: Create a new Meno page from description
allowed-tools: Read, Write, Glob
argument-hint: "[page description]"
---

# Build Page

Create a new `.astro` page, reusing existing components where possible. The page is
authored directly as **meno-astro dialect** and written to `src/pages/<slug>.astro`.

## Usage

```
/build-page [description]
```

## Instructions

1. **Understand the request**: Parse $ARGUMENTS for the page description.

2. **Discover available components**:
   - List the component library with Glob (`src/components/**/*.astro`). The filename stem
     is the component name; the folder (`ui/`, `form/`, `block/`, `layout/`, `section/`)
     is where it lives.
   - For each candidate that matches the need, **read its `.astro` file** and look at the
     `resolveProps(Astro, {...})` literal in the frontmatter — that object is authoritative
     for the component's props (prop name → `{ type, default, options? }`). Pass props as
     JSX attributes matching that literal.
   - If the project is fresh/blank and has no matching components, use the `/meno-astro`
     skill + `.claude/docs/meno/meno-astro-dialect.md` (and the adv-19 example project) for
     Layout / Navigation / Hero / Card-grid / Footer patterns, and author the missing
     components with `/build-component` before building the page.

3. **Check the base component**:
   - Look at the `Base component:` line in your `## Current Project` context (provided
     automatically — do not read `project.config.json` for this). If a base component is
     listed (commonly `Layout`), wrap the page body in it: `<Layout> … </Layout>` (always
     inside `<BaseLayout meta={meta}>`). If no base component is listed, use a plain
     `<main> … </main>` instead.

4. **Build the page using this priority order**:

   **Priority 1 — Existing components**: compose the page from what's already in
   `src/components/**`. Import each with a relative path from the page
   (`import HeroSection from '../components/section/HeroSection.astro';`) and use it as a
   Capitalized tag with JSX-attribute props.
   ```astro
   <HeroSection title="..." />
   ```

   **Priority 2 — New components**: if a pattern repeats or the page needs a clear section
   (hero, feature grid, CTA), author a reusable component at
   `src/components/<Folder>/<Name>.astro` with `/build-component`, then import and reference
   it. Use the `/meno-astro` skill + adv-19 example as a starting point.

   **Priority 3 — Raw nodes**: inline plain HTML tags only for layout scaffolding that isn't
   worth extracting. Static styling is a literal utility `class="..."` string (the canonical,
   round-tripping form); reach for `style({...})` only for prop-bound / responsive-mapping values.
   ```astro
   <div class="flex gap-[24px]"> … </div>
   ```

5. **Write the page** to `src/pages/<slug>.astro` (e.g. `landing` → `src/pages/landing.astro`).
   Reject a slug that ends in `.astro` — pass the bare slug. Prefer flat `src/pages/blog.astro`
   over `src/pages/blog/index.astro` for `/blog` (both are valid Astro folder-index equivalents,
   but flat is the Meno convention); reach for `blog/index.astro` only to colocate a listing with
   a `blog/[slug].astro` detail route, and never create both (they'd both claim `/blog`).

## Key Rules

### Page Structure
Frontmatter is `const meta = {...}`; the body is wrapped in
`<BaseLayout meta={meta}>` (and the base component inside it). Runtime helpers import from
`'meno-astro'`; `BaseLayout` from `'meno-astro/components'`.
```astro
---
import { BaseLayout } from 'meno-astro/components';
import Layout from '../components/layout/Layout.astro';
import HeroSection from '../components/section/HeroSection.astro';

const meta = {
  title: "Page Title",
  description: "SEO description"
};
---
<BaseLayout meta={meta}>
  <Layout>
    <HeroSection title="..." />
  </Layout>
</BaseLayout>
```

### Text Content
Plain text is a tag's child, **NOT** a `text` attribute:
```astro
<span>Hello</span>
```
A whole-string template binding is a bare `{expr}`; a mixed string is a backtick literal:
```astro
<span>{item.title}</span>
<span>{`$${item.price}`}</span>
```

### i18n
Translatable values use `i18n({...})` with the `{ _i18n: true, en, … }` shape:
```astro
<Heading text={i18n({ _i18n: true, en: "About", pl: "O nas" })} />
```
Import `i18n` from `'meno-astro'`.

### Colors
Always use CSS variables from `src/styles/theme.css`, as static utility classes:
```astro
<div class="text-(--text) bg-(--bg)"> … </div>
```

### Styles & Responsive
Static styling is a literal utility `class="..."` string — the canonical, round-tripping form. Use
desktop-first `max-lg:` (tablet) / `max-sm:` (mobile) prefixes for responsive overrides:
```astro
<div class="text-[48px] p-[80px] max-lg:text-[36px] max-lg:p-[60px] max-sm:text-[24px] max-sm:p-[40px]"> … </div>
```
Reach for `style({ base, tablet, mobile }, __props)` only when a value is prop-bound or a mapping
(prop-driven **colors** must use `style()`, never `variants()`).

### Images
Reference assets by absolute path from `/images/`:
```astro
<img src="/images/hero.webp" alt="Description" loading="lazy" />
```

## Reference

- `/meno-astro` skill (`.claude/commands/meno-astro.md`) — dialect cheat-sheet, file skeletons, do/don't rules
- `.claude/docs/meno/meno-astro-dialect.md` — full dialect grammar (styles, i18n, props, lists, round-trip)
- `CLAUDE.md` — project layout, page/component structure, golden rules

## Example

User: `/build-page landing page with hero section and features grid`

Actions:
1. Glob `src/components/**/*.astro` — discover what exists.
2. If a `HeroCentered` and a features section already exist, read each file's
   `resolveProps(Astro, {...})` literal to learn its props, then use them.
3. Otherwise, use the `/meno-astro` skill + adv-19 example to author the missing
   Hero + Card-grid components first.
4. Wrap the page body in the base component (`Layout`, per the `Base component:` context line).
5. Write `src/pages/landing.astro`:
   ```astro
   ---
   import { BaseLayout } from 'meno-astro/components';
   import Layout from '../components/layout/Layout.astro';
   import HeroCentered from '../components/section/HeroCentered.astro';
   import FeatureIconGrid from '../components/section/FeatureIconGrid.astro';

   const meta = {
     title: "Landing",
     description: "..."
   };
   ---
   <BaseLayout meta={meta}>
     <Layout>
       <HeroCentered title="..." text="..." buttonText="Get started" />
       <FeatureIconGrid title="..." items={[
         { title: "Fast", text: "..." },
         { title: "Simple", text: "..." }
       ]} />
     </Layout>
   </BaseLayout>
   ```
