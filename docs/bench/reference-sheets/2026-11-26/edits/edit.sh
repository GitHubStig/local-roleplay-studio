#!/bin/bash
# Queues an edit on a Session's Frame and waits for it, printing its steps and times.
# usage: edit.sh <session> <frameIndex> <instruction> [mask.png] [model]
set -e
S=$1; I=$2; T=$3; M=$4; MODEL=$5
BODY=$(python3 - "$I" "$T" "$M" "$MODEL" <<'PY'
import json,sys,base64
i,t,m,model=sys.argv[1:5]
e={'instruction':t}
if m: e['mask']=base64.b64encode(open(m,'rb').read()).decode()
if model: e['model']=model
print(json.dumps({'kind':'edit','frameIndex':int(i),'edit':e}))
PY
)
START=$(date +%s)
ID=$(curl -s -X POST 127.0.0.1:8787/api/sessions/$S/jobs -H 'content-type: application/json' -d "$BODY" | python3 -c "import json,sys;j=json.load(sys.stdin);print(j[-1]['id'] if isinstance(j,list) else j)")
echo "job $ID"
LAST=""
while true; do
  LINE=$(curl -s 127.0.0.1:8787/api/sessions/$S/jobs | python3 -c "
import json,sys
for j in json.load(sys.stdin):
  if j['id']=='$ID':
    print(j['status'], j.get('phase'), json.dumps(j.get('faces')), j.get('error') or '', j.get('startedAt'), j.get('endedAt'))
")
  if [ "$LINE" != "$LAST" ]; then echo "$(( $(date +%s) - START ))s $LINE"; LAST=$LINE; fi
  case "$LINE" in done*|failed*) break;; esac
  sleep 2
done
