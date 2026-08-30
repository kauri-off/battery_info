#!/system/bin/sh
# logger.sh — background daemon that appends a battery row to the CSV on an
# interval. Config is re-read every loop so the WebUI can change the interval
# or pause logging without a reboot. Single instance enforced by an flock.

DIR="${0%/*}"
# shellcheck source=/dev/null
. "$DIR/battery_common.sh"

ensure_data

# Single-instance guard. Two properties matter, and the pidfile this replaces
# had neither: the lock lives on tmpfs so it cannot outlive a reboot, and the
# kernel drops it the moment this process dies — crash, OOM kill or power cut
# alike. A recorded pid survived both, and since Android reissues pid numbers
# at the same points in every boot, the number written by one boot's daemon
# named an unrelated task by the time the next boot's daemon checked it, which
# wedged the daemon shut for good.
#
# Everything below fails open, because the bug this replaces was a guard that
# failed closed and silently: a duplicate row is cosmetic, a daemon that
# quietly declines to start costs weeks of history. Probe the lock file in a
# subshell first — a redirection failure on `exec` would take this shell down
# with it — then treat only a definite "someone else holds it" as a reason to
# stop. Both flock builds Android ships take a file descriptor here (toybox as
# `flock [-sxun] FD`, util-linux as its `flock [options] <number>` form) and
# both exit 1 when -n cannot take the lock; a missing or unusable flock exits
# with something else, and we sample unlocked rather than not at all.
if (: >"$LOCKFILE") 2>/dev/null; then
	exec 9>"$LOCKFILE"
	flock -n 9 2>/dev/null
	[ $? -eq 1 ] && exit 0
fi

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

	# 9>&- keeps the lock fd out of the child. Without it the sleep inherits
	# the open descriptor, so killing this daemon would leave an orphaned sleep
	# holding the lock for the rest of the interval — and a restart during that
	# window would exit silently, which is the failure this lock exists to end.
	sleep "$LOG_INTERVAL" 9>&-
done
