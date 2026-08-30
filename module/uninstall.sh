#!/system/bin/sh
# uninstall.sh — runs when the module is removed. Stops the logger daemon.
# Logged data in /data/adb/battery_info is intentionally kept so you don't
# lose history on an update/reinstall; delete it manually to reclaim space.

# Match the daemon by identity, never by a recorded pid. Pid numbers get
# recycled, and kill(2) delivers to a task's whole thread group — signalling a
# number some unrelated process has since inherited would take that process
# down with it. The bracket keeps the pattern from matching this shell.
pkill -f "/data/adb/modules/battery_info/scripts/[l]ogger\.sh" 2>/dev/null

# Note: /data/adb/battery_info (config.sh, battery.csv) is left in place on
# purpose, as is any logger.pid an older version of this module left behind.
exit 0
