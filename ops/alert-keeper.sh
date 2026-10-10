#!/bin/bash
#
#  Alert when AutoRoll stops rolling.
#
#  Runs as its own launchd agent, deliberately NOT inside the keeper. An
#  alerter that lives in the process it watches reports nothing when that
#  process is the thing that died — which is precisely how an eleven-day
#  outage went unnoticed while the keeper sat there looking healthy.
#
#  The authoritative signal is the chain, not the keeper's own opinion of
#  itself: the process can be up, logging happily, and still not rolling.
#
#  Notifies on STATE CHANGE only, so a long outage is one alert and not a
#  notification every five minutes.
#
#  Optional phone push: put a topic in ~/.autoroll-alert.conf
#      NTFY_TOPIC=some-unguessable-topic-you-chose
#  then subscribe to that topic in the ntfy app. Anyone who knows the topic
#  can read it, so do not put anything sensitive in the name.
set -uo pipefail

VAULT="${VAULT_ADDRESS:-0xf0802c0c94bec42ac93bc7439724df04674a7a39}"
RPC="${RPC_URL:-https://api.infra.testnet.somnia.network/}"
EXPLORER="https://shannon-explorer.somnia.network/api/v2"
STALE_MIN="${STALE_MIN:-20}"
STATE_FILE="$HOME/.autoroll-alert.state"
CONF="$HOME/.autoroll-alert.conf"
[ -f "$CONF" ] && . "$CONF"

rpc_call() {  # $1 = hex calldata
  curl -s -m 15 -X POST "$RPC" -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_call\",\"params\":[{\"to\":\"$VAULT\",\"data\":\"$1\"},\"latest\"]}" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin).get("result","0x0"))' 2>/dev/null || echo 0x0
}

# --- is anything actually at stake? -----------------------------------------
# A vault with no open position genuinely has nothing to do, and alerting on
# that would cry wolf forever.
NEXT_HEX=$(rpc_call 0x899346c7)
NEXT=$((NEXT_HEX))
ACTIVE=0
for ((i=1; i<NEXT; i++)); do
  PADDED=$(printf '%064x' "$i")
  RES=$(rpc_call "0x99fbab88${PADDED}")
  # `active` is the 10th of eleven returned words (0-indexed 9).
  WORD=${RES:2+9*64:64}
  [ "$((16#${WORD:-0}))" = "1" ] && ACTIVE=$((ACTIVE+1))
done

# --- when did the vault last do anything? -----------------------------------
AGE_MIN=$(curl -s -m 20 "$EXPLORER/addresses/$VAULT/transactions" | python3 -c '
import json,sys,datetime
items=json.load(sys.stdin).get("items",[])
if not items: print(999999); raise SystemExit
last=datetime.datetime.fromisoformat(items[0]["timestamp"].replace("Z","+00:00"))
print(int((datetime.datetime.now(datetime.timezone.utc)-last).total_seconds()/60))
' 2>/dev/null || echo -1)

if [ "$AGE_MIN" = "-1" ]; then
  STATE="UNKNOWN"          # explorer unreachable — not evidence of anything
elif [ "$ACTIVE" -eq 0 ]; then
  STATE="IDLE"             # nothing open, nothing owed
elif [ "$AGE_MIN" -gt "$STALE_MIN" ]; then
  STATE="STALLED"
else
  STATE="ROLLING"
fi

PREV=$(cat "$STATE_FILE" 2>/dev/null || echo "")
echo "$(date '+%Y-%m-%d %H:%M:%S')  state=$STATE active=$ACTIVE last_tx=${AGE_MIN}min prev=${PREV:-none}"
[ "$STATE" = "$PREV" ] && exit 0            # nothing changed, stay quiet
[ "$STATE" = "UNKNOWN" ] && exit 0          # do not record or alert on a blind check
echo "$STATE" > "$STATE_FILE"

notify() {  # $1 title, $2 body
  osascript -e "display notification \"$2\" with title \"$1\" sound name \"Basso\"" 2>/dev/null
  [ -n "${NTFY_TOPIC:-}" ] && curl -s -m 10 -H "Title: $1" -d "$2" "https://ntfy.sh/$NTFY_TOPIC" >/dev/null
}

case "$STATE" in
  STALLED)
    notify "AutoRoll has stopped rolling" \
      "$ACTIVE open position(s), no vault activity for ${AGE_MIN} min. Check: launchctl print gui/\$UID/com.autoroll.keeper" ;;
  ROLLING)
    # Only worth saying if it had actually stopped. A first run, or a vault
    # waking from IDLE, is not a recovery.
    if [ -n "$PREV" ] && [ "$PREV" != "IDLE" ]; then
      notify "AutoRoll is rolling again" "Last vault activity ${AGE_MIN} min ago."
    fi ;;
esac

# launchd records a non-zero exit as a failure, and "nothing to report" is a
# success.
exit 0
