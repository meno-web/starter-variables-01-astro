# Component Extractor — Detection Catalog

Sidecar reference for the `component-extractor` agent. Lazy-load alongside
`components.md` before STEP 1.

## UI primitive catalog (closed)

Fingerprint each candidate by:
- `structuralFingerprint = (tag, child-shape-summary, attributes-shape)`
- `visualFingerprint = (backgroundColor, color, borderRadius, padding, fontWeight, border, display)`
  — drop falsy/empty values; round numerics to the nearest typical step.

Cluster nodes by `(structuralFingerprint, visualFingerprint)`. A cluster with
≥3 members is a primitive candidate — match it against the catalog. Skip
clusters that match no catalog entry.

### Button
- Signals: tag ∈ {`<a>`, `<button>`, `<div role="button">`} OR `<div>` with class containing 'btn'/'button'/'cta'; style has backgroundColor + borderRadius + padding (4–32px); display ∈ inline-block | inline-flex | flex; short text (≤6 words) ± small inline icon.
- Interface:
  - `label`: string (default = first cluster member's text)
  - `href?`: link (if any member is `<a>`)
  - `leadingIcon?` / `trailingIcon?`: embed (if any member has svg sibling)
  - **Do NOT add `variant`.** If multiple Button clusters differ only by color, keep them as separate components: `Button`, `ButtonOutline`, `ButtonGhost`. Simpler and more honest.
- Naming: first cluster → `Button`; subsequent → `ButtonOutline` (border-only), `ButtonGhost` (transparent bg), `ButtonGhostLg` (bigger).

### Badge
- Signals: small inline-block with bg + small padding (2–8px) + small text (≤3 words); tag ∈ {`<span>`, `<div>`}; no children other than text.
- Interface:
  - `label`: string
  - `tone?`: string (only if multiple Badge clusters with different colors; naming: `Badge`, `BadgeSuccess`, `BadgeWarning`)

### Input
- Signals: `<input>` with type ∈ {text, email, tel, url, number, password, search}.
- Interface:
  - `name`: string
  - `type`: string (default from cluster instances)
  - `placeholder?`: string
  - `required?`: boolean
  - `label?`: string (only if cluster's input is consistently wrapped/preceded by `<label>`)

### Checkbox
- Signals: `<input type="checkbox">`, often inside `<label>`.
- Interface:
  - `name`: string
  - `label`: string (visible label text)
  - `checked?`: boolean (default false)

### Tag
- Signals: chip shape — bg + rounded (≥12px borderRadius) + small text; often grouped (3+ in a flex row).
- Interface:
  - `label`: string
  - `closable?`: boolean (only if a close icon is consistently present)

### IconButton
- Signals: `<button>`/`<a>` with EXACTLY one child: `<svg>`, `<img>`, or icon-font `<i>`. No visible text label.
- Interface:
  - `icon`: embed | string (svg markup OR class name)
  - `href?`: link
  - `label?`: string (aria-label; default 'Action')

### Heading
- Signals: tag ∈ {`<h1>`..`<h6>`}. Cluster by (tag, fontWeight, fontSize-bucket, color, letterSpacing). Multiple visually-distinct heading styles → multiple Heading components.
- Interface:
  - `text`: string (default = first cluster member's text)
  - `as?`: string (default = cluster's tag, e.g. "h2"; lets user override semantic level without restyling)
- Naming: dominant cluster → `Heading`; others → `HeadingXl` / `HeadingLg` / `HeadingMd` / `HeadingSm` / `HeadingEyebrow` (pick by relative size).

### Text
- Signals: tag ∈ {`<p>`, `<span>`, `<div>`} whose ONLY children are text leaves; NOT a heading/button label/badge. Cluster by (fontWeight, fontSize-bucket, color, lineHeight).
- Interface:
  - `text`: string (default = first cluster member's text)
  - `as?`: string (default "p")
- Naming: dominant cluster → `Text`; others → `TextLg` / `TextSm` / `TextMuted` / `TextLead` / `TextCaption`.

> **Typography primitives ARE wanted.** Two visually-similar headings across two
> sections (HomeHero h1 + AboutHero h1) → that's a Heading cluster. Don't leave
> it inline because "it's just an `<h1>`" — centralizing type scale + color is
> the whole point so future restyles are one-file changes.

### Anything else
Not in the catalog → leave as raw nodes.

> **Confidence rule:** a primitive cluster must have ≥3 instances. With only 2,
> it's not yet a "system" — leave it inline.

## Block components (open semantic naming)

Walk each section's structure. Look for:

(a) `type: "list"` nodes — the inner children template is a block candidate.
    Unambiguous: if you find one, factor the template.

(b) Contiguous direct siblings (≥2) with the same structuralFingerprint.
    Repeating items inside a static (non-list) container.

### Naming priority

1. **Explicit aria-role / role attribute hint:**
   - `role="listitem"` inside accordion → `FAQItem`
   - `role="article"` → `BlogCard`
2. **Class hints** on candidate's root or parent:
   - 'faq', 'question' → `FAQItem`
   - 'team', 'member', 'person' → `TeamMember`
   - 'tier', 'plan', 'pricing' → `PricingTier`
   - 'step', 'process' → `ProcessStep`
   - 'testimonial', 'review', 'quote' → `Testimonial`
   - 'stat', 'metric', 'number' → `Stat`
   - 'logo', 'brand', 'client' → `BrandLogo`
   - 'card', 'tile' (with image + title) → `FeatureCard`
   - 'post', 'article', 'blog' → `BlogCard`
   - 'service', 'offering' → `ServiceCard`
3. **Tag hint:**
   - `<blockquote>` → `Testimonial`
   - `<article>` → `BlogCard`
4. **Content shape:**
   - heading + price + features list + button → `PricingTier`
   - image + name + role/title → `TeamMember`
   - big number + small label → `Stat`
   - question heading + answer paragraph → `FAQItem`
   - image + title + description (+ link) → `FeatureCard`
5. **Section-context fallback** (only if nothing above matches):
   - parent section `HomeFAQ` → `FAQItem`
   - parent section `HomeTeam` → `TeamMember`
   - parent section `HomePricing` → `PricingTier`
   - …
6. **Last resort:** `<PurposePascal>Item`, e.g. `CapabilityItem`.

Globally-named (no section prefix). On collision with a materially-different
existing component, append a numeric suffix (`FAQItem` → `FAQItem2`). Never
overwrite.

> **Confidence rule:** a block cluster needs ≥2 instances of the same shape AND
> a clear semantic name. If naming falls all the way through to (6),
> reconsider — often that's a sign you shouldn't extract.

> **Bias toward extracting.** A section with 3+ visually similar siblings
> (testimonials, brand logos, feature/value cards, pricing tiers, comparison
> rows, process steps, team members, FAQ items) IS a block cluster — extract
> it. Hesitating because "the structure is complex" or "interfaces are hard to
> infer" is the bug, not caution. The interface can always be refined later;
> an un-extracted cluster stays inline forever and bloats every section that
> hosts it.

## Interface inference (per cluster)

For each cluster, instance-diff:

- **Text leaves at the same path across all instances:** all identical → bake into structure (not a prop); differ → prop named after the role at that position (`title`, `label`, `description`, `price`, `role`, `name`, …).
- **Image src at same path:** differ → file prop (`{ type: "file", accept: "image/*", default: "" }`); identical → bake.
- **Link href at same path:** differ → link prop (`{ type: "link", default: { href: "/" } }`); identical → bake.
- **Optional fields (block components):** if some instances have a field and others don't (e.g. some `PricingTier`s have a "badge", others don't), make it optional (`{ type: "string", default: "" }`). Conditional rendering is a separate concern — for v1 just make the prop optional; user can address rendering manually.
- **Default values:** take the first instance's value.
- **Prop names:** use `website-convert.md` conventions (`title`, `subtitle`, `description`, `ctaText`, `ctaLink`, `heroImage`, …). camelCase.
