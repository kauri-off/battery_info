#!/system/bin/sh
# logger.sh — background daemon that appends a battery row to the CSV on an
# interval. Config is re-read every loop so the WebUI can change the interval
# or pause logging without a reboot.
#
# There is deliberately no single-instance guard in here. Every version of this
# daemon that failed to log did so because a guard misread its own bookkeeping
# and exited — a pid that had been recycled, then an flock that could not work
# at all under mksh. A duplicate row is cosmetic; a daemon that quietly
# declines to start costs weeks of history. The check for an existing instance
# lives in start_daemon(), the only thing that spawns this script, where a
# wrong answer costs a duplicate instead of silence.

DIR="${0%/*}"
# shellcheck source=/dev/null
. "$DIR/battery_common.sh"

ensure_data

while true; do
	# Defaults in case config is missing/partial.
	LOG_ENABLED=1
	LOG_INTERVAL=60
	# shellcheck source=/dev/null
	[ -f "$CONFIG" ] && . "$CONFIG"

	case "$LOG_INTERVAL" in
	'' | *[!0-9]*) LOG_INTERVAL=60 ;;
	esac
	[ "$LOG_INTERVAL" -lt 5 ] && LOG_INTERVAL=5

	if [ "$LOG_ENABLED" = "1" ]; then
		row="$(read_row)" && [ -n "$row" ] && printf '%s\n' "$row" >>"$CSV"
	fi

	sleep "$LOG_INTERVAL"
done
