#!/bin/bash
# Elara's face pass on Frame 3's render (before its pass) from a sheet with the style's lamp beside
# her (seeds 3 and 5) and from a clean one (seed 2), at seeds 10 and 11, by ../marks/passes.ts.
#   run.sh <tavern Storyboard folder> <sheets folder, from sheets.ts, with the render copied in>
set -e
cd "$(dirname "$0")/../marks"
PC=http://192.168.50.85:8188
S=$1; OUT=$2
field() { python3 -c "import json,sys;s=json.load(open(sys.argv[1]));print(eval(sys.argv[2]))" "$@"; }
export IDENTITY_Elara=$(field "$S/session.json" "[x['identity'] for x in s['look']['subjects'] if x['name']=='Elara'][0]")
X=$(field "$S/session.json" "s['frames'][2]['image']['expression']")
for n in 2 3 5; do
  deno run -A passes.ts $PC "$OUT" "$OUT" 10,11 "sheet$n" 0 "frame-2-335ef50d.png:Elara=elara-$n.png::$X::"
done 2>&1 | tee ../lamp/results/passes.log
