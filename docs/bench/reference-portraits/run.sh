#!/bin/bash
# Reference portraits trial: Kael tavern Frames 6, 9 and 12 on Qwen-Image 2.1 (full weights),
# without and with portraits made from the Look; then a blink by auto-mask on Frame 6.
S=$(cd "$(dirname "$0")" && pwd)/out
mkdir -p "$S"
cd "$(dirname "$0")/../../.."
P=docs/bench/art-tags/prompts/gemma4-31b.json
prompt() { python3 -c "import json;print([e['prompt'] for e in json.load(open('$P')) if e['style']=='prose' and e['index']==$1][0])"; }
KAEL="Kael, a 42-year-old man with a lean, rigid build, weathered tanned skin marked by old scars, short unkempt brown hair, and a scarred, angular face with tired, piercing eyes."
ELARA="Elara Vance, a 20-year-old woman with a slender build, pale skin flushed by the cold, dark hair pulled back neatly, and a face with sharp, intelligent features and focused, calculating eyes."
STYLE="A moody, cinematic oil painting with heavy, visible brushstrokes, utilizing a chiaroscuro lighting scheme with deep shadows and warm, flickering amber highlights to evoke a gritty, 18th-century atmospheric realism."
COMMON=(--steps 25 --seed 7 --width 1024 --height 1024)
run() { # name, command, args…
  local name=$1 cmd=$2; shift 2
  local t0=$(date +%s)
  /usr/bin/time -l $cmd --model qwen-image-2.1 "${COMMON[@]}" --output "$S/$name.png" "$@" > "$S/$name.log" 2>&1
  local code=$?
  local peak=$(grep "peak memory footprint" "$S/$name.log" | awk '{printf "%.1f", $1/1e9}')
  echo "$name: exit $code, $(( $(date +%s) - t0 )) s, peak ${peak} GB" | tee -a "$S/results.txt"
  [ $code -ne 0 ] && tail -3 "$S/$name.log" | tee -a "$S/results.txt"
}
: > "$S/results.txt"
portrait() { echo "adult, $1 A head-and-shoulders portrait of $2 alone, facing the viewer in a slight three-quarter turn, face clearly and evenly lit, in plain dark clothes, against a plain dark grey backdrop. $STYLE"; }
run portrait-kael mflux-generate-qwen-2.1 --prompt "$(portrait "$KAEL" him)"
run portrait-elara mflux-generate-qwen-2.1 --prompt "$(portrait "$ELARA" her)"
for i in 6 9 12; do
  run plain-$i mflux-generate-qwen-2.1 --prompt "$(prompt $i)"
done
REF="Image 1 is Kael. Keep his face, hair and build exactly as in image 1."
REF2="Image 1 is Kael and image 2 is Elara Vance. Keep each one's face, hair and build exactly as in their image."
run refs-6 mflux-generate-qwen-2.1-edit --image-paths "$S/portrait-kael.png" --prompt "$REF $(prompt 6)"
for i in 9 12; do
  run refs-$i mflux-generate-qwen-2.1-edit --image-paths "$S/portrait-kael.png" "$S/portrait-elara.png" --prompt "$REF2 $(prompt $i)"
done
run blink-6 mflux-generate-qwen-2.1-edit --image-paths "$S/plain-6.png" --auto-mask "the man's eyes" --prompt "His eyes are closed, as in a blink. Change nothing else."
echo done >> "$S/results.txt"
