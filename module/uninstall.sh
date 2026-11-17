#!/system/bin/sh
# Runs when the module is removed. /data/adb/battery_info is kept on purpose.

# Matched by path, never by a recorded pid: pid numbers get recycled.
pkill -f "/data/adb/modules/battery_info/scripts/[l]ogger\.sh" 2>/dev/null
exit 0
