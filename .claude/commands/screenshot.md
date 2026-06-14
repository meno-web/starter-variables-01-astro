---
description: Capture a PNG of a Meno page (or a specific component instance / element on it) via the Playwright sidecar. Use to give yourself eyes on the current Studio render — for layout checks, regression spotting, before/after comparisons, or just to confirm what you built actually looks like what you think. Standalone, no /import-site required.
allowed-tools: Bash, Read
argument-hint: "[slug] [ComponentName] [--instance=N] [--selector=<css>] [--label=<name>] [--viewport=desktop|tablet|mobile] [--full-page=true|false]"
---

# /screenshot $ARGUMENTS

You have been asked to screenshot a page (or a region of one) rendered by the local Studio server, so you can visually inspect it.

## What to do

> **Non-interactive contract.** Never ask the user mid-run — see `.claude/docs/meno/studio-port.md`. Halt with a one-line error on unrecoverable failure; never call AskUserQuestion.

1. **Parse `$ARGUMENTS`.**
   - First positional (optional): page slug. Empty / `index` / `home` → homepage. Slug `X` → `src/pages/X.astro` → URL `/X`.
   - Second positional (optional): component name to target — e.g. `PricingSection`, `Header`, `Hero`. The SSR renderer stamps each component instance with `data-meno-component="<Name>"` and `data-meno-component-instance="<0-based-index>"` on its outermost element, so this becomes the selector `[data-meno-component="<Name>"][data-meno-component-instance="<N>"]` (or `[data-meno-component="<Name>"]` if no `--instance` given — picks the first match).
   - `--instance=N` (optional): 0-based index when the same component appears multiple times on the page. Default `0`.
   - `--selector=<css>` (optional): raw CSS selector. Overrides the component-name path. Use for non-component targets or when you need finer control. Examples: `header`, `[data-section="pricing"]`, `main > section:nth-child(2)`.
   - `--label=<name>` (optional): suffix for the output filename, useful for before/after pairs. Default derives from component name / selector or `full`.
   - `--viewport=<preset>` (optional): `desktop` (1440x900, default), `tablet` (768x1024), `mobile` (375x812). Or pass raw `--viewport=WxH`.
   - `--full-page=true|false` (optional): full-page vs viewport-only. Default `true` when no selector/component, ignored when targeting an element.
   - `--port=N` (optional): override Studio port detection. If invalid, drop and continue.

2. **Resolve Studio port + sidecar.**
   - Resolve `<STUDIO_PORT>` per `.claude/docs/meno/studio-port.md` — the **editor** server (3000-range), NOT the SSR preview. Order: explicit `--port` → `$MENO_STUDIO_PORT` → `$PORT` → lsof cwd-match in 3000–3009 + JSON health-check (`/api/page-folders` → `200 application/json`) → auto-start.
   - Playwright sidecar: `curl -s http://localhost:1338/health` — expect `{ok:true,...}`.
   - If the sidecar is down, start it via `POST http://localhost:<STUDIO_PORT>/api/playwright-server` with `{"action":"start"}`.
   - If port resolution fails after all four steps, halt with the one-line error from studio-port.md. Do NOT ask the user.

3. **Build the target URL.**
   - Homepage → `http://localhost:<STUDIO_PORT>/`
   - Slug `X` → `http://localhost:<STUDIO_PORT>/X`

4. **Build the output path.**
   - Directory: `.meno/screenshots/`. Create it if missing (`mkdir -p`).
   - Filename: `<slug-or-home>[-<label>][-<viewport-preset>].png`.
     - Example: `home-full.png`, `about-hero-desktop.png`, `pricing-table-mobile.png`.

5. **Fire the screenshot.**

   ```bash
   curl -s -X POST http://localhost:1338/screenshot \
     -H 'content-type: application/json' \
     -d '{"url":"<target-url>","viewport":{"width":<W>,"height":<H>}<,"selector":"<sel>">|<,"fullPage":<bool>>}' \
     -o .meno/screenshots/<filename>
   ```

   When a `--selector` is provided, include `"selector":"..."` and omit `"fullPage"`. Otherwise include `"fullPage":true|false`.

6. **Sanity-check the PNG.**
   ```bash
   wc -c .meno/screenshots/<filename>
   ```
   File <5KB → the screenshot likely failed (blank page, 404, JS crash, selector miss). Inspect the response body instead of pretending it worked:
   ```bash
   curl -s -X POST http://localhost:1338/screenshot -H 'content-type: application/json' -d '<same body>' | head -c 500
   ```
   Report the error and stop.

7. **Read the PNG** with the Read tool (it renders images inline). Describe what you see — layout, copy, colors, any obvious problems. Be specific; the user is relying on your eyes.

8. **Print the path** so the user can open it:
   ```
   📷 .meno/screenshots/<filename>
   ```

## Targeting a component instance

Every rendered component carries `data-meno-component="<Name>"` and `data-meno-component-instance="<0-based-index>"` on its outermost element, so the common cases are:

- `/screenshot pricing PricingSection` → first `PricingSection` on `/pricing`
- `/screenshot home Testimonial --instance=2` → the third `Testimonial` on the homepage
- `/screenshot home Header` → just the header band

For non-component targets (raw HTML elements, slot content), fall back to `--selector=<css>`:

- An element's tag: `header`, `footer`, `main`
- A `data-*` attribute the component renders: `[data-section="testimonials"]`
- A structural selector: `main > section:nth-of-type(2)`

## Edge cases

- **Selector matches nothing** — sidecar returns 500 with `Selector ... did not match anything`. For a component target, this usually means a typo in the name (component names are case-sensitive) or the wrong `--instance` index. Report and stop; don't write a fake "blank" PNG.
- **Page isn't built yet** — Studio returns 404. Report which slug is missing and stop. Don't try to create the page.
- **Viewport size out of range** — pass `width`/`height` directly: `--viewport=1920x1080`.
- **You want a series (e.g. all viewports)** — call `/screenshot` once per viewport in parallel tool calls. Don't roll a loop inside this skill.

## What you do NOT do

- You do NOT touch `src/pages/`, `src/components/`, `variables.json`, `colors.json`, or any project file. This skill is read-only against the project.
- You do NOT auto-fix anything you spot in the screenshot. Report observations; the user (or a follow-up skill) acts on them.
- You do NOT take screenshots of arbitrary external URLs — that's what `/verify-import` is for. This skill targets the local Studio render only.
