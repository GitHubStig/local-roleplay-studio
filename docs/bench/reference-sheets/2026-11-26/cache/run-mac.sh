#!/bin/bash
# The app's face pass on this Mac's mflux, without then with the edit's step cache (bin/'s wrapper
# adds --use-step-cache when STEP_CACHE=1), on the two Frames: Kael alone at seeds 8 and 9, Elara
# and Kael at 8. Each out folder must hold the two renders first.
# usage: run-mac.sh <out folder> <file with the two picture arguments, one per line> <session folder>
cd "$(dirname "$0")"
P1=$(sed -n 1p "$2"); P2=$(sed -n 2p "$2")
for mode in off on; do
  echo "== step cache $mode"
  [ $mode = on ] && export STEP_CACHE=1
  PATH=$PWD/bin:$PATH deno run -A passes-mflux.ts "$3" "$1/mflux-$mode" 8,9 "$P1"
  PATH=$PWD/bin:$PATH deno run -A passes-mflux.ts "$3" "$1/mflux-$mode" 8 "$P2"
done
echo ALL DONE
