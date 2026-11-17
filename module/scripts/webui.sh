#!/system/bin/sh
# The only entry point the WebUI calls: sh webui.sh VERB [ARGS].

# shellcheck source=module/scripts/battery_common.sh
. "${0%/*}/battery_common.sh"

ensure_data

case "$1" in
state)
	load_config
	printf 'config=%s,%s\n' "$LOG_ENABLED" "$LOG_INTERVAL"
	printf 'daemon=%s\n' "$(daemon_pids)"
	sample && printf 'row=%s\n' "$ROW"
	printf 'last=%s\n' "$(tail -n 1 "$CSV" 2>/dev/null)"
	;;
log)
	log_window "$2" "$3"
	;;
config)
	write_config "$2" "$3" || {
		echo "Invalid config: $2 $3" >&2
		exit 2
	}
	[ "$2" = 0 ] || start_daemon
	;;
start)
	start_daemon
	;;
restart)
	restart_daemon
	;;
clear)
	clear_log
	;;
export)
	export_csv
	;;
*)
	echo "usage: webui.sh state|log HOURS POINTS|config ENABLED INTERVAL|start|restart|clear|export" >&2
	exit 2
	;;
esac
