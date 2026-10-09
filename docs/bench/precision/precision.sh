#!/bin/bash
# mflux 0.22: --compute-precision float16 and --low-ram against the default, on the app's renders, and whether
# the saved 8-bit copy still beats -q 8 from the original weights now that mflux 0.22 loads lazily.
S=$(cd "$(dirname "$0")" && pwd)/out; mkdir -p "$S"
cd "$(dirname "$0")/../../.."
P=$(python3 -c "import json;print([e['prompt'] for e in json.load(open('docs/bench/art-tags/prompts/gemma4-31b.json')) if e['style']=='prose' and e['index']==9][0])")
V=$(uv tool list | sed -n 's/^mflux v//p')
Q=models/quantized/qwen-image-2.1-8bit-mflux$V
LORA='Viggle/Qwen-Image-2.1-viggle-turbo:Qwen-Image-2.1-viggle-turbo-v0.3-6step-lora-r256.safetensors'
F16=(--compute-precision float16)
# Time and peak memory footprint (unified memory, so it counts the GPU's too) of one command.
run() { local name=$1; shift; local t0=$(date +%s)
  /usr/bin/time -l "$@" > $S/$name.log 2>&1; local rc=$?
  local peak=$(grep 'peak memory footprint' $S/$name.log | awk '{printf "%.1f", $1/1073741824}')
  echo "$name: exit $rc, $(( $(date +%s) - t0 )) s, peak $peak GB" | tee -a $S/results.txt; return $rc; }
qwen() { local name=$1; shift
  run $name mflux-generate-qwen-2.1 --seed 7 --width 1024 --height 1024 --prompt "$P" \
    --output $S/$name.png "$@"; }
saved=(--model $Q --base-model qwen-image-2.1)
: > $S/results.txt
echo "mflux $V, $(sysctl -n machdep.cpu.brand_string)" >> $S/results.txt
# Saved as the app does it, with its copy.json, so the app renders from this copy afterwards.
[ -f $Q/copy.json ] || { run save mflux-save --model qwen-image-2.1 --quantize 8 --path $Q &&
  printf '{\n "modelId": "qwen-image-2.1",\n "bits": 8,\n "mflux": "%s",\n "createdAt": "%s"\n}' \
    $V "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" > $Q/copy.json; }
qwen q25 "${saved[@]}" --steps 25
qwen q25-f16 "${saved[@]}" --steps 25 "${F16[@]}"
qwen cache "${saved[@]}" --steps 25 --step-cache-ratio 0.4
qwen cache-f16 "${saved[@]}" --steps 25 --step-cache-ratio 0.4 "${F16[@]}"
qwen fast "${saved[@]}" --steps 6 --scheduler viggle_turbo --lora $LORA 1.0
qwen fast-f16 "${saved[@]}" --steps 6 --scheduler viggle_turbo --lora $LORA 1.0 "${F16[@]}"
qwen orig-q8 --model qwen-image-2.1 --quantize 8 --steps 25
qwen orig-q8-f16 --model qwen-image-2.1 --quantize 8 --steps 25 "${F16[@]}"
qwen lowram "${saved[@]}" --steps 25 --low-ram
qwen cache-lowram "${saved[@]}" --steps 25 --step-cache-ratio 0.4 --low-ram
qwen fast-lowram "${saved[@]}" --steps 6 --scheduler viggle_turbo --lora $LORA 1.0 --low-ram
qwen orig-q8-lowram --model qwen-image-2.1 --quantize 8 --steps 25 --low-ram
for f in "" f16; do
  run klein${f:+-$f} mflux-generate-flux2 --model flux2-klein-4b --seed 7 --width 832 --height 1216 \
    --steps 4 --prompt "$P" --output $S/klein${f:+-$f}.png ${f:+"${F16[@]}"}
done
# --low-ram on the other Image Models, at their app steps, 1024×1024, without quantizing, and
# FLUX.2 Klein 9B with -q 8 (FLUX.2 doesn't load lazily, so -q 8 converts the full weights).
other() { local name=$1 cmd=$2 model=$3 steps=$4; shift 4
  for r in "" lowram; do
    run $name${r:+-$r} $cmd --model $model --seed 7 --width 1024 --height 1024 --steps $steps \
      --prompt "$P" --output $S/$name${r:+-$r}.png ${r:+--low-ram} "$@"
  done; }
other klein4b mflux-generate-flux2 flux2-klein-4b 4
other klein9b mflux-generate-flux2 flux2-klein-9b 4
other klein9b-q8 mflux-generate-flux2 flux2-klein-9b 4 --quantize 8
other zimage mflux-generate-z-image-turbo filipstrand/Z-Image-Turbo-mflux-4bit 9 --base-model z-image-turbo
other krea2 mflux-generate-krea2 krea-2 8
other ernie mflux-generate-ernie-image-turbo ernie-image-turbo 8
other boogu mflux-generate-boogu boogu-image-turbo 4
echo done >> $S/results.txt
