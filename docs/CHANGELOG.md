# Changelog

## v1.2.0

The WebUI no longer slows down as the log grows, and the daemon can no longer be
killed by its own config file.

- **The dashboard reads a window, not the file.** It used to pull the entire
  CSV through the root shell every 30 seconds and draw every row; after a few
  months that is megabytes per refresh and tens of thousands of points per
  chart. The device now returns only the selected range, thinned to what a
  chart can show, so a refresh costs the same on day one and day five hundred.
  Export still writes the full log.
- **A broken `config.sh` cannot stop the logger.** The daemon used to source
  the file, so a syntax error in a hand-edited config ended it silently. The
  config is now parsed, never executed.
- **Rate and ETA no longer jump right after plugging in or unplugging.** They
  are withheld for the first five minutes of a session instead of being
  extrapolated from a few seconds, and are measured from the charge counter
  when the device has one, which resolves far below the 1% steps of the level.
- **One status line says whether samples are landing**: recording (with the age
  of the last sample), paused, not running, or running twice, with a button to
  start or restart the daemon. The logging switch and the interval apply at
  once; there is no separate Apply.
- **Charts keep their time axis honest.** The axis covers the selected range up
  to now, so a pause in logging shows as a gap instead of being cropped away,
  and multi-day ranges label days. Day and half-day ticks did not fall on
  local midnight outside UTC; they do now. New 7-day range.
- **Errors stay on screen.** A failed export or clear was erased by the next
  successful poll three seconds later, and an empty-log export reported a raw
  exit code. Failed reads of the log or the config were shown as an empty log
  and default settings; they are reported now.
- Polling stops while the WebUI is in the background.
- A peripheral's battery (stylus, headset) is no longer picked as the phone's
  on devices without a `battery` supply.

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
