# Battery Info Logger — KernelSU Next module

A KernelSU Next WebUI module that logs battery metrics over time, shows them in
an interactive dashboard, and exports the history as CSV.

Requires **KernelSU Next v3.3.0+** (WebUI and Action button support).

**[Project page](https://kauri-off.github.io/battery_info/)** ·
**[Latest release](https://github.com/kauri-off/battery_info/releases/latest)**

## What it does

- A background daemon (`service.sh` → `scripts/logger.sh`) samples the battery on
  an interval and appends a row to a persistent CSV.
- A WebUI (open it from the module in the KSU Next manager) shows live stats
  (level, current, temp, voltage, health %, cycle count, drain rate, ETA), three
  time-series charts (level, current, temperature) over 1 h to the whole log,
  and controls to pause or resume logging, change the interval, start or restart
  the daemon, clear the log, and export. Its status line says whether samples
  are actually landing, so a stopped daemon cannot read as "logging on".
- The manager's **Action** button (`action.sh`) exports the log to
  `/sdcard/Download/battery_info_<timestamp>.csv`.

## Metrics logged

`epoch, iso, capacity, status, voltage_uv, current_ua, temp_dc,
charge_counter_uah, cycle_count, health, charge_full, charge_full_design`

Read from `/sys/class/power_supply/battery` (falls back to `google_battery`, then
to another supply exposing `capacity`). Missing nodes are logged as empty fields.

The daemon only samples while the device is awake: it sleeps between samples and
does not hold a wakelock, so deep sleep shows up as gaps in the log rather than
as battery drain caused by the logger. The log grows by roughly 2 MB a month at
the default 60 s interval.

## File layout

```
module/            installable module (becomes the zip root)
  module.prop      metadata
  customize.sh     install-time setup
  service.sh       starts the logger daemon at late boot
  action.sh        exports CSV to Download (Action button)
  uninstall.sh     stops the daemon on removal
  scripts/
    battery_common.sh  shared helpers
    logger.sh          the daemon
    webui.sh           the WebUI's only entry point: state, log, config, …
  webroot/         BUILD OUTPUT — one self-contained index.html
index.html         Vite entry
src/               WebUI source (TypeScript + React)
  lib/             battery.ts (parsing, derived stats), device.ts (calls webui.sh),
                   ksu.ts (root shell bridge)
  hooks/           useBattery.ts — polling and actions
  components/      stat tiles, controls, and the shared Recharts panel
mock/              dev-only: fake KernelSU bridge + phone frame
test/              runs the module's shell scripts against a fake sysfs
docs/              GitHub Pages site + update.json (GENERATED) + CHANGELOG.md
build.mjs          vite build + icon generation + update.json + zip
.github/workflows/ ci (shellcheck/typecheck/test/build), release (tag → zip), pages
```

The WebUI is React + Recharts, styled with Tailwind, bundled by Vite into a
**single** `module/webroot/index.html` (JS and CSS inlined) — the WebView has no
asset paths to resolve.

Runtime data lives in `/data/adb/battery_info/` (`config.sh`, `battery.csv`) —
outside the module dir, so it survives module updates. `config.sh` holds two
`KEY=VALUE` lines and is parsed, never executed.

### How the WebUI talks to the device

Every call is `sh scripts/webui.sh VERB`:

| Verb | Does |
| --- | --- |
| `state` | config, daemon pids, a live sample and the newest logged row |
| `log HOURS POINTS` | the rows of the last `HOURS` (0 = all), thinned to about `POINTS` |
| `config ENABLED INTERVAL` | writes `config.sh`; enabling also starts the daemon |
| `start` / `restart` | starts the daemon if none runs / replaces it |
| `clear` / `export` | truncates the log / copies it to Download |

`log` filters and thins with `awk` on the device, so the dashboard costs the same
whether the log holds a day or a year. The last 30 minutes are never thinned:
the drain rate and ETA are measured on them.

## Build

```sh
npm install
npm run build      # -> module/webroot/index.html, module/{icon,action}.png, dist/battery_info.zip
npm run typecheck  # tsc --noEmit
npm test           # unit tests + the shell scripts against a fake sysfs
```

`npm test` runs the scripts under `sh`; set `TEST_SH` to try another shell
(`TEST_SH=mksh npm test`, `TEST_SH="busybox sh" npm test`). CI runs them under
dash, bash, mksh and busybox.

## Install

1. Copy `dist/battery_info.zip` (or the
   [latest release](https://github.com/kauri-off/battery_info/releases/latest))
   to the device.
2. KSU Next manager → **Modules** → install from storage → pick the zip.
3. Reboot. Logging starts automatically (default interval 60s).

## Auto-update

`module.prop` carries an `updateJson` pointer, so the manager checks for new
versions itself and offers an in-place update when the manifest advertises a
higher `versionCode`. Logged history lives outside the module dir, so it
survives the update.

```
updateJson=https://kauri-off.github.io/battery_info/update.json
```

`docs/update.json` is **generated by `npm run build`** from `module.prop` — the
version, the release `zipUrl`, and the changelog link all derive from it, so the
manifest can't drift from what's shipped. Don't hand-edit it; bump
`module.prop` (both `version` and `versionCode`) and rebuild. CI fails if the
committed manifest is stale.

Releasing:

1. Bump `version` / `versionCode` in `module/module.prop` and `version` in
   `package.json`, add a `docs/CHANGELOG.md` entry, `npm run build`, commit.
2. `git tag v1.2.0 && git push --tags` — the release workflow builds the zip and
   publishes it at the URL `update.json` already points to.
3. The Pages workflow redeploys `docs/`, and managers see the new version.

Push the tag together with the commit: between the two, `update.json` advertises
a zip that does not exist yet.

To point this at a different repo, change `GH_OWNER` / `GH_REPO` at the top of
`build.mjs` and the `updateJson` line in `module.prop`.

## Use

- Open the module's **WebUI** for live stats, charts, and controls.
- Changing the interval or toggling logging takes effect within one interval — no
  reboot needed (the daemon re-reads `config.sh` every loop).
- Tap the module's **Action** button (or the WebUI's *Export CSV*) to write a CSV
  into `/sdcard/Download`.

## Preview locally (no device)

```sh
npm run dev        # then open the printed URL
```

In dev, `mock/ksu-mock.ts` stands in for the KernelSU bridge — it answers the
same `webui.sh` verbs with two weeks of generated samples, and
`mock/DeviceFrame.tsx` renders the app at phone size. Both are dynamic imports
behind `import.meta.env.DEV`, so neither reaches the module zip. From the
devtools console, `__mockDaemons(0)` and `__mockDaemons(2)` show the stopped and
duplicated states.
