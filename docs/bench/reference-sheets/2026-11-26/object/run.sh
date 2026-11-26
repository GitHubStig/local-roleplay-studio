#!/bin/bash
# The lantern's face pass on each Frame's render before its pass, the lantern only, as built
# (`face.md`) and with an instruction for a thing (`../marks/passes.ts`, marks 3), seeds 10 and 11.
#   run.sh <the lantern Storyboard's folder> <out>
set -e
cd "$(dirname "$0")/../marks"
PC=http://192.168.50.85:8188
S=$1; OUT=$2
field() { python3 -c "import json,sys;s=json.load(open(sys.argv[1]));print(eval(sys.argv[2]))" "$@"; }
export IDENTITY_the_Lantern_of_Vael=$(field "$S/session.json" "[x['identity'] for x in s['look']['subjects'] if x['name']=='the Lantern of Vael'][0]")
L="the Lantern of Vael=$(field "$S/session.json" "[x['made']['file'] for x in s['sheets'] if x['subject']=='the Lantern of Vael'][0]")"
for i in 0 1 2; do
  F=$(field "$S/session.json" "s['frames'][$i]['pictures'][0]['faces']['other']['file']")
  X=$(field "$S/session.json" "s['frames'][$i]['image']['expression']")
  deno run -A passes.ts $PC "$S" "$OUT" 10,11 built 0 "$F:$L::$X::"
  deno run -A passes.ts $PC "$S" "$OUT" 10,11 thing 3 "$F:$L::$X::"
done 2>&1 | tee ../object/results/passes.log
