#!/system/bin/sh
# logger.sh — background daemon that appends a battery row to the CSV on an
# interval. Config is re-read every loop so the WebUI can change the interval
# or pause logging without a reboot. Single-instance via PIDFILE.

DIR="${0%/*}"
# shellcheck source=/dev/null
. "$DIR/battery_common.sh"

ensure_data

# Single-instance guard: if a live logger is already running, exit.
if [ -f "$PIDFILE" ]; then
	oldpid="$(cat "$PIDFILE" 2>/dev/null)"
	if [ -n "$oldpid" ] && [ -d "/proc/$oldpid" ]; then
		exit 0
	fi
fi
echo "$$" >"$PIDFILE"

# Clean up the pidfile if we own it on exit.
trap 'rm -f "$PIDFILE"' EXIT INT TERM

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
