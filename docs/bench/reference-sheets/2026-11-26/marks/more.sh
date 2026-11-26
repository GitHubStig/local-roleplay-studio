#!/bin/bash
# After run.sh: the edits' face pass at strength 0.9 against the app's 0.96 (`light`), and the
# Princess's bruise named after her expression (`bruise`), seeds 10 and 11.
#   more.sh <tavern Storyboard folder> <out> <Princess rebuild folder> <private out>
set -e
cd "$(dirname "$0")"
PC=http://192.168.50.85:8188
T=$1; OUT=$2; P=$3; POUT=$4
SEEDS=10,11
field() { python3 -c "import json,sys;s=json.load(open(sys.argv[1]));print(eval(sys.argv[2]))" "$@"; }
export IDENTITY_Kael=$(field "$T/session.json" "[x['identity'] for x in s['look']['subjects'] if x['name']=='Kael'][0]")
K=Kael=sheet-kael-dc85e7c9.png
KX=$(field "$T/session.json" "s['frames'][0]['image']['expression']")
CUT="A fresh red cut across the man's left cheek."
SMILE="The man is smiling warmly, his eyes crinkled."
CAP="A grey woollen cap on the man's head."
{
  export STRENGTH=0.9
  deno run -A passes.ts $PC "$T" "$OUT" $SEEDS light 0 "edit-0-5379db46.png:$K::$KX::$SMILE"
  deno run -A passes.ts $PC "$T" "$OUT" $SEEDS light 0 "edit-0-968a840c.png:$K::$KX::$CAP"
  deno run -A passes.ts $PC "$T" "$OUT" $SEEDS light 0 "edit-0-5273e280.png:$K::$KX::$CUT"
} 2>&1 | tee -a results/tavern.log
NAME=$(field "$P/session.json" "s['sheets'][0]['subject']")
SHEET=$(field "$P/session.json" "s['sheets'][0]['made']['file']")
export IDENTITY_$(echo "$NAME" | sed 's/[^A-Za-z0-9_]/_/g')="$(field "$P/session.json" "s['look']['subjects'][0]['identity']")"
for i in 0 3; do
  F=$(field "$P/session.json" "s['frames'][$i]['pictures'][0]['faces']['other']['file']")
  X=$(field "$P/session.json" "s['frames'][$i]['image']['expression'].rstrip('.')")
  deno run -A passes.ts $PC "$P" "$POUT" $SEEDS bruise 0 "$F:$NAME=$SHEET::$X, a dark bruise on her cheekbone::"
done >> "$POUT/princess.log" 2>&1
