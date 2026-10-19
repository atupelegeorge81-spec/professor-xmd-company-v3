#!/bin/bash
# tl.sh <name> [n] — muhtasari wa matukio muhimu
cd /home/user/xmdtest/t26; python3 watch.py stream$1.sse 40000 | grep -E "^[0-9:]+ \[|^CHIP|^EV" | grep -v "🖥️\|⏳" | tail -${2:-10} | cut -c1-600
