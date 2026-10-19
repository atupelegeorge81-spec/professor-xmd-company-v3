#!/bin/bash
# cleanall.sh <sid> <fromISO> <toISO> — futa data yote ya session ya majaribio (bucket ya dirisha, cu_files, rows, session)
cd /home/user/xmdtest
F=$(node t25/listbucket.mjs "$2" "$3" | awk '{print $1}' | paste -sd,)
echo "bucket: $(echo $F | tr ',' '\n' | grep -c .)"
node cleanstore.mjs "$1" "$F" --go | cut -c1-200
node clean.mjs "$1" --go
