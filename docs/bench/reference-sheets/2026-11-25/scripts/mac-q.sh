#!/bin/bash
# The face pass on mflux: Kael's face in the two-men picture from his sheet, full weights against 8-bit.
cd "$(dirname "$0")"
P="Give the man on the left in image 1 the face and hair of the man in image 2, Kael, but keep him exactly as in image 1: his expression (scowling, his jaw clenched), the way his head is turned, and the light. Change nothing else."
for q in full 8; do
  extra=(); [ $q = 8 ] && extra=(-q 8)
  t0=$(date +%s)
  /usr/bin/time -l mflux-generate-qwen-2.1-edit --model mflux-community/qwen-image-2-1-mflux-bf16 --base-model qwen-image-2.1 --steps 25 --width 1024 --height 1024 --seed 9 \
    --image-paths men-8.png sheet-kael.png --mask-image mac-mask-kael.png --prompt "$P" "${extra[@]}" --output mac-fp-$q.png > mac-fp-$q.log 2>&1
  c=$?; peak=$(grep "peak memory footprint" mac-fp-$q.log | awk '{printf "%.1f", $1/1e9}')
  echo "mac-fp-$q: exit $c, $(( $(date +%s) - t0 )) s, peak ${peak} GB" | tee -a mac-results.txt
done
