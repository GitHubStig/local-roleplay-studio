#!/bin/bash
# Portraits from another model, and in another style, used in the face edit (Qwen-Image 2.1).
O=$1; cd "$O"  # an empty folder, where the pictures go
KAEL="Kael, a 42-year-old man with a lean, rigid build, weathered tanned skin marked by old scars, short unkempt brown hair, and a scarred, angular face with tired, piercing eyes."
ELARA="Elara Vance, a 20-year-old woman with a slender build, pale skin flushed by the cold, dark hair pulled back neatly, and a face with sharp, intelligent features and focused, calculating eyes."
STYLE="A moody, cinematic oil painting with heavy, visible brushstrokes, utilizing a chiaroscuro lighting scheme with deep shadows and warm, flickering amber highlights to evoke a gritty, 18th-century atmospheric realism."
PHOTO="A photorealistic studio photograph, shot on an 85mm lens in soft, even daylight, with sharp focus and true-to-life skin texture."
portrait() { echo "$1 A head-and-shoulders portrait of $2 alone, facing the viewer in a slight three-quarter turn, face clearly and evenly lit, in plain dark clothes, against a plain dark grey backdrop. $3"; }
CRY="$ELARA Elara Vance sits on a narrow bed in a small attic room, crying, tears running down her cheeks, her face crumpled with grief, a crumpled letter in her lap, seen from the waist up in grey morning light from a small window. $STYLE"
PROFILE="$KAEL Kael seen in profile, facing left, half his face in deep shadow, as he stands at a rain-streaked window holding a guttering candle, from the chest up, in a dark tavern at night. $STYLE"
EL="Give the woman in image 1 the face and hair of the woman in image 2, Elara Vance, but keep her expression exactly as it is in image 1: crying, tears running down her cheeks, her face crumpled with grief. Change nothing else."
KA="Give the man in image 1 the face and hair of the man in image 2, Kael, but keep him exactly as he is in image 1: seen in profile facing left, half his face in shadow, lit by the candle. Change nothing else."
QWEN=(--model mflux-community/qwen-image-2-1-mflux-bf16 --base-model qwen-image-2.1 --steps 25)
KLEIN=(--model mflux-community/flux-3-image-klein-mflux-bf16 --base-model flux3-image-klein --steps 16)
run() { local name=$1; shift; [ -f "$name.png" ] && return; local t0=$(date +%s); /usr/bin/time -l "$@" --width 1024 --height 1024 --output "$O/$name.png" > "$name.log" 2>&1; local c=$?; local peak=$(grep "peak memory footprint" "$name.log" | awk '{printf "%.1f", $1/1e9}'); echo "$name: exit $c, $(( $(date +%s) - t0 )) s, peak ${peak} GB" | tee -a results.txt; [ $c -ne 0 ] && tail -3 "$name.log"; }
# Klein first: portraits in the Look's style and photoreal, and the two scenes.
run p-klein-kael mflux-generate-flux3 "${KLEIN[@]}" --seed 3 --prompt "$(portrait "$KAEL" him "$STYLE")"
run p-klein-elara mflux-generate-flux3 "${KLEIN[@]}" --seed 3 --prompt "$(portrait "$ELARA" her "$STYLE")"
run p-photo-kael mflux-generate-flux3 "${KLEIN[@]}" --seed 3 --prompt "$(portrait "$KAEL" him "$PHOTO")"
run p-photo-elara mflux-generate-flux3 "${KLEIN[@]}" --seed 3 --prompt "$(portrait "$ELARA" her "$PHOTO")"
run s-klein-cry mflux-generate-flux3 "${KLEIN[@]}" --seed 8 --prompt "$CRY"
run s-klein-profile mflux-generate-flux3 "${KLEIN[@]}" --seed 8 --prompt "$PROFILE"
# Qwen: the control portraits and the scenes.
run p-qwen-kael mflux-generate-qwen-2.1 "${QWEN[@]}" --seed 3 --prompt "$(portrait "$KAEL" him "$STYLE")"
run p-qwen-elara mflux-generate-qwen-2.1 "${QWEN[@]}" --seed 3 --prompt "$(portrait "$ELARA" her "$STYLE")"
run s-qwen-cry mflux-generate-qwen-2.1 "${QWEN[@]}" --seed 8 --prompt "$CRY"
run s-qwen-profile mflux-generate-qwen-2.1 "${QWEN[@]}" --seed 8 --prompt "$PROFILE"
# Face edits, Qwen-Image 2.1, heads found by its Qwen3-VL, the seed one on from the scene's.
for p in qwen klein photo; do
  run e-qwen-cry-$p mflux-generate-qwen-2.1-edit "${QWEN[@]}" --seed 9 --image-paths s-qwen-cry.png p-$p-elara.png --auto-mask "the woman's head: her face and hair" --prompt "$EL"
  run e-qwen-profile-$p mflux-generate-qwen-2.1-edit "${QWEN[@]}" --seed 9 --image-paths s-qwen-profile.png p-$p-kael.png --auto-mask "the man's head: his face and hair" --prompt "$KA"
done
# A scene by another model, with the Qwen portrait.
run e-klein-cry-qwen mflux-generate-qwen-2.1-edit "${QWEN[@]}" --seed 9 --image-paths s-klein-cry.png p-qwen-elara.png --auto-mask "the woman's head: her face and hair" --prompt "$EL"
run e-klein-profile-qwen mflux-generate-qwen-2.1-edit "${QWEN[@]}" --seed 9 --image-paths s-klein-profile.png p-qwen-kael.png --auto-mask "the man's head: his face and hair" --prompt "$KA"
echo done >> results.txt
