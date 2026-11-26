#!/bin/bash
set -e
SP=$1; S=20261126-034510-32fd; DIR=/Users/supreme/github/local-roleplay-studio/sessions/$S
n=0
while IFS='|' read -r tag text; do
  $SP/edit.sh $S 0 "$text" $SP/kael1-head.png qwen-image-2.1-edit
  python3 - "$DIR" "$SP/face-edits" "$tag" <<'PY'
import json,sys,shutil
d,out,tag=sys.argv[1:4]
s=json.load(open(d+'/session.json'))
p=s['frames'][0]['pictures'][0]
v=len(p['edits']); e=p['edits'][-1]
f=e.get('faces')
shutil.copy(f"{d}/{f['other']['file'] if f else e['file']}", f"{out}/{tag}-edit.png")
if f: shutil.copy(f"{d}/{e['file']}", f"{out}/{tag}-pass.png")
print(tag, 'version', v, 'seed', e['seed'], 'edit', e['timings'], 'faces', f and (f['seed'], f['timings']))
open(f"{out}/version","w").write(str(v))
PY
  curl -s -X DELETE 127.0.0.1:8787/api/sessions/$S/pictures/0/edits/$(cat $SP/face-edits/version) >/dev/null
done <<'LIST'
smile|The man is smiling warmly, his eyes crinkled.
cap|A grey woollen cap on the man's head.
cut|A fresh red cut across the man's left cheek.
LIST
