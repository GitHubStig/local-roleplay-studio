"""
Speaks every line in `lines.json` (from `lines.ts`) through the voice service's Higgs, as it speaks
them, in two voices, and writes each one's length and frames to `results.jsonl`: how long a line of
so many characters runs, for the cap on a line's frames (`maxFrames` in server/voice/higgs.ts).
Lines are capped at 1000 frames (40 s) here, so one that loops costs half a minute, and kept as
`capped-*.wav` to listen to. Run with the voice service's Python, from the repo:
`$(uv python find --script python/voice/serve.py) docs/bench/voices/cap/render.py`. About 21 min on
the Mac (2026-11-24).
"""
import json
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[3] / 'python' / 'voice'))
import mlx.core as mx  # noqa: E402
import serve  # noqa: E402
import soundfile as sf  # noqa: E402
from mlx_audio.utils import load_audio  # noqa: E402

VOICES = [  # name, reference clip, what it says, seeds
    ('kael', HERE.parent / 'kael-ref.wav',
     "The rain hasn't stopped in three days. Sit down, if you're staying. I don't do conversation.", (1, 2)),
    ('keeper', HERE / 'keeper-ref.wav',
     "Welcome to the Gilded Flagon, traveller. Sit by the fire, and I'll pour you something warm.", (1,)),
]
CAP = 1000

lines = json.loads((HERE / 'lines.json').read_text())
m = serve.model(serve.SPEAK_MODEL)
with open(HERE / 'results.jsonl', 'w') as out:
    for voice, ref_path, ref_text, seeds in VOICES:
        ref = load_audio(str(ref_path), sample_rate=m.sample_rate)
        for line in lines:
            for seed in seeds:
                mx.random.seed(seed)
                start = time.time()
                results = list(m.generate(text=line['tagged'], ref_audio=ref, ref_text=ref_text,
                                          max_new_tokens=CAP, **serve.SPEAK_SAMPLING))
                audio = np.concatenate([np.asarray(r.audio) for r in results])
                frames = sum(r.token_count for r in results)
                rec = dict(voice=voice, id=line['id'], seed=seed, pace=line['pace'], sound=line['sound'],
                           whisper=line['whisper'], chars=len(line['plain']), words=len(line['plain'].split()),
                           seconds=round(len(audio) / m.sample_rate, 2), frames=frames, capped=frames >= CAP,
                           took=round(time.time() - start, 2))
                if rec['capped']:
                    sf.write(HERE / f"capped-{voice}-{line['id']}-s{seed}.wav", audio, m.sample_rate)
                out.write(json.dumps(rec) + '\n')
                out.flush()
                mx.clear_cache()
