#!/bin/zsh
set -eu

REPO_DIR="$(cd "$(dirname "$0")/.." && /bin/pwd -P)"
RUNTIME_DIR="$HOME/Library/Application Support/AutoRoll Keeper"
LABEL="com.autoroll.keeper"
TARGET="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"

if ! grep -Eq '^PRIVATE_KEY=0x[0-9a-fA-F]{64}$' "$REPO_DIR/.env.keeper"; then
  echo "Set a dedicated testnet PRIVATE_KEY in $REPO_DIR/.env.keeper first." >&2
  exit 78
fi

mkdir -p "$RUNTIME_DIR/scripts" "$RUNTIME_DIR/.keeper" "$HOME/Library/LaunchAgents"
chmod 600 "$REPO_DIR/.env.keeper"

# LaunchAgents are denied access to ~/Documents by macOS privacy controls.
# Install a self-contained copy in Application Support instead of granting a
# shell process broad Full Disk Access.
ditto "$REPO_DIR/src" "$RUNTIME_DIR/src"
ditto "$REPO_DIR/node_modules" "$RUNTIME_DIR/node_modules"
cp "$REPO_DIR/package.json" "$REPO_DIR/package-lock.json" "$REPO_DIR/tsconfig.json" "$RUNTIME_DIR/"
cp "$REPO_DIR/scripts/run-keeper-mac.sh" "$RUNTIME_DIR/scripts/"
cp "$REPO_DIR/.env.keeper" "$RUNTIME_DIR/.env.keeper"
chmod 600 "$RUNTIME_DIR/.env.keeper"

sed "s|__REPO_DIR__|$RUNTIME_DIR|g" "$REPO_DIR/scripts/$LABEL.plist.template" > "$TARGET"
plutil -lint "$TARGET"

launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$TARGET"
launchctl enable "$DOMAIN/$LABEL"
launchctl kickstart -k "$DOMAIN/$LABEL"

echo "AutoRoll keeper installed. Logs: $RUNTIME_DIR/.keeper/keeper.log"
