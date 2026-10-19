#!/bin/bash
# start.sh <inputTn> <log>   (env ya ziada inarithiwa: XMD_TEST_STOP_AFTER_ROUND)
cd /home/user/xmd-home/professor-xmd-company
export XMD_MILESTONES=1 XMD_TEST_HOOKS=1 XMD_TEST_MAX_AGENDAS=2 XMD_TEST_VERIFY_INPUT=/home/user/xmdtest/t27/$1.json XMD_TEST_CAPTURE_PROMPTS=/home/user/xmdtest/t27/prompts-$1.jsonl XMD_TEST_ORPHAN_STALE_MS=60000
export XMD_TEST_MAP_FORCE='[{"to":1,"roster":["optimus","ultron","vextron"],"title":"Shop page","reviewMode":"visual"},{"to":"N","roster":["optimus","ultron","vextron"],"title":"Header + layout","reviewMode":"visual"}]'
export CU_PUBLIC_URL="$(cat /home/user/xmdtest/t27/tunnelurl)"
export NODE_OPTIONS="--max-old-space-size=1100"
exec npx next start -H 0.0.0.0 -p 3100 >> $2 2>&1
