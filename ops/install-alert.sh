#!/bin/bash
#  Install the rolling-stopped alerter.
#
#     ops/install-alert.sh [0xVaultAddress]
#
#  Uninstall:  launchctl bootout gui/$UID/com.autoroll.alert
set -euo pipefail

VAULT="${1:-0xf0802c0c94bec42ac93bc7439724df04674a7a39}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME="$HOME/Library/Application Support/AutoRoll Keeper"
LABEL="com.autoroll.alert"
TARGET="$HOME/Library/LaunchAgents/$LABEL.plist"

# launchd agents are denied ~/Documents by macOS privacy controls, so the
# script runs from Application Support like the keeper does.
mkdir -p "$RUNTIME/scripts" "$RUNTIME/.keeper" "$HOME/Library/LaunchAgents"
cp "$REPO/ops/alert-keeper.sh" "$RUNTIME/scripts/alert-keeper.sh"
chmod +x "$RUNTIME/scripts/alert-keeper.sh"

sed -e "s|__RUNTIME_DIR__|$RUNTIME|g" -e "s|__VAULT__|$VAULT|g" \
  "$REPO/ops/com.autoroll.alert.plist.template" > "$TARGET"
plutil -lint "$TARGET" >/dev/null

launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$TARGET"
launchctl enable "gui/$UID/$LABEL"
launchctl kickstart "gui/$UID/$LABEL"

echo "Alerter installed. Checks every 5 minutes."
echo "  log:   $RUNTIME/.keeper/alert.log"
echo "  phone: add NTFY_TOPIC=<your-topic> to ~/.autoroll-alert.conf"
