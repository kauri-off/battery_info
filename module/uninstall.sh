#!/system/bin/sh
# uninstall.sh — runs when the module is removed. Stops the logger daemon.
# Logged data in /data/adb/battery_info is intentionally kept so you don't
# lose history on an update/reinstall; delete it manually to reclaim space.

DATA_DIR=/data/adb/battery_info
PIDFILE="$DATA_DIR/logger.pid"

if [ -f "$PIDFILE" ]; then
	pid="$(cat "$PIDFILE" 2>/dev/null)"
	[ -n "$pid" ] && kill "$pid" 2>/dev/null
	rm -f "$PIDFILE"
fi

# Note: $DATA_DIR (config.sh, battery.csv) is left in place on purpose.
