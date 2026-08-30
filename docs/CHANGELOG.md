# Changelog

## v1.1.1

Fixes v1.1.0, whose lock could not work on Android and stopped the daemon from
starting at all.

`logger.sh` took an `flock` on a descriptor opened with `exec 9>`. Android's
`sh` is mksh, which sets close-on-exec on descriptors opened that way, so the
`flock` binary — a separate process — never received fd 9 and failed with
`EBADF`. toybox reports that as exit 1, the very code it uses for "another
process holds the lock", so the guard concluded a logger was already running
and exited.

The lock is gone. `logger.sh` now has no single-instance guard of any kind; the
check for an existing instance lives in `start_daemon()`, the only thing that
spawns it, where a wrong answer costs a duplicate row rather than silence.

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
