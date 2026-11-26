#!/bin/bash
# A camera move's face pass at 0.9 against the app's 0.96: Frame 4's low angle of Elara and Kael,
# before its pass, told the Frame's expression as a camera move is, seeds 10 and 11.
#   camera.sh <tavern Storyboard folder> <out>
set -e
cd "$(dirname "$0")"
PC=http://192.168.50.85:8188
T=$1; OUT=$2
field() { python3 -c "import json,sys;s=json.load(open(sys.argv[1]));print(eval(sys.argv[2]))" "$@"; }
export IDENTITY_Kael=$(field "$T/session.json" "[x['identity'] for x in s['look']['subjects'] if x['name']=='Kael'][0]")
export IDENTITY_Elara=$(field "$T/session.json" "[x['identity'] for x in s['look']['subjects'] if x['name']=='Elara'][0]")
X=$(field "$T/session.json" "s['frames'][3]['image']['expression']")
PIC="edit-3-c8910272.png:Elara=sheet-elara-afa75cec.png:Kael=sheet-kael-dc85e7c9.png::$X::"
{
  deno run -A passes.ts $PC "$T" "$OUT" 10,11 built 0 "$PIC"
  STRENGTH=0.9 deno run -A passes.ts $PC "$T" "$OUT" 10,11 light 0 "$PIC"
} 2>&1 | tee -a results/tavern.log
