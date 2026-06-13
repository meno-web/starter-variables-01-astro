# Resolving the Studio dev-server port

Every Meno skill that talks to the Studio dev server (screenshot, save-page, save-component, /api/...) must first resolve which port the Studio **editor** server is on. The editor server hosts every Studio write route (`/api/save-*`, `/api/page-outline`, `/api/auto-split`, `/api/page-folders`, ...) — distinct from the SSR preview server that the Electron app also runs.

**Two servers per project, both bound by the same `bun` PID:**

- **Editor server (the one this doc resolves)** — defaults to **3000**, climbs to 3001, 3002, … when multiple projects are open. Reads `$PORT`. Hosts every Studio write route.
- **SSR preview server** — defaults to **8080**, climbs to 8081, 8082, …. Reads `$MENO_SERVE_PORT`. Renders pages on demand. Shares the read-only `/api/pages`, `/api/components`, `/api/colors`, `/api/enums` etc. with the editor (both inherit them from meno-core), but **none of the studio write routes** are wired here — every unknown `/api/...` falls through to a `200 text/html` SPA shell. A naive "did port respond 2xx?" health check will lock onto this server and skills will silently get HTML back for POSTs that should be JSON. The discriminator below probes a Studio-only GET and requires `application/json`.

> **Always use `http://localhost:PORT/`, never `http://127.0.0.1:PORT/`.**
> The Studio binds to `hostname: 'localhost'` (httpServer.ts), which on macOS with modern Bun resolves to IPv6 (`::1`) — so `127.0.0.1` (IPv4) gets `Connection refused` even though the server is healthy. Browsers paper over this with happy-eyeballs; `curl` does not. Every URL in this file, in agent scripts, in skill commands MUST use `localhost`.

## Non-interactive contract (applies to every skill that uses this doc)

These skills NEVER ask the user mid-run.
- Never call `AskUserQuestion`.
- Never write "let me know when …", "should I proceed?", "do you want me to …".
- Validation/setup failures halt with a one-line error. Mid-flight uncertainty becomes a line in the final report.
- The user invoked the skill — that IS the consent.

## Detection sequence (first hit wins)

1. **Explicit `--port=N`** in the user's invocation. If present and `1024 ≤ N ≤ 65535`, use it. If invalid, drop and continue to step 2 — do NOT halt.

2. **`$MENO_STUDIO_PORT` env var.** The Electron app's terminal pane injects this when it spawns the pty for a project (see `electron-app/main/terminal.js:buildShellEnv`), so for any skill running inside the in-app terminal this resolves the port without any probing. If set and `1024 ≤ N ≤ 65535`, use it.

3. **`$PORT` env var.** Fallback for shells launched outside the Electron app. If set, use it as-is. (Note: `$MENO_SSR_PORT` / `$MENO_SERVE_PORT` point at the SSR preview server, not the editor — do NOT substitute either here.)

4. **lsof cwd-match + Studio-only health-check.** Scan **3000–3009** (the editor range). For each listening process whose cwd equals the current working directory, verify it's the editor server — not the SSR preview, not a stale process that still holds the port — by hitting a Studio-only GET endpoint and requiring an `application/json` response:

   ```bash
   STUDIO_PORT=""
   STALE_PORTS=""
   for p in 3000 3001 3002 3003 3004 3005 3006 3007 3008 3009; do
     pid=$(lsof -ti :$p -sTCP:LISTEN 2>/dev/null | head -1)
     [ -z "$pid" ] && continue
     cwd=$(lsof -a -p $pid -d cwd -Fn 2>/dev/null \
           | awk '/^n/{ sub(/^n/,""); print }' | tail -1)
     [ "$cwd" = "$(pwd)" ] || continue
     # /api/page-folders is a Studio-only GET: only the editor returns 200 JSON.
     # The SSR preview returns 404 JSON (newer cores) or a 200 HTML SPA shell
     # (older cores) — both fail this check, which is what keeps skills from
     # binding to the preview server by mistake. Require BOTH status==200 and
     # an application/json content-type to lock onto the editor.
     probe=$(curl -s -o /dev/null -w '%{http_code} %{content_type}' --max-time 2 \
             http://localhost:$p/api/page-folders 2>/dev/null)
     case "$probe" in
       "200 application/json"*) STUDIO_PORT=$p; break ;;
       *)                       STALE_PORTS="$STALE_PORTS $p:pid$pid" ;;
     esac
   done
   ```

   If `$STALE_PORTS` is non-empty, mention it in the final report so the user can clean up. SSR-preview ports (8080-range) are expected to fail this check — that's the whole point — so do NOT widen the scan to include them.

5. **Auto-start.** No live server matches the cwd. Read `package.json` `scripts.dev` (typical values: `meno dev` for user projects, `bun run --filter @meno/studio dev` for the editor monorepo). Spawn in the background and poll for up to 30s until a Studio port appears for the new PID.

   ```bash
   nohup bash -c "$(jq -r '.scripts.dev' package.json)" \
     > /tmp/meno-dev-$$.log 2>&1 &
   echo $! > /tmp/meno-dev-$$.pid
   # then poll lsof -aP -p $(cat /tmp/meno-dev-$$.pid) -iTCP -sTCP:LISTEN -Fn
   ```

   On timeout, tail the log file in the halt message so the user can see the startup error.

## After resolution

- Substitute the resolved port into every `http://localhost:<STUDIO_PORT>/...` URL.
- Pass it through to sub-agents in their prompt (e.g. `"Studio port: 8082."`).
- The Playwright sidecar is always on **1338** (single per-machine, not per-project — do NOT vary it).

## Failure modes

| Symptom | Action |
|---|---|
| All five steps fail to produce a port | Halt with a one-line message naming the spawn log path. Do NOT ask. |
| Explicit `--port=N` was given but unreachable | Halt; do NOT auto-start (the user picked that port deliberately). |
| `$MENO_STUDIO_PORT` set but unreachable | Drop it and continue to step 3 — the Electron app may have torn down the bun server (project closed) without clearing the pty env. Do NOT halt. |
| Multiple editor ports are live with matching cwd | Use the first match (lowest port) that passes the JSON health check; flag the others in the final report. |
| Only an SSR-preview port (8080-range) responds for the cwd | The editor server isn't running for this project. Halt with: "Editor server not found for $(pwd) — open the project in the Electron app, or run `meno dev`." Do NOT fall back to the SSR port. |
| `lsof` not installed | Skip step 4 and go straight to auto-start (step 5). |
