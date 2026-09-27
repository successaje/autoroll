#!/bin/zsh
set -u

REPO_DIR="$(cd "$(dirname "$0")/.." && /bin/pwd -P)"
RUNTIME_DIR="$HOME/Library/Application Support/AutoRoll Keeper"
LABEL="com.autoroll.keeper"
DOMAIN="gui/$(id -u)"

echo "launchd"
if SERVICE_STATE="$(launchctl print "$DOMAIN/$LABEL" 2>/dev/null)"; then
  echo "$SERVICE_STATE" | sed -n '1,35p'
else
  echo "  not installed"
fi
echo
echo "health"
curl --max-time 3 --silent --show-error http://127.0.0.1:8080/health || echo "  unavailable"
echo
echo "recent logs"
tail -n 20 "$RUNTIME_DIR/.keeper/keeper.log" 2>/dev/null || echo "  no logs yet"
tail -n 10 "$RUNTIME_DIR/.keeper/keeper.error.log" 2>/dev/null || true
