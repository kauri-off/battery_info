#!/system/bin/sh
# Sourced by the installer once, at install time.

# shellcheck source=module/scripts/battery_common.sh
# shellcheck disable=SC2154
. "$MODPATH/scripts/battery_common.sh"

ui_print "- Setting up Battery Info Logger"

ensure_data
load_config
ui_print "- Data dir: $DATA_DIR"

set_perm_recursive "$MODPATH" 0 0 0755 0644
set_perm_recursive "$MODPATH/scripts" 0 0 0755 0755
set_perm "$MODPATH/service.sh" 0 0 0755
set_perm "$MODPATH/action.sh" 0 0 0755
set_perm "$MODPATH/uninstall.sh" 0 0 0755

ui_print "- Logging starts after reboot (interval ${LOG_INTERVAL}s)."
ui_print "- Open the module WebUI to view charts and controls."
ui_print "- Tap the Action button to export a CSV to Download."
