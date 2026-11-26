#!/bin/bash
cd /Users/supreme/github/local-roleplay-studio/docs/bench/reference-sheets/2026-11-26/edits
W=$1; F=/Users/supreme/github/local-roleplay-studio/sessions/20261126-034510-32fd
K='Kael=Kael, a 42-year-old man with a lean build, weathered scarred skin, and piercing tired eyes.=sheet-kael-a4a09fb9.png'
X='Kael keeps his gaze lowered toward the countertop with a weary, stoic expression.'
P=(
  "edit-smile.png:$K::$X::The man is smiling warmly, his eyes crinkled."
  "edit-cap.png:$K::$X::A grey woollen cap on the man's head."
  "edit-cut.png:$K::$X::A fresh red cut across the man's left cheek."
)
deno run -A passes.ts http://192.168.50.85:8188 $F $W 10,11,12 kept "${P[@]}"
deno run -A passes.ts http://192.168.50.85:8188 $F $W 10,11,12 change "${P[@]}"
deno run -A passes.ts http://192.168.50.85:8188 $F $W 11,12 named "${P[@]}"
echo ALL DONE
