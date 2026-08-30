#!/system/bin/sh
# service.sh — runs at late_start (non-blocking). Waits for boot to complete,
# ensures the data dir/config/CSV exist, then launches the logger daemon.

MODDIR="${0%/*}"
# shellcheck source=/dev/null
. "$MODDIR/scripts/battery_common.sh"

# Wait for boot so date/sysfs are fully available.
while [ "$(getprop sys.boot_completed)" != "1" ]; do
	sleep 2
done

ensure_data
start_daemon
