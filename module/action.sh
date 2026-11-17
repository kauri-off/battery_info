#!/system/bin/sh
# The manager's Action button: export the log to Download. stdout is shown.

# shellcheck source=module/scripts/battery_common.sh
. "${0%/*}/scripts/battery_common.sh"

export_csv
