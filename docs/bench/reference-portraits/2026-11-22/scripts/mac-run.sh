#!/bin/bash
# Reference portraits on mflux: one step (portrait in the render) and two steps (face edit), on the PC's portraits and pictures.
S=$1; P=$S/refs-pc; O=$S/refs-mac; cd $O
python3 -I - "$S" > prompts.sh <<'PY'
import sys, re, shlex
src = open(sys.argv[1] + '/scenes-bench.py').read()
def grab(name):
    m = re.search(r"'%s': \((\w+), \[\w+\], f\"(.*?)\"\)," % name, src); return m.group(2)
KAEL = "Kael, a 42-year-old man with a lean, rigid build, weathered tanned skin marked by old scars, short unkempt brown hair, and a scarred, angular face with tired, piercing eyes."
ELARA = "Elara Vance, a 20-year-old woman with a slender build, pale skin flushed by the cold, dark hair pulled back neatly, and a face with sharp, intelligent features and focused, calculating eyes."
STYLE = "A moody, cinematic oil painting with heavy, visible brushstrokes, utilizing a chiaroscuro lighting scheme with deep shadows and warm, flickering amber highlights to evoke a gritty, 18th-century atmospheric realism."
for n in ('cry', 'profile'):
    t = grab(n).replace('{KAEL}', KAEL).replace('{ELARA}', ELARA).replace('{STYLE}', STYLE)
    print(f"{n.upper()}={shlex.quote(t)}")
PY
source prompts.sh
R1E="Image 1 is Elara Vance. Keep her face, hair and build exactly as in image 1."
R1="Image 1 is Kael. Keep his face, hair and build exactly as in image 1."
EL="Give the woman in image 1 the face and hair of the woman in image 2, Elara Vance, but keep her expression exactly as it is in image 1: crying, tears running down her cheeks, her face crumpled with grief. Change nothing else."
KA="Give the man in image 1 the face and hair of the man in image 2, Kael, but keep him exactly as he is in image 1: seen in profile facing left, half his face in shadow, lit by the candle. Change nothing else."
run() { local name=$1; shift; local t0=$(date +%s); /usr/bin/time -l "$@" --model mflux-community/qwen-image-2-1-mflux-bf16 --base-model qwen-image-2.1 --steps 25 --width 1024 --height 1024 --output "$O/$name.png" > "$O/$name.log" 2>&1; local c=$?; local peak=$(grep "peak memory footprint" "$O/$name.log" | awk '{printf "%.1f", $1/1e9}'); echo "$name: exit $c, $(( $(date +%s) - t0 )) s, peak ${peak} GB" | tee -a results.txt; [ $c -ne 0 ] && tail -3 "$O/$name.log"; }
: > results.txt
for s in 8 9; do
  run m-cry-plain-$s mflux-generate-qwen-2.1 --seed $s --prompt "$CRY"
  run m-cry-refs-$s mflux-generate-qwen-2.1-edit --seed $s --image-paths $P/portrait-elara.png --prompt "$R1E $CRY"
  run m-profile-plain-$s mflux-generate-qwen-2.1 --seed $s --prompt "$PROFILE"
  run m-profile-refs-$s mflux-generate-qwen-2.1-edit --seed $s --image-paths $P/portrait-kael.png --prompt "$R1 $PROFILE"
done
for s in 8 9; do
  run m-fe-cry-$s mflux-generate-qwen-2.1-edit --seed $((s+1)) --image-paths $P/sc-cry-plain-$s.png $P/portrait-elara.png --mask-image $P/mask-cry-$s.png --prompt "$EL"
  run m-fe-profile-$s mflux-generate-qwen-2.1-edit --seed $((s+1)) --image-paths $P/sc-profile-plain-$s.png $P/portrait-kael.png --mask-image $P/mask-profile-$s.png --prompt "$KA"
done
echo done >> results.txt
