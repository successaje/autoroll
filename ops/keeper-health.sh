#!/usr/bin/env bash
# Is the keeper alive, and is the vault actually rolling?
#
# Two independent checks on purpose. The process can be up while rolling is
# broken - an exhausted gas balance looks healthy from inside the keeper.
set -uo pipefail
VAULT="${1:-0xf0802c0c94bec42ac93bc7439724df04674a7a39}"

echo "— process —"
launchctl print "gui/$UID/com.autoroll.keeper" 2>/dev/null | grep -E "state|pid|last exit" | sed 's/^/  /' \
  || echo "  not installed as a launchd agent"

echo "— keeper health endpoint —"
curl -s -m 5 http://127.0.0.1:8787/health | head -c 300 || echo "  unreachable"
echo

echo "— chain —"
curl -s -m 20 "https://shannon-explorer.somnia.network/api/v2/addresses/$VAULT/transactions" \
 | python3 -c "
import json,sys,datetime
items=json.load(sys.stdin).get('items',[])
if not items: print('  no transactions'); raise SystemExit
last=datetime.datetime.fromisoformat(items[0]['timestamp'].replace('Z','+00:00'))
mins=(datetime.datetime.now(datetime.timezone.utc)-last).total_seconds()/60
print(f'  last vault tx {mins:.0f} min ago')
print('  ROLLING' if mins < 15 else '  STALLED — nothing is driving the vault')
"
