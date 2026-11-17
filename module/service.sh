#!/system/bin/sh
# Runs at late_start: waits for boot, then launches the logger daemon.

# shellcheck source=module/scripts/battery_common.sh
. "${0%/*}/scripts/battery_common.sh"

until [ "$(getprop sys.boot_completed)" = 1 ]; do
	sleep 2
done

ensure_data
start_daemon
