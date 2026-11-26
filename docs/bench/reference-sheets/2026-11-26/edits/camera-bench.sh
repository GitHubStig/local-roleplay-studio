#!/bin/bash
cd /Users/supreme/github/local-roleplay-studio/docs/bench/reference-sheets/2026-11-26/edits
W=$1; F=/Users/supreme/github/local-roleplay-studio/sessions/20261126-034510-32fd
K='Kael=Kael, a 42-year-old man with a lean build, weathered scarred skin, and piercing tired eyes.=sheet-kael-a4a09fb9.png'
E='Elara=Elara, a slender woman with pale cold-flushed skin and sharp calculating eyes.=sheet-elara-66a59b04.png'
X1='Kael keeps his gaze lowered toward the countertop with a weary, stoic expression.'
X2="Kael's tired eyes scan Elara with a wary intensity before he looks toward the empty space beside her. Elara maintains a sharp, calculating gaze directed toward the man behind the bar."
P=(
  "edit-low.png:$K:$E::$X2::Move the camera down near the floor, looking up at them: a low angle. Keep everything else exactly as in the image."
  "edit-close.png:$K::$X1::A close-up of the man's face, filling the picture, in the same place and light."
)
deno run -A passes.ts http://192.168.50.85:8188 $F $W 11,12 change "${P[@]}"
deno run -A passes.ts http://192.168.50.85:8188 $F $W 11,12 named "${P[@]}"
echo ALL DONE
