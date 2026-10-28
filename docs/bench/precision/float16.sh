#!/bin/bash
# float16 against the default on every Image Model that takes it, with the app's flags (--low-ram), seed 7,
# 1024x1024. Runs A (default) and B (float16) in the order given (ABBA, to show drift), once for the slow ones.
# Models that aren't downloaded yet would download first: run it with them cached. Results: out/results.txt.
O=$(cd "$(dirname "$0")" && pwd)/out; mkdir -p $O
cd "$(dirname "$0")/../../.."
P=$(python3 -c "import json;print([e['prompt'] for e in json.load(open('docs/bench/art-tags/prompts/gemma4-31b.json')) if e['style']=='prose' and e['index']==9][0])")
LORA='Viggle/Qwen-Image-2.1-viggle-turbo:Qwen-Image-2.1-viggle-turbo-v0.3-6step-lora-r256.safetensors'
echo "mflux $(uv tool list | sed -n 's/^mflux v//p'), $(sysctl -n machdep.cpu.brand_string)" > $O/results.txt
# run name command order(A=default,B=float16) args...
go() { local id=$1 cmd=$2 order=$3; shift 3; local i=0
  for v in $(echo $order | fold -w1); do i=$((i+1)); local n=$id-$i-$v; local extra=()
    [ $v = B ] && extra=(--compute-precision float16)
    local t0=$(date +%s)
    /usr/bin/time -l $cmd --seed 7 --width 1024 --height 1024 --prompt "$P" --low-ram --output $O/$n.png "$@" "${extra[@]}" > $O/$n.log 2>&1; local rc=$?
    echo "$n: exit $rc, $(( $(date +%s) - t0 )) s, peak $(grep 'peak memory footprint' $O/$n.log | awk '{printf "%.1f", $1/1073741824}') GB" >> $O/results.txt
  done; }
go klein9b mflux-generate-flux2 ABBA --model mflux-community/flux2-klein-9b-mflux-bf16 --base-model flux2-klein-9b --steps 4
go zturbo mflux-generate-z-image-turbo ABBA --model mflux-community/z-image-turbo-mflux-q4 --base-model z-image-turbo --steps 9
go flux3 mflux-generate-flux3 ABBA --model mflux-community/flux-3-image-klein-mflux-bf16 --base-model flux3-image-klein --steps 16
go qturbo mflux-generate-qwen-2.1 ABBA --model qwen-image-2.1-turbo --steps 8
go viggle mflux-generate-qwen-2.1 ABBA --model qwen-image-2.1 --steps 6 --lora $LORA 1.0 --scheduler viggle_turbo
go qwen mflux-generate-qwen-2.1 AB --model qwen-image-2.1 --steps 25
go zimage mflux-generate-z-image AB --model mflux-community/z-image-base-mflux-q8 --base-model z-image --steps 30 --guidance 4
echo done >> $O/results.txt
