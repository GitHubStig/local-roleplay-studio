<!--
The cue writer's call, user message (see cue.md).

Values: score (the Score, a line per part), previous (the Cue before, in a line, or a note that
there's none), frame (the Frame it begins on), reading (the Director's), entry (how it comes in,
in words), line (the line that caused it)
-->

The Score:

{{score}}

The music until now: {{previous}}.

At {{frame}} the music changes, {{entry}}. The director's reading: {{reading}}

The line that caused it: {{line}}

Write the next Cue. Answer with one JSON object: "mood", "energy", "density", "tempo",
"instruments", then "vocals". You're done only when the vocals are written.
