#!/system/bin/sh
# Shared helpers, sourced by every script in the module. No side effects.
# shellcheck disable=SC2034

MODULE_DIR="${BATTERY_INFO_MODULE_DIR:-/data/adb/modules/battery_info}"
DATA_DIR="${BATTERY_INFO_DATA_DIR:-/data/adb/battery_info}"
PS_ROOT="${BATTERY_INFO_PS_ROOT:-/sys/class/power_supply}"
EXPORT_DIR="${BATTERY_INFO_EXPORT_DIR:-/sdcard/Download}"

CONFIG="$DATA_DIR/config.sh"
CSV="$DATA_DIR/battery.csv"
LOGGER="$MODULE_DIR/scripts/logger.sh"
# The brackets keep the pattern from matching a shell that carries it.
LOGGER_PATTERN="$MODULE_DIR/scripts/[l]ogger\.sh"

CSV_HEADER="epoch,iso,capacity,status,voltage_uv,current_ua,temp_dc,charge_counter_uah,cycle_count,health,charge_full,charge_full_design"

MIN_INTERVAL=5
DEFAULT_INTERVAL=60
# Rows newer than this many seconds are never thinned out of a log window.
DENSE_S=1800

is_uint() {
	case "$1" in
	'' | *[!0-9]* | 0?* | ?????????*) return 1 ;;
	esac
}

# rdv VAR FILE: first line of FILE into VAR, empty when unreadable. No forks.
rdv() {
	_rdv=
	{ IFS= read -r _rdv <"$2"; } 2>/dev/null
	eval "$1=\$_rdv"
}

# shellcheck disable=SC2154
find_ps() {
	for PS_DIR in "$PS_ROOT/battery" "$PS_ROOT/google_battery"; do
		[ -r "$PS_DIR/capacity" ] && return 0
	done
	for _want in Battery ''; do
		for PS_DIR in "$PS_ROOT"/*; do
			[ -r "$PS_DIR/capacity" ] || continue
			rdv _scope "$PS_DIR/scope"
			[ "$_scope" = Device ] && continue
			rdv _type "$PS_DIR/type"
			[ -z "$_want" ] || [ "$_type" = "$_want" ] || continue
			return 0
		done
	done
	PS_DIR=
	return 1
}

# Sets ROW to one CSV line for the current instant; missing nodes stay empty.
# shellcheck disable=SC2154
sample() {
	{ [ -n "$PS_DIR" ] && [ -r "$PS_DIR/capacity" ]; } || find_ps || return 1
	rdv _capacity "$PS_DIR/capacity"
	rdv _status "$PS_DIR/status"
	rdv _voltage "$PS_DIR/voltage_now"
	rdv _current "$PS_DIR/current_now"
	rdv _temp "$PS_DIR/temp"
	rdv _counter "$PS_DIR/charge_counter"
	rdv _cycles "$PS_DIR/cycle_count"
	rdv _health "$PS_DIR/health"
	rdv _full "$PS_DIR/charge_full"
	rdv _design "$PS_DIR/charge_full_design"
	ROW="$(date '+%s,%Y-%m-%dT%H:%M:%S%z'),$_capacity,$_status,$_voltage,$_current,$_temp,$_counter,$_cycles,$_health,$_full,$_design"
}

ensure_data() {
	[ -d "$DATA_DIR" ] || mkdir -p "$DATA_DIR"
	[ -f "$CONFIG" ] || write_config 1 "$DEFAULT_INTERVAL"
	[ -s "$CSV" ] || printf '%s\n' "$CSV_HEADER" >"$CSV"
}

# Parsed, never sourced: a broken config must not be able to kill the daemon.
load_config() {
	LOG_ENABLED=1
	LOG_INTERVAL=$DEFAULT_INTERVAL
	[ -r "$CONFIG" ] || return 0
	while IFS='=' read -r _key _value || [ -n "$_key" ]; do
		case "$_key" in
		LOG_ENABLED) [ "$_value" = 0 ] && LOG_ENABLED=0 ;;
		LOG_INTERVAL) is_uint "$_value" && LOG_INTERVAL=$_value ;;
		esac
	done <"$CONFIG"
	[ "$LOG_INTERVAL" -ge "$MIN_INTERVAL" ] || LOG_INTERVAL=$MIN_INTERVAL
}

# write_config ENABLED INTERVAL, atomically.
write_config() {
	is_uint "$2" || return 1
	_interval=$2
	[ "$_interval" -ge "$MIN_INTERVAL" ] || _interval=$MIN_INTERVAL
	_enabled=1
	[ "$1" = 0 ] && _enabled=0
	printf 'LOG_ENABLED=%s\nLOG_INTERVAL=%s\n' "$_enabled" "$_interval" >"$CONFIG.tmp" &&
		mv -f "$CONFIG.tmp" "$CONFIG"
}

daemon_pids() {
	# shellcheck disable=SC2046
	set -- $(pgrep -f "$LOGGER_PATTERN" 2>/dev/null)
	printf '%s' "$*"
}

spawn_daemon() {
	[ -f "$LOGGER" ] || return 1
	if command -v setsid >/dev/null 2>&1; then
		setsid sh "$LOGGER" </dev/null >/dev/null 2>&1 &
	else
		nohup sh "$LOGGER" </dev/null >/dev/null 2>&1 &
	fi
}

start_daemon() {
	[ -n "$(daemon_pids)" ] || spawn_daemon
}

stop_daemon() {
	pkill -f "$LOGGER_PATTERN" 2>/dev/null
	_tries=0
	while [ -n "$(daemon_pids)" ] && [ "$_tries" -lt 20 ]; do
		sleep 0.1 2>/dev/null || sleep 1
		_tries=$((_tries + 1))
	done
	[ -z "$(daemon_pids)" ] || pkill -9 -f "$LOGGER_PATTERN" 2>/dev/null
	return 0
}

restart_daemon() {
	stop_daemon
	spawn_daemon
}

pick_awk() {
	if command -v awk >/dev/null 2>&1; then
		AWK='awk'
	elif [ -x /data/adb/ksu/bin/busybox ]; then
		AWK='/data/adb/ksu/bin/busybox awk'
	elif command -v busybox >/dev/null 2>&1; then
		AWK='busybox awk'
	else
		AWK=
	fi
}

# Sets _first to the epoch of the oldest logged row, empty when there is none.
log_first() {
	_first=
	[ -r "$CSV" ] || return 0
	while IFS=, read -r _first _rest; do
		case "$_first" in
		'' | *[!0-9]*) _first= ;;
		*) return 0 ;;
		esac
	done <"$CSV"
}

# log_window HOURS POINTS: rows of the last HOURS (0 = everything), thinned to
# about POINTS, followed by #key=value metadata. See parseLog() in the WebUI.
log_window() {
	is_uint "$1" && is_uint "$2" && [ "$2" -ge 1 ] && [ "$2" -le 5000 ] || return 2
	_now=$(date +%s)
	# mksh arithmetic is 32-bit: an unbounded HOURS would overflow.
	if [ "$1" -ge 1 ] && [ "$1" -le 87600 ]; then
		_from=$((_now - $1 * 3600))
	else
		log_first
		_from=${_first:-$_now}
	fi
	_bucket=$(((_now - _from) / $2))
	[ "$_bucket" -ge 1 ] || _bucket=1
	printf '#now=%s\n#from=%s\n#bucket=%s\n#bytes=%s\n' \
		"$_now" "$_from" "$_bucket" "$(($(wc -c <"$CSV") + 0))"
	pick_awk
	# shellcheck disable=SC2086,SC2016
	[ -n "$AWK" ] && $AWK -F, -v from="$_from" -v bucket="$_bucket" -v dense="$((_now - DENSE_S))" '
		$1 !~ /^[0-9]+$/ { next }
		{ rows++ }
		$1 + 0 < from { next }
		{ total++; k = int($1 / bucket) }
		$1 + 0 >= dense || k != last { print; last = k; held = ""; next }
		{ held = $0 }
		END {
			if (held != "") print held
			printf "#rows=%d\n#total=%d\n", rows, total
		}
	' "$CSV" 2>/dev/null && return 0
	echo '#raw=1'
	cat "$CSV"
}

clear_log() {
	printf '%s\n' "$CSV_HEADER" >"$CSV"
}

# Copies the log into EXPORT_DIR; the outcome is reported on stdout.
export_csv() {
	_rows=0
	[ -f "$CSV" ] && _rows=$(($(wc -l <"$CSV") - 1))
	if [ "$_rows" -lt 1 ]; then
		echo "The log is empty: no samples recorded yet."
		return 1
	fi
	mkdir -p "$EXPORT_DIR" 2>/dev/null
	_out="$EXPORT_DIR/battery_info_$(date +%Y%m%d_%H%M%S).csv"
	if cp "$CSV" "$_out" 2>/dev/null; then
		echo "Exported $_rows samples to"
		echo "$_out"
	else
		echo "Could not write to $EXPORT_DIR."
		return 1
	fi
}
