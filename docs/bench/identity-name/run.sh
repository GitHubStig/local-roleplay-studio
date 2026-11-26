#!/bin/bash
# The bench's runs, in order, each to its log in results/ (this Mac, Ollama, Thinking off).
# $1: the private Session (counts only), $2: the tavern's Session.
cd "$(dirname "$0")"
G=gemma-4-26b-heretic:nvfp4
M=eriktonon/moonlight-dusk-uncensored:26b
caffeinate -i deno run -A look.ts "$1" 1-8 $M > results/look-private-moonlight.log 2>&1
caffeinate -i deno run -A look.ts "$2" 1-8 $M > results/look-tavern-moonlight.log 2>&1
caffeinate -i deno run -A look.ts "$1" 1-8 $G > results/look-private-gemma.log 2>&1
caffeinate -i deno run -A look.ts "$2" 1-8 $G > results/look-tavern-gemma.log 2>&1
cd ../../..
H=docs/bench/reference-sheets/2026-11-26/hair
caffeinate -i deno run -A $H/calls.ts plan example-scenarios/tavern.md 4 1-8 > docs/bench/identity-name/results/plan-tavern-gemma.log 2>&1
caffeinate -i deno run -A $H/calls.ts frame "$2" 1 1-8 > docs/bench/identity-name/results/frame-tavern-gemma.log 2>&1
echo done > docs/bench/identity-name/results/.finished
