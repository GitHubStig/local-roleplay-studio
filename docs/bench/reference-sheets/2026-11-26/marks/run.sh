#!/bin/bash
# Marks on a face, and an earlier edit's change: the face pass on the PC by ./passes.ts, seeds
# 10 and 11 (the first edits had 12 too, before the owner asked for two), built and with the
# marks sentence, and for edits with every change of the edit's line named.
#   run.sh <tavern Storyboard folder> <out> [<Princess rebuild folder> <private out>]
# The tavern is public (its log goes to results/); the Princess's isn't, so its log goes beside its
# pictures in <private out>, never into the repo.
set -e
cd "$(dirname "$0")"
PC=http://192.168.50.85:8188
T=$1; OUT=$2; P=$3; POUT=$4
SEEDS=10,11
field() { python3 -c "import json,sys;s=json.load(open(sys.argv[1]));print(eval(sys.argv[2]))" "$@"; }
export IDENTITY_Kael=$(field "$T/session.json" "[x['identity'] for x in s['look']['subjects'] if x['name']=='Kael'][0]")
export IDENTITY_Elara=$(field "$T/session.json" "[x['identity'] for x in s['look']['subjects'] if x['name']=='Elara'][0]")
K=Kael=sheet-kael-dc85e7c9.png
E=Elara=sheet-elara-afa75cec.png
KX=$(field "$T/session.json" "s['frames'][0]['image']['expression']")
EX=$(field "$T/session.json" "s['frames'][2]['image']['expression']")
CUT="A fresh red cut across the man's left cheek."
SMILE="The man is smiling warmly, his eyes crinkled."
CAP="A grey woollen cap on the man's head."
mkdir -p results
{
  # Frame 1's edits, each from the picture before its pass: the smile (made from the cut), the cap
  # (from the smile), the second cut (from the cap).
  deno run -A passes.ts $PC "$T" "$OUT" $SEEDS built 0 "edit-0-5379db46.png:$K::$KX::$SMILE"
  deno run -A passes.ts $PC "$T" "$OUT" $SEEDS marks 1 "edit-0-5379db46.png:$K::$KX::$SMILE"
  deno run -A passes.ts $PC "$T" "$OUT" $SEEDS earlier 0 "edit-0-5379db46.png:$K::$KX::$CUT $SMILE"
  deno run -A passes.ts $PC "$T" "$OUT" $SEEDS built 0 "edit-0-968a840c.png:$K::$KX::$CAP"
  deno run -A passes.ts $PC "$T" "$OUT" $SEEDS marks 1 "edit-0-968a840c.png:$K::$KX::$CAP"
  deno run -A passes.ts $PC "$T" "$OUT" $SEEDS earlier 0 "edit-0-968a840c.png:$K::$KX::$CUT $SMILE $CAP"
  deno run -A passes.ts $PC "$T" "$OUT" $SEEDS built 0 "edit-0-5273e280.png:$K::$KX::$CUT"
  deno run -A passes.ts $PC "$T" "$OUT" $SEEDS marks 1 "edit-0-5273e280.png:$K::$KX::$CUT"
  deno run -A passes.ts $PC "$T" "$OUT" $SEEDS earlier 0 "edit-0-5273e280.png:$K::$KX::$SMILE $CAP $CUT"
  # Frame 3's render, Elara's face damp from the rain (named in its expression sentence).
  deno run -A passes.ts $PC "$T" "$OUT" $SEEDS built 0 "frame-2-335ef50d.png:$E::$EX::"
  deno run -A passes.ts $PC "$T" "$OUT" $SEEDS marks 1 "frame-2-335ef50d.png:$E::$EX::"
} 2>&1 | tee -a results/tavern.log
[ -z "$P" ] && exit 0
# The Princess rebuild with sheets: her face alone on Frames 1 and 4, before their passes; her
# bruises are in her identity and each Frame's sentences, not in its expression sentence.
NAME=$(field "$P/session.json" "s['sheets'][0]['subject']")
SHEET=$(field "$P/session.json" "s['sheets'][0]['made']['file']")
export IDENTITY_$(echo "$NAME" | sed 's/[^A-Za-z0-9_]/_/g')="$(field "$P/session.json" "s['look']['subjects'][0]['identity']")"
for i in 0 3; do
  F=$(field "$P/session.json" "s['frames'][$i]['pictures'][0]['faces']['other']['file']")
  X=$(field "$P/session.json" "s['frames'][$i]['image']['expression']")
  deno run -A passes.ts $PC "$P" "$POUT" $SEEDS built 0 "$F:$NAME=$SHEET::$X::"
  deno run -A passes.ts $PC "$P" "$POUT" $SEEDS marks 1 "$F:$NAME=$SHEET::$X::"
done >> "$POUT/princess.log" 2>&1
