#!/bin/bash
# The app's face pass on two Frames of the tavern Storyboard (Kael alone; Elara and Kael), seeds 8
# and 9, told the Frame's expression, by ../edits/passes.ts on the PC's ComfyUI, with the edit
# workflow as it stands (run once without QwenImage21Cache, once with it).
# usage: run.sh <out folder> <file with one picture argument per line> <session folder>
cd "$(dirname "$0")/../edits"
P=(); while IFS= read -r l; do P+=("$l"); done < "$2"
deno run -A passes.ts http://192.168.50.85:8188 "$3" "$1" 8,9 named "${P[@]}"
