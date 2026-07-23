#!/system/bin/sh
# battery_common.sh — shared helpers for the Battery Info Logger module.
# Sourced by service.sh, logger.sh and action.sh. No side effects on source.

DATA_DIR=/data/adb/battery_info
CONFIG="$DATA_DIR/config.sh"
CSV="$DATA_DIR/battery.csv"
PIDFILE="$DATA_DIR/logger.pid"

CSV_HEADER="epoch,iso,capacity,status,voltage_uv,current_ua,temp_dc,charge_counter_uah,cycle_count,health,charge_full,charge_full_design"

# Read a sysfs node, print empty string if missing/unreadable.
rd() { cat "$1" 2>/dev/null | tr -d '\r\n'; }

# Detect the power-supply directory. Pixels expose google_battery; most
# devices expose battery. Prefer whichever has a capacity node.
find_ps() {
	for p in /sys/class/power_supply/battery /sys/class/power_supply/google_battery; do
		if [ -r "$p/capacity" ]; then
			echo "$p"
			return 0
		fi
	done
	# Fallback: first power_supply dir that has a capacity node.
	for p in /sys/class/power_supply/*; do
		if [ -r "$p/capacity" ]; then
			echo "$p"
			return 0
		fi
	done
	return 1
}

# Emit one CSV row for the current instant. Missing nodes become empty fields.
read_row() {
	ps="$(find_ps)" || return 1
	epoch="$(date +%s)"
	iso="$(date +%Y-%m-%dT%H:%M:%S%z)"
	capacity="$(rd "$ps/capacity")"
	status="$(rd "$ps/status")"
	voltage="$(rd "$ps/voltage_now")"
	current="$(rd "$ps/current_now")"
	temp="$(rd "$ps/temp")"
	charge_counter="$(rd "$ps/charge_counter")"
	cycle_count="$(rd "$ps/cycle_count")"
	health="$(rd "$ps/health")"
	charge_full="$(rd "$ps/charge_full")"
	charge_full_design="$(rd "$ps/charge_full_design")"
	printf '%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s\n' \
		"$epoch" "$iso" "$capacity" "$status" "$voltage" "$current" \
		"$temp" "$charge_counter" "$cycle_count" "$health" \
		"$charge_full" "$charge_full_design"
}

# Ensure the data dir, default config and CSV header exist.
ensure_data() {
	mkdir -p "$DATA_DIR"
	if [ ! -f "$CONFIG" ]; then
		printf 'LOG_ENABLED=1\nLOG_INTERVAL=60\n' >"$CONFIG"
	fi
	if [ ! -f "$CSV" ]; then
		printf '%s\n' "$CSV_HEADER" >"$CSV"
	fi
}
