#!/usr/bin/env bash
# Install the keeper as a launchd agent so it survives sleep, logout and crash.
#
#   ops/install-keeper.sh 0xVaultAddress
#
# Uninstall with:  launchctl bootout gui/$UID/com.autoroll.keeper
set -euo pipefail

VAULT="${1:-${VAULT_ADDRESS:-}}"
[ -n "$VAULT" ] || { echo "usage: ops/install-keeper.sh 0xVaultAddress"; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -f "$ROOT/.env" ] || { echo "No .env at $ROOT — the keeper needs PRIVATE_KEY there."; exit 1; }

NPX="$(command -v npx)" || { echo "npx not on PATH"; exit 1; }
TARGET="$HOME/Library/LaunchAgents/com.autoroll.keeper.plist"
mkdir -p "$HOME/Library/LaunchAgents"

sed -e "s|__NPX__|$NPX|g" \
    -e "s|__VAULT__|$VAULT|g" \
    -e "s|__ROOT__|$ROOT|g" \
    -e "s|__PATH__|$(dirname "$NPX"):/usr/bin:/bin:/usr/sbin:/sbin|g" \
    "$ROOT/ops/com.autoroll.keeper.plist" > "$TARGET"

launchctl bootout "gui/$UID/com.autoroll.keeper" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$TARGET"
launchctl enable "gui/$UID/com.autoroll.keeper"

echo "Installed. Logs: $ROOT/ops/keeper.log"
echo "Health:  ops/keeper-health.sh"
