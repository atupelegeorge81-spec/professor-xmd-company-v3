#!/bin/bash
# gok.sh <name> <profile> — conversation ya majaribio KUPITIA KOYEB (brief + tag [xmdtest:<profile>]) → streamK<name>.sse, sid<name>
cd /home/user/xmdtest/t28
K=https://professor-xmd-professorcj-2c4d4efe.koyeb.app
date -u +%FT%T > $1from
python3 -c "import json,sys; b=json.load(open('brief.json')); b['project']=b['project']+' [xmdtest:'+sys.argv[1]+']'; json.dump(b,open('/tmp/briefK.json','w'))" $2
(curl -sN -X POST $K/api/boardroom -H 'content-type: application/json' --data @/tmp/briefK.json > stream$1.sse 2>&1 &)
for i in $(seq 1 60); do
  S=$(grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' stream$1.sse 2>/dev/null | head -1)
  [ -n "$S" ] && { echo $S > sid$1; echo $S; exit 0; }
  sleep 2
done
echo "NO SID"; head -c 500 stream$1.sse; exit 1
