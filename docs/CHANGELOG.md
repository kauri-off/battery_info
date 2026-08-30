# Changelog

## v1.1.0

Fixes a bug that could stop the logger permanently, and makes the WebUI able to
recover from it.

- **The daemon no longer wedges itself shut.** Its single-instance guard stored
  a pid in `/data/adb/battery_info/logger.pid` and treated any live `/proc/<pid>`
  as proof a logger was already running. That file outlived reboots, the check
  matched thread ids as readily as processes, and Android reissues pid numbers
  at the same points in every boot — so the number one boot's daemon recorded
  named an unrelated task by the time the next boot's daemon checked it, and the
  daemon then refused to start on every subsequent boot. Replaced with an
  `flock` on `/dev`: tmpfs, so it cannot outlive a reboot, and kernel-held, so it
  cannot outlive the process holding it.
- **Uninstall no longer signals a recycled pid.** `uninstall.sh` used to `kill`
  whatever number the pidfile held. Since `kill(2)` delivers to a task's entire
  thread group, a stale number could have taken down an unrelated process. It
  now matches the daemon by path.
- **The WebUI can start the daemon.** Previously only `service.sh` could, so a
  daemon that was not running stayed that way until the next reboot, while the
  Logging toggle still read as on. The controls now show whether the daemon is
  alive and offer Start when it is not, and enabling logging starts one.

Upgrading does not delete `logger.pid`; nothing reads it any more.

## v1.0.1

Correct author name

## v1.0.0

First public release.

- Background daemon samples the battery on a configurable interval and appends
  to a persistent CSV in `/data/adb/battery_info/`.
- WebUI dashboard: live level, current, temperature, voltage, health, cycle
  count, drain rate and ETA, plus level/current/temperature charts with a
  selectable time range.
- Controls to start/stop logging, change the interval, clear the log, and
  export — no reboot needed.
- Action button exports the log to `/sdcard/Download/battery_info_<timestamp>.csv`.
- Auto-update via `updateJson`.
