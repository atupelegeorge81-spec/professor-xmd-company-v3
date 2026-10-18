#!/bin/bash
# dev.sh <inputA|inputB> <log> <mapTitle>
cd /home/user/xmd-home/professor-xmd-company
export XMD_MILESTONES=1 XMD_TEST_HOOKS=1 XMD_TEST_MAX_AGENDAS=3 XMD_TEST_REVIEW_INPUT=/home/user/xmdtest/t24/$1.json XMD_TEST_CAPTURE_PROMPTS=/home/user/xmdtest/t24/prompts-$1.jsonl
exec npx next dev --turbopack -H 0.0.0.0 -p 3100 >> $2 2>&1
