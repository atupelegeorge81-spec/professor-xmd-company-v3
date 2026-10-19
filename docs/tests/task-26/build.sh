#!/bin/bash
# build.sh — production build ya muda (config ya XMDTEST-TEMP inarudishwa mwishoni)
cd /home/user/xmd-home/professor-xmd-company
NODE_OPTIONS=--max-old-space-size=2048 NEXT_TELEMETRY_DISABLED=1 npx next build > /home/user/xmdtest/t26/build.log 2>&1; rc=$?
cp /home/user/xmdtest/t26/next.config.orig.mjs next.config.mjs
echo EXIT $rc >> /home/user/xmdtest/t26/build.log
