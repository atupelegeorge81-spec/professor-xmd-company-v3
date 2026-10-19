#!/bin/bash
# go.sh <name> — POST /api/boardroom (brief.json) → stream<name>.sse, sid<name>, <name>from
cd /home/user/xmdtest/t27
date -u +%FT%T > $1from
(curl -sN -X POST http://127.0.0.1:3100/api/boardroom -H 'content-type: application/json' --data @brief.json > stream$1.sse 2>&1 &)
for i in $(seq 1 60); do
  S=$(grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' stream$1.sse 2>/dev/null | head -1)
  [ -n "$S" ] && { echo $S > sid$1; echo $S; exit 0; }
  sleep 2
done
echo "NO SID"; exit 1
