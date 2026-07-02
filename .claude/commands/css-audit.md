---
description: Read-only audit of a Webflow-imported project's mirror stylesheet. Parses the monolith, re-unites responsive variants, and reports the proposed base/vendor/webflow-auto/shared/section split plus flags (cross-boundary selectors, dead classes, typo folds) — a componentization plan. Never rewrites anything. Backed by GET /api/css-audit.
allowed-tools: Bash, Read
argument-hint: "[--css=<path>] [--sharedMinPages=N] [--minSectionClasses=N] [--port=N]"
---

# /css-audit $ARGUMENTS

Run the read-only CSS ownership audit on the project's mirror stylesheet and report a
componentization plan: which class clusters map to components, what's shared design-system vs
section-local, and which selectors/classes need judgment before a split. **Analysis only — it never
moves or rewrites a byte.** Backed by `GET /api/css-audit` (meno-core), the deterministic first step
of de-mirroring.

> **Non-interactive contract.** Never ask the user questions during this skill — see `.claude/docs/meno/studio-port.md`. Validation halts with a one-line error; uncertainty becomes a line in the final report.

> **Read-only.** The audit parses the Webflow-exported CSS into an AST, re-unites each selector with
> the responsive variants Webflow pools at the end of the file, cross-references every class against
> the page DOM, and proposes buckets. It changes nothing on disk.

## When to use

After a website/Webflow import, **before** componentizing — to see the map: which section buckets
become components (`team` → TeamCard, `case` → CaseStatusCard, …), which classes are the shared
design system (Heading/Text/Button), and where the edge cases are. Re-runnable anytime; safe. Pairs
with `/split-page`, `/split-node`, `/convert-children-to-components` (the carving steps this plan feeds).

## What to do

1. **Parse `$ARGUMENTS`** (all optional; drop any malformed flag, don't halt):
   - `--css=<relative path>` — audit a specific stylesheet (default: auto-detect `public/_mirror/css/*.css`).
   - `--sharedMinPages=N` — page-usage threshold above which a class is "shared" rather than section-local.
   - `--minSectionClasses=N` — min classes for a section to keep its own bucket (smaller folds into `misc`).
   - `--port=N`.

2. **Resolve the Studio port** per `.claude/docs/meno/studio-port.md`. Substitute `<STUDIO_PORT>` below.

3. **GET the audit as JSON** (to reason over). Build the query from the parsed flags:

   ```bash
   Q=""
   [ -n "$CSS" ]     && Q="${Q}&css=${CSS}"
   [ -n "$SHARED" ]  && Q="${Q}&sharedMinPages=${SHARED}"
   [ -n "$MINSEC" ]  && Q="${Q}&minSectionClasses=${MINSEC}"
   curl -s "http://localhost:<STUDIO_PORT>/api/css-audit?${Q#&}" | jq .
   ```

   Handle the two non-report responses and **stop**:
   - **404 JSON `{"error":"No mirror stylesheet found", ...}`** → this project has no Webflow mirror
     CSS to audit (not a website-import, or the sheet was removed). Report that and stop.
   - **Not JSON (an HTML/SPA shell), or route unknown** → the running Studio's meno-core predates
     this endpoint. Report "meno-core needs updating to include /api/css-audit" and stop.

4. **(Optional) Fetch the human-readable dump** for reference — same flags plus `&format=md`:

   ```bash
   curl -s "http://localhost:<STUDIO_PORT>/api/css-audit?format=md&${Q#&}"
   ```

5. **Interpret the JSON and report** — this is the point of the skill. Do **not** rewrite anything.
   From the response, produce a one-screen plan:

   - **Sheet** — `source.bytes`, `source.rules`, `source.pageCount`, `breakpoints`. List `cssFiles`
     that were audited; if there's more than one and any looks like a vendor bundle
     (`swiper` / `plyr` / `splide` / `normalize` / `bundle`), say so and suggest re-running with
     `--css=<the main *.webflow.*.css sheet>` for a clean view.
   - **Split** — sizes of `buckets.base`, `buckets.vendor`, `buckets.webflowAuto`, `buckets.shared`,
     and the count of real sections (`Object.keys(buckets.sections)` minus `misc`) + the `misc` size.
   - **Component worklist** — the real section buckets, largest first (`buckets.sections`, excluding
     `misc`), with class counts. These are the candidate components; suggest a name per bucket
     (`team` → TeamCard, `case` → CaseStatusCard, `career` → CareerCard). Also note the `shared`
     bucket → the atomic components (Heading / Text / Button).
   - **Judgment surface (needs a human/AI decision before splitting)** — from `flags`:
     `crossBoundarySelectors` (N; show 3–5, e.g. `.label.is-about-tab → is + label`),
     `fuzzyMiddle` (N; borderline shared/local), `misc` size, and any `foldedSections` typo merges.
   - **Safe cleanup** — `flags.deadClasses` (count + a few) are defined but unused on any page →
     droppable on split.
   - **Already migrated / external** — `flags.pageOnlyClasses` (count) are used in markup but not in
     this sheet (Meno utilities or another stylesheet).
   - **Next step** — recommend the top 3–5 sections to carve first (via `/split-page` /
     `/split-node` / `/convert-children-to-components`), resolving the cross-boundary combos and
     deciding the `misc` orphans as you go.

6. **Stop.** Never rewrite files, never kick off componentization, never ask the user what to do
   next — end with the report.

## Report shape

```
✅ Sheet:        <KB>, <rules> rules, <pages> pages, <N> breakpoints
                 audited: <cssFiles>   (⚠ vendor bundle mixed in → re-run with --css=… )
✅ Split:        base <KB> · vendor <KB> · webflow-auto <n cls> · shared <n cls>/<KB>
                 REAL SECTIONS: <N>   misc: <n cls>/<KB>
✅ Components:   team(30)→TeamCard  case(31)→CaseStatusCard  career(14)→CareerCard  …
                 shared → Heading / Text / Button
⚠ Judgment:     cross-boundary <N> (e.g. …) · fuzzy-middle <N> · misc <N> · typo folds <list>
🧹 Dead:         <N> classes droppable (e.g. …)
↔ External:      <N> page-only classes (Meno utilities / other sheets)
▶ Next:          carve <Section1>, <Section2>, <Section3> first (/split-page, /split-node)
```
