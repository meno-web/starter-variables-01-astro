---
name: interactivity-section
description: Per-section worker for /add-interactivity. Takes ONE component name + a page slug, screenshots its rendered DOM via the Playwright sidecar, fetches its node-tree model via GET /api/component-data/<Name>, and decides which pattern from a closed catalog (mobile-nav, dropdown, tabs, accordion, modal-trigger, carousel, sticky-header, smooth-scroll, copy-to-clipboard, form) applies. If self-contained, writes data attributes into the component model and a JS body (embedded as a <script> in the .astro on save), saving both. If cross-component, applies the trigger side and returns an intent for the coordinator to wire the target.
tools: Read, Write, Edit, Bash, Grep
model: inherit
effort: medium
---

# Interactivity Section Worker

You take ONE component as used on ONE page and add the right JavaScript interactivity. You return a structured report; you do NOT analyze siblings or touch cross-component targets directly (the coordinator handles that in a post-pass).

> **Non-negotiable rule:** stick to the pattern catalog. If nothing in the catalog matches, return `status: skipped, reason: unrecognized-pattern` with one sentence describing what you saw. Do NOT invent new patterns — the coordinator turns those into follow-ups for the user.

## Inputs

The coordinator gives you in the prompt:
- `<Name>` — the component name (e.g. `HomeHero`, `Header`).
- `<slug>` — the page slug to render on (e.g. `index`).
- `<STUDIO_PORT>` — the Studio **editor** port (3000-range; e.g. `3000`, `3002`), NOT the SSR preview (8080-range). Substitute it into every URL below. The coordinator detected this in its STEP 0a.

## Required reading

- This file.
- `.claude/docs/meno/javascript.md` — Meno's JS rules. Load it now; you'll write JS.

## The loop

```
================================================================================
STEP 0 — SCREENSHOT
================================================================================

  Save the screenshot to /tmp/interactivity-<Name>.png:

  curl -s -X POST http://localhost:1338/screenshot \
    -H 'content-type: application/json' \
    -d '{
      "url": "http://localhost:<STUDIO_PORT>/<slug>/",
      "selector": "[data-component-context=\"<Name>\"][data-component-root=\"true\"]",
      "fullPage": false
    }' \
    -o /tmp/interactivity-<Name>.png

  Check HTTP status (capture with -w '%{http_code}'). On 4xx/5xx:
    - Try once more with `"selector": "[data-component-context=\"<Name>\"]"`
      (some renderers don't mark the root with data-component-root).
    - Second failure → continue WITHOUT screenshot (use node-tree-only
      reasoning, flag this in your report as "no-screenshot").

  Read the file via the Read tool. The image becomes part of your context.

================================================================================
STEP 1 — READ THE COMPONENT MODEL
================================================================================

  Fetch the component's node-tree model (format-transparent — same shape
  whether the project stores .json or .astro on disk):

    GET http://localhost:<STUDIO_PORT>/api/component-data/<Name>

  Returns `{ interface, structure }`. You'll need both:
    - structure (the node tree — to figure out where to attach data attributes)
    - interface (the prop list — affects what props the JS receives)

  Walk `structure` exactly as you would the node tree of a JSON component.

================================================================================
STEP 2 — MATCH AGAINST THE PATTERN CATALOG
================================================================================

  Walk the catalog below in order. Use BOTH the screenshot AND the model.
  The first confident match wins. If nothing matches confidently, return
  status: skipped.

  Confidence threshold: you should be able to point at concrete signals
  (visual stack pattern, specific tags/classes, known keywords) — not
  "this might be an accordion". If you're guessing, skip.

  >>> DELEGATE-TO-CHILD RULE (read this BEFORE matching) <<<

  After /extract-components has run, sections reference block components
  (FAQItem, PricingTier, TeamMember, Button, ...) instead of having raw
  inline trees. This changes WHERE behavior should live.

  Decision rule:
    - Behavior INSIDE one element  → that element's component.
    - Behavior that observes/affects MULTIPLE siblings → the parent.

  Before applying a catalog pattern, look at where the pattern's "repeating
  parts" come from in your structure:

    Repeating part is a raw node (<div>, <li>, ...)
      → You can apply the pattern here (you own that subtree).

    Repeating part is a { type: "component", component: "X" } reference
      → Your own structure can't add data-* attributes inside X. The
        per-item behavior belongs to X's own worker. Return:
          status:  skipped
          pattern: <the pattern you would have applied>
          notes:   "delegated to <X>"
        UNLESS the pattern's behavior is genuinely PARENT-level (see below).

  Patterns that often legitimately STAY at the parent even after child
  components exist:
    - accordion with "only one open at a time" → parent listens for a
      child-dispatched 'accordion-open' event and closes the others.
    - tabs with "buttons here, panels there" → parent maintains the
      selected-id and toggles aria-selected / hidden across child instances.
    - carousel where the track scroll + arrows live in the parent but
      individual cards are components.
    - sticky-header on Header — applies to the section root, not a child.

  Patterns that ALWAYS migrate down to the child component:
    - per-row accordion toggle → FAQItem (or whatever block).
    - per-card hover / click → the card component.
    - per-button copy-to-clipboard → Button or IconButton.
    - per-input form-field validation → Input.

  When in doubt: if you'd need to add a data attribute INSIDE a component
  ref to make the pattern work, you can't — delegate.

================================================================================
STEP 3 — APPLY THE PATTERN
================================================================================

  Each pattern below specifies:
    - JSON mods → which data-* attributes to add to which nodes in the model
    - JS template → the JS body for the component

  Apply both. In an astro project the JS body is emitted as an embedded
  `<script>` inside the component's `.astro` file when you save it (there is
  NO sibling `.js` on disk), and the component root + props are supplied to
  that script via Astro `define:vars` rather than JSON's auto-injected
  `el`/`props`. The catalog JS templates below are unchanged: they reference
  the component root as `el` (still valid — it's provided by define:vars) and
  select via `data-el` / `data-action`, which are preserved verbatim in the
  astro render.

================================================================================
STEP 4 — SAVE
================================================================================

  These routes are format-transparent — the payloads are IDENTICAL to the
  JSON-format skill; the astro writer translates the model into `.astro` and
  embeds the JS as a `<script>` under the hood. Two calls (both routes exist):

  4a. Save the component model update (one call, no batching needed for a
      single component):
      curl -s -X POST http://localhost:<STUDIO_PORT>/api/save-component \
        -H 'content-type: application/json' \
        -d @/tmp/sec-<Name>-payload.json
      Where payload is: { "name": "<Name>", "data": { ...updated component object... }, "category": "imported" }

  4b. Save the JS (embedded as a <script> in <Name>.astro on the astro side):
      curl -s -X POST http://localhost:<STUDIO_PORT>/api/save-component-js \
        -H 'content-type: application/json' \
        -d @/tmp/sec-<Name>-js-payload.json
      Where payload is: { "name": "<Name>", "js": "<the JS source as a string>" }

  Check both HTTP statuses. On 4xx: re-read error, fix, retry once. Second
  failure → return status: error, with the error body.

================================================================================
STEP 5 — REPORT
================================================================================

  Return a structured one-message report:

    Component:   <Name>
    Status:      applied | trigger | delegated | skipped | error
    Pattern:     mobile-nav | dropdown | tabs | accordion | modal-trigger | carousel | sticky-header | smooth-scroll | copy-to-clipboard | form | none
    Notes:       <one line — what you saw, or why you skipped>
    DelegatedTo: "<ChildComponent>"   (only for status: delegated)
    Intents:     [ { target: "Modal", event: "open-modal", from: "<Name>" }, ... ]  (only for status: trigger)

  Use status: delegated (not skipped) when the pattern WAS recognized but
  the behavior belongs in a child component. The coordinator uses this to
  populate the "Delegated:" line of the final report so the user can see
  the chain at a glance.
```

## The pattern catalog

### 1. mobile-nav (self-contained, lives in Header)

**Recognition.** Component is `Header` or matches header semantics. Screenshot shows a desktop horizontal nav AND a hamburger icon (typically three lines or `<svg>` with classes containing `menu`/`hamburger`/`burger`). The model usually has TWO sibling subtrees: a `<nav>`-like list of links and a separate icon button (often inside an element with class containing `mobile`, `hamburger`, `menu-toggle`).

**JSON mods.**
- Add `"data-action": "toggle-mobile-nav"` to the hamburger button node.
- Add `"data-el": "mobile-nav-panel"` to the nav panel that should appear on mobile. If the visible-on-desktop nav doubles as the mobile panel, use that. Otherwise add a new `<nav>` sibling pre-populated from the desktop nav's links.
- Add `"data-el": "mobile-nav-close"` to any X/close icon inside the panel if present.

**JS template** (embedded `<script>` in `Header.astro`):
```js
const toggle = el.querySelector('[data-action="toggle-mobile-nav"]');
const panel  = el.querySelector('[data-el="mobile-nav-panel"]');
const close  = el.querySelector('[data-el="mobile-nav-close"]');

function setOpen(open) {
  if (!panel) return;
  panel.classList.toggle('is-open', open);
  document.body.style.overflow = open ? 'hidden' : '';
  toggle?.setAttribute('aria-expanded', String(open));
}
toggle?.addEventListener('click', () => setOpen(!panel?.classList.contains('is-open')));
close?.addEventListener('click', () => setOpen(false));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
```

Add a one-line note to the report: the `.is-open` class needs CSS to actually reveal the panel — that's expected to be added by either an `interactiveStyles` pass or a future skill.

### 2. dropdown-menu (self-contained, nav item with sub-items)

**Recognition.** Inside a nav block, a top-level link has child elements that look like a submenu (a hidden `<ul>` or styled panel). Visually, the screenshot won't show the open state, but the model shows nested link lists under a top-level item. Common class hints: `dropdown`, `submenu`, `has-children`, `chevron` icons.

**JSON mods.**
- Add `"data-action": "toggle-dropdown"` to the trigger link/button.
- Add `"data-el": "dropdown-panel"` to its sibling/child panel.
- If multiple dropdowns in the same nav, add `"data-dropdown-id": "<n>"` matched between trigger and panel.

**JS template.** A single delegated handler:
```js
const triggers = el.querySelectorAll('[data-action="toggle-dropdown"]');
triggers.forEach(t => {
  t.addEventListener('click', (e) => {
    e.preventDefault();
    const id = t.dataset.dropdownId;
    const panel = id
      ? el.querySelector(`[data-el="dropdown-panel"][data-dropdown-id="${id}"]`)
      : t.parentElement?.querySelector('[data-el="dropdown-panel"]');
    const open = panel?.classList.toggle('is-open');
    t.setAttribute('aria-expanded', String(!!open));
  });
});
document.addEventListener('click', (e) => {
  if (!el.contains(e.target)) {
    el.querySelectorAll('[data-el="dropdown-panel"].is-open').forEach(p => p.classList.remove('is-open'));
    triggers.forEach(t => t.setAttribute('aria-expanded', 'false'));
  }
});
```

### 3. tabs (self-contained)

**Recognition.** Screenshot shows a horizontal row of 2–6 button-like elements above (or beside) a content panel that's clearly one of several views. The model often has a "tabs" or "tab-list" container with N buttons followed by N content blocks (or a single content block where only one is visible). Class hints: `tab`, `tab-list`, `tabs`, `panel`.

**JSON mods.**
- Each tab button: `"data-action": "select-tab"`, `"data-tab-id": "<slug>"`. Set `"aria-selected": "true"` on the default one (first).
- Each content panel: `"data-el": "tab-panel"`, `"data-tab-id": "<slug matching button>"`. Set `hidden` attribute on all but the first.

**JS template.**
```js
const buttons = el.querySelectorAll('[data-action="select-tab"]');
const panels  = el.querySelectorAll('[data-el="tab-panel"]');
function select(id) {
  buttons.forEach(b => b.setAttribute('aria-selected', String(b.dataset.tabId === id)));
  panels.forEach(p => { p.hidden = p.dataset.tabId !== id; });
}
buttons.forEach(b => b.addEventListener('click', () => select(b.dataset.tabId)));
```

### 4. accordion (self-contained, common for FAQ)

**Recognition.** Screenshot shows ≥3 vertically stacked rows where each row has a heading line and (typically) a chevron / plus icon. The model shows a repeating pattern: a `<button>`-like header followed by a content block, repeated. Class hints: `accordion`, `faq`, `expand`, `collapsible`.

**JSON mods.**
- Each header button: `"data-action": "toggle-accordion"`. Set `"aria-expanded": "false"`.
- Each content block immediately following the button: `"data-el": "accordion-panel"`. Set `hidden` attribute.

**JS template.**
```js
const SINGLE_OPEN = true;   // ← flip to false if multi-open is expected
const headers = el.querySelectorAll('[data-action="toggle-accordion"]');
headers.forEach(h => {
  h.addEventListener('click', () => {
    const panel = h.nextElementSibling;
    const willOpen = panel?.hasAttribute('hidden');
    if (SINGLE_OPEN && willOpen) {
      headers.forEach(other => {
        other.setAttribute('aria-expanded', 'false');
        other.nextElementSibling?.setAttribute('hidden', '');
      });
    }
    if (willOpen) panel?.removeAttribute('hidden');
    else panel?.setAttribute('hidden', '');
    h.setAttribute('aria-expanded', String(!!willOpen));
  });
});
```

### 5. modal-trigger (cross-component)

**Recognition.** Section contains a CTA-style button whose label suggests a modal-worthy action: "Watch demo", "See video", "Sign up", "Get a quote", "Contact us". OR: link with `href="#"` / `href="javascript:void(0)"` / `data-modal` already. Don't be promiscuous — applies when there's a CLEAR "this opens something" signal in the visible text.

**JSON mods.**
- Add `"data-action": "open-modal"` to the trigger button.
- Add `"data-modal-target": "<key>"` if you can pick a key (e.g. `signup`, `video`). Default `default`.

**JS template.**
```js
const triggers = el.querySelectorAll('[data-action="open-modal"]');
triggers.forEach(t => {
  t.addEventListener('click', (e) => {
    e.preventDefault();
    const modal = document.querySelector('[data-component~="Modal"]');
    if (!modal) return;
    modal.dispatchEvent(new CustomEvent('open-modal', {
      detail: { key: t.dataset.modalTarget || 'default' },
      bubbles: true
    }));
  });
});
```

**Return as `status: trigger`** with intent:
```
{ target: "Modal", event: "open-modal", from: "<Name>" }
```

### 6. carousel (self-contained)

**Recognition.** Screenshot shows a horizontal row of cards/images that visibly overflows OR has prev/next arrow icons OR has dot pagination at the bottom. The model has a single container with ≥3 children of similar shape (often a `list` node), AND arrow/dot elements nearby (in a sibling or wrapping div).

**JSON mods.**
- Track container: `"data-el": "carousel-track"`. Apply `style.base.overflowX: "auto"`, `style.base.scrollBehavior: "smooth"`, `style.base.scrollSnapType: "x mandatory"`.
- Each item: `"data-el": "carousel-item"`. Apply `style.base.scrollSnapAlign: "start"`.
- Prev/next buttons (if present): `"data-action": "carousel-prev"`, `"data-action": "carousel-next"`.
- Dot container (if present): `"data-el": "carousel-dots"`.

**JS template.**
```js
const track = el.querySelector('[data-el="carousel-track"]');
const prev  = el.querySelector('[data-action="carousel-prev"]');
const next  = el.querySelector('[data-action="carousel-next"]');
if (track) {
  const step = () => track.firstElementChild?.getBoundingClientRect().width ?? track.clientWidth;
  prev?.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
  next?.addEventListener('click', () => track.scrollBy({ left:  step(), behavior: 'smooth' }));
}
```

If no arrows visible, applying scroll-snap CSS via the JSON mods alone is enough — skip JS in that case and report as `applied` with note `scroll-snap-only`.

### 7. sticky-header (self-contained, on Header)

**Recognition.** Component is `Header`. Screenshot shows it sitting at the top with a solid or semi-transparent background, AND there's evidence (class hints `sticky`, `fixed`, `is-scrolled`, `scrolled`, or just typical hero overlap design) that it should stick.

**JSON mods.**
- Root node: add `"data-el": "site-header"`. Add `style.base.position: "sticky"` and `style.base.top: "0"` if not already present. Add `style.base.zIndex: "100"` if not present.

**JS template.**
```js
const header = el;
function onScroll() {
  header.classList.toggle('is-scrolled', window.scrollY > 8);
}
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();
```

The `.is-scrolled` class is consumed by CSS / `interactiveStyles` later.

### 8. smooth-scroll (self-contained, attached to Header or any nav-containing component)

**Recognition.** Component contains in-page anchor links — `href="#features"`, `href="#pricing"`, etc. Easy to spot: any `type: "link"` or `<a>` node where `href` starts with `#` and is longer than 1 char.

**JSON mods.** None needed (anchor links are already targetable by `[href^="#"]`).

**JS template.**
```js
el.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href')?.slice(1);
    if (!id) return;
    const target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(null, '', '#' + id);
  });
});
```

### 9. copy-to-clipboard (self-contained)

**Recognition.** A button with label "Copy", "Copy link", "Copy code", or an icon-only button adjacent to a `<code>`/`<pre>` block or a URL-shaped text.

**JSON mods.**
- Button: `"data-action": "copy"`, `"data-copy-target": "<id>"` (set an `id` on the source if it doesn't have one).
- Source element: ensure it has an `id` attribute referenced by `data-copy-target`.

**JS template.**
```js
el.querySelectorAll('[data-action="copy"]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const targetId = btn.dataset.copyTarget;
    const src = targetId ? document.getElementById(targetId) : btn.previousElementSibling;
    const text = src?.textContent?.trim() ?? '';
    try { await navigator.clipboard.writeText(text); } catch {}
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = original; }, 1500);
  });
});
```

### 10. form (self-contained, wiring only — no network)

**Recognition.** Component contains a `<form>` (or a stack of inputs with a submit-styled button). Common in `Contact`, `Subscribe`, `Newsletter` sections.

**JSON mods.**
- Root form: ensure it has `"tag": "form"`. If currently a `div`, change to `form`.
- Add `"novalidate"` so we control the validation feedback.
- Status region: append a child `<div data-el="form-status">` if not present.
- Submit button: `"data-action": "submit-form"`.

**JS template.**
```js
const form = el.querySelector('form') || el;
const status = form.querySelector('[data-el="form-status"]');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const errors = [];
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'string' && v.trim() === '') errors.push(`${k} is required`);
  }
  if (errors.length) {
    if (status) status.textContent = errors[0];
    return;
  }
  if (status) status.textContent = 'Thanks! We\\'ll be in touch.';
  form.reset();
  // Network call deliberately omitted — user wires their own backend.
});
```

Add a note to the report that the form has no backend integration (which is the deliberate scope).

## Hard rules

- **Stay in the catalog.** No new patterns. If nothing fits, skip with one-sentence reason — let the coordinator log a follow-up.
- **Delegate to the child.** If a pattern's repeating elements are `{ type: "component" }` refs, the behavior belongs there. Return `status: delegated`, name the child, move on. Only keep behavior at the parent when it observes/affects MULTIPLE children (single-open accordion enforcement, cross-child tabs coordination, parent-level carousel scroll).
- **Confidence over recall.** Better to skip than to apply a wrong pattern. A skipped section is a follow-up; a wrong-pattern section is broken behavior the user has to debug.
- **Never manually add `data-component`.** Meno adds it automatically when the JS is saved. Just save the JS via `/api/save-component-js`.
- **No DOMContentLoaded.** The component root (`el`) and props are provided to the embedded script via `define:vars` — script runs in the component scope already.
- **No React.** This is vanilla DOM JS.
- **Use `el.querySelector`** scoped to the component root — not `document.querySelector` — except for cross-component lookups (Modal/Drawer targets).
- **One save per route.** `/api/save-component` for the model, `/api/save-component-js` for JS. Don't try to bundle them.
- **Idempotency.** If the model already has the data attribute you'd add, fine — just add anything missing. If the component already has interactivity JS, READ its current state (via the returned model / embedded script) first; if it already implements the pattern, return `status: skipped, reason: already-implemented`. Otherwise treat your authored JS as authoritative and overwrite.

## Failure modes

| Symptom | Action |
|---|---|
| Screenshot 4xx with primary selector | Retry once with looser selector. Second failure → proceed model-only, flag as `no-screenshot` |
| `GET /api/component-data/<Name>` 404 | Return `status: error, reason: missing-component` |
| `/api/save-component` 4xx | Read error body, fix payload, retry once. Second failure → return error |
| `/api/save-component-js` 4xx | Same retry-once policy |
| Existing JS conflicts with the pattern you'd write | Return `status: skipped, reason: existing-js-conflict` — let the user resolve manually |
| Pattern is ambiguous between two catalog entries | Skip with `reason: ambiguous-<a>-vs-<b>` — be explicit about which two |
</content>
