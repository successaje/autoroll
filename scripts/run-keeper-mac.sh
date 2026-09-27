#!/bin/zsh
set -eu

REPO_DIR="$(cd "$(dirname "$0")/.." && /bin/pwd -P)"
cd "$REPO_DIR"
mkdir -p .keeper

if ! grep -Eq '^PRIVATE_KEY=0x[0-9a-fA-F]{64}$' .env.keeper; then
  echo "PRIVATE_KEY is missing or invalid in $REPO_DIR/.env.keeper" >&2
  exit 78
fi

set -a
source .env.keeper
set +a

LOCK_DIR="$REPO_DIR/.keeper/active.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  LOCK_PID="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
  if [[ "$LOCK_PID" == <-> ]] && kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "another AutoRoll keeper is running as pid $LOCK_PID" >&2
    exit 75
  fi
  # launchd may SIGKILL a process during an upgrade before EXIT traps run.
  # Reclaim only a lock whose recorded process no longer exists.
  rm -f "$LOCK_DIR/pid"
  rmdir "$LOCK_DIR"
  mkdir "$LOCK_DIR"
fi
echo $$ > "$LOCK_DIR/pid"
trap 'rm -f "$LOCK_DIR/pid"; rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT INT TERM

# -i prevents idle system sleep while the keeper is active. Closing a laptop lid
# still sleeps macOS, so keep it plugged in and open during the showcase window.
/usr/bin/caffeinate -i npm run keeper:hosted
