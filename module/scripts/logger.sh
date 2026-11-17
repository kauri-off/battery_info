#!/system/bin/sh
# The logger daemon. It has no single-instance guard on purpose: every guard it
# ever had ended up refusing to start. start_daemon() does that check instead.

# shellcheck source=module/scripts/battery_common.sh
. "${0%/*}/battery_common.sh"

trap '' HUP

while :; do
	ensure_data
	load_config
	if [ "$LOG_ENABLED" = 1 ] && sample; then
		printf '%s\n' "$ROW" >>"$CSV"
	fi
	# Never spin: a sleep that cannot run at all ends the daemon instead.
	sleep "$LOG_INTERVAL" || sleep "$MIN_INTERVAL" || exit 1
done
