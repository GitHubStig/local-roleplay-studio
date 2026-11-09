<!--
The cue writer's call, user message (see cue.md).

Values: taste (cue-taste.md, or nothing), steer (cue-steer.md or cue-steer-earlier.md, or nothing),
score (the Score, a line per part), previous (the Cue before, in a line, or a note that
there's none), frame (the Frame it begins on), reading (the Director's), entry (how it comes in,
in words), line (the line that caused it)
-->

The Score:

{{score}}

{{taste}}

The music until now: {{previous}}.

At {{frame}} the music changes, {{entry}}. The director's reading: {{reading}}

The line that caused it: {{line}}

{{steer}}

Write the next Cue. Answer with one JSON object: "mood", "energy", "density", "tempo",
"instruments", "vocals", "shape", "key", "caption", then "lyrics". You're done only when the lyrics are
written.
