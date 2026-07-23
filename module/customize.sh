#!/system/bin/sh
# customize.sh — runs once at install time in the KSU Next installer. Sets up
# the persistent data dir and default config, and fixes script permissions.

# shellcheck source=/dev/null
. "$MODPATH/scripts/battery_common.sh"

ui_print "- Setting up Battery Info Logger"

ensure_data
ui_print "- Data dir: $DATA_DIR"

# Make module scripts executable.
set_perm_recursive "$MODPATH" 0 0 0755 0644
set_perm_recursive "$MODPATH/scripts" 0 0 0755 0755
set_perm "$MODPATH/service.sh" 0 0 0755
set_perm "$MODPATH/action.sh" 0 0 0755
set_perm "$MODPATH/uninstall.sh" 0 0 0755

ui_print "- Logging starts after reboot (interval 60s)."
ui_print "- Open the module WebUI to view charts and controls."
ui_print "- Tap the Action button to export a CSV to Download."
