## Comments (Pinned Review Feedback)

Comments are Figma-style **pins** the user places on the studio canvas to leave
feedback, anchored to a specific element on a page. Treat open comments as your
**task queue**: read them, fix the thing they point at, then reply / move the status.
Everything here is plain files — no API, no running server required. Pins are
authoring-only (production builds never read them), so the actual fix is always an
edit to the underlying page/component, not the pin.

### Where they live

One JSON file per pin, with the status as the top folder:

```
{projectRoot}/comments/<status>/<pageSlug>--<seq>--<titleSlug>.json
# e.g.  comments/open/blog__post--3--hero-is-too-dark.json
```

- `<status>` — the folder IS the status (see lifecycle below).
- `<pageSlug>` — the page path with `/` flattened to `__` (`blog/post` → `blog__post`).
- `<seq>` — stable per-page badge number; `<titleSlug>` — slug of the first message.

Discover work without opening files: `ls comments/open` and `ls comments/in-progress`.
The filename alone gives you the page, badge number, and gist.

### Comment shape

```jsonc
{
  "_id": "uuid",
  "_pagePath": "blog/post",          // which page the pin is on
  "_seq": 3,                          // badge number shown in the UI
  "_updatedAt": "2026-05-30T10:00:00.000Z",
  "status": "open",                   // MUST match the folder this file is in
  "anchor": {
    "nodePath": [0, 1, 2],            // child-index path into the page tree
    "nodeIdentity": { "kind": "component", "name": "Hero", "label": "Top hero" },
    "offsetXPercent": 0.5,            // pin placement only — ignore when fixing
    "offsetYPercent": 0.2
  },
  "thread": [
    { "id": "uuid", "author": { "login": "jane" }, "createdAt": "...",
      "text": "Hero is too dark", "statusChange": null }
  ]
}
```

Focus on `_pagePath`, `anchor.nodePath` / `anchor.nodeIdentity`, the `thread` text,
and `status`. Ignore the `offset*` fields (canvas placement only).

### Status lifecycle

| Status | Meaning | When you set it |
|--------|---------|-----------------|
| `open` | New, untouched feedback | (user creates it) |
| `in-progress` | You're working on it | When you start the fix |
| `ready-for-review` | You made a change; user should check | After you apply a fix |
| `resolved` | Request fully addressed | When the ask is complete |
| `closed` | Won't do / no longer relevant | When dismissing |

Only these five are valid.

### Workflow

1. **Discover** — `ls comments/open` (and `comments/in-progress`); read each file for
   the full thread text and anchor.
2. **Locate the target** — open `pages/<_pagePath>.json`. `anchor.nodePath` is the
   path of child indices from the page root. Use `nodeIdentity.name` (component name
   or HTML tag) + `label`, plus the human's message, to confirm the element. A pin can
   sit on a component instance (`kind: "component"`), so the fix may live in
   `components/<name>.json`.
3. **Fix it** — edit the page/component per the relevant docs (`core`, `components`,
   `styling`, …). The edit is what actually resolves the feedback.
4. **Close the loop** — reply and/or change status by editing the files (below). Use
   `ready-for-review` after a change you want checked, `resolved` once it's fully done.

### Closing the loop (files only)

**Change status** — two things must move together:

1. Set the `status` field in the JSON to the new value and bump `_updatedAt` (ISO).
2. Move the file into the matching folder, e.g.
   `mv comments/open/blog__post--3--hero-is-too-dark.json comments/resolved/`.

The filename does **not** change (it has no status segment). If the field and folder
ever disagree, the field wins on read — but keep them in sync; the glanceable
`ls comments/<status>` index is the whole point.

**Reply** — append one entry to `thread[]` (and bump `_updatedAt`):

```jsonc
{
  "id": "<new-uuid>",
  "author": { "login": "local" },     // CLI default; any login string is fine
  "createdAt": "2026-05-30T10:05:00.000Z",
  "text": "Darkened the hero overlay to 40%.",
  "statusChange": "ready-for-review"  // null if not changing status here
}
```

If `statusChange` is non-null, also apply the **Change status** steps above (set the
top-level `status` field + move the file). Generate `id` as a UUID; `createdAt` /
`_updatedAt` are ISO 8601.

### Rules

- Pins are studio-only — never referenced by production builds. Fixing the node is
  what addresses the feedback; the pin just tracks the conversation.
- Keep the `status` field and the containing folder in sync on every status change.
- Don't touch `offset*` or `_seq`. Don't rename the file on a status change.
- Status must be one of the five valid values.
- Creating brand-new pins from the CLI is awkward (the anchor needs real offsets from
  a rendered element) — leave new pins to the canvas UI.
