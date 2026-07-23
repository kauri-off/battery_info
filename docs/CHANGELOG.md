# Changelog

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
