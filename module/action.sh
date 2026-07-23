#!/system/bin/sh
# action.sh — runs when the user taps the module's Action button in the KSU
# Next manager. Exports the current battery log as a timestamped CSV into the
# device's Download folder. stdout is shown to the user by the manager.

MODDIR="${0%/*}"
# shellcheck source=/dev/null
. "$MODDIR/scripts/battery_common.sh"

# Resolve a writable Download directory.
DL=/sdcard/Download
[ -d "$DL" ] || DL=/storage/emulated/0/Download
mkdir -p "$DL" 2>/dev/null

if [ ! -f "$CSV" ]; then
	echo "No log found yet at $CSV."
	echo "Enable logging in the WebUI and wait for at least one sample."
	exit 1
fi

# Header only? Then there are no samples.
lines="$(wc -l <"$CSV" 2>/dev/null)"
if [ "${lines:-0}" -le 1 ]; then
	echo "Log is empty (no samples recorded yet)."
	exit 1
fi

OUT="$DL/battery_info_$(date +%Y%m%d_%H%M%S).csv"
if cp "$CSV" "$OUT" 2>/dev/null; then
	rows=$((lines - 1))
	echo "Exported $rows samples to:"
	echo "$OUT"
else
	echo "Failed to write to $DL."
	echo "Check storage permissions and try again."
	exit 1
fi
