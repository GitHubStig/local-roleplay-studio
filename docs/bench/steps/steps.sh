#!/bin/bash
S=$(cd "$(dirname "$0")" && pwd)/out; mkdir -p "$S"
cd "$(dirname "$0")/../../.."
P=$(python3 -c "import json;print([e['prompt'] for e in json.load(open('docs/bench/art-tags/prompts/gemma4-31b.json')) if e['style']=='prose' and e['index']==9][0])")
Q=models/quantized/qwen-image-2.1-8bit-mflux0.21.0
run() { local name=$1; shift; local t0=$(date +%s)
  mflux-generate-qwen-2.1 --model $Q --base-model qwen-image-2.1 --seed 7 --width 1024 --height 1024 \
    --prompt "$P" --output $S/$name.png "$@" > $S/$name.log 2>&1
  echo "$name: exit $?, $(( $(date +%s) - t0 )) s" | tee -a $S/steps.txt; }
: > $S/steps.txt
run s40 --steps 40 --stepwise-image-output-dir $S/steps40
run s10 --steps 10 --stepwise-image-output-dir $S/steps10
for n in 15 20 25 30; do run s$n --steps $n; done
echo done >> $S/steps.txt
