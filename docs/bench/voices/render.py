# /// script
# requires-python = ">=3.14,<3.15"
# dependencies = ["mlx-audio", "torch"]
# [tool.uv]
# prerelease = "allow"
# python-preference = "only-managed"
# ///
"""
Speaks Kael's lines in his designed voice (kael-ref.wav) with one TTS setup, to compare with the
clips kept here. See README.md.

    uv run render.py higgs3              # the six test lines, as in round 1
    uv run render.py higgs3 --story      # all 29 of his lines, untagged, as in round 3
    uv run --with librosa python pitch.py out/higgs3/*.wav

Add a setup to SETUPS: the model, and how one line is passed to it. Output goes to out/.
"""
import json, sys, time
from pathlib import Path
import mlx.core as mx
import numpy as np
from mlx_audio.audio_io import write
from mlx_audio.tts.utils import load_model
from mlx_audio.utils import load_audio

HERE = Path(__file__).parent
REF = HERE / 'kael-ref.wav'
REF_TEXT = "The rain hasn't stopped in three days. Sit down, if you're staying. I don't do conversation."
VOICE = ('A 42-year-old man with a low, rough, gravelly voice, worn by pipe smoke. He speaks quietly '
         'and flatly, in clipped short sentences, with a dry, sardonic edge. Weary and guarded.')

# name → (repo, load options, how one line is passed: line → generate() arguments)
SETUPS = {
    'higgs3': ('bosonai/higgs-tts-3-4b', {'model_type': 'higgs_audio_v3'},
               lambda l: dict(text=l['text'], ref_audio=REF, ref_text=REF_TEXT, temperature=0.5, top_k=30)),
    'qwen-clone': ('mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16', {},
                   lambda l: dict(text=l['text'], ref_audio=REF, ref_text=REF_TEXT)),
    'chatterbox': ('mlx-community/chatterbox-fp16', {},
                   lambda l: dict(text=l['text'], ref_audio=REF, exaggeration=0.5)),
    'qwen-design': ('mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16', {},
                    lambda l: dict(text=l['text'], instruct=f"{VOICE} Delivery: {l.get('note', 'as written')}.")),
}

def lines(story: bool):
    results = json.loads((HERE / 'results.json').read_text())
    if story:
        return [{'frame': r['frame'], 'text': r['line']} for r in results['conversation']]
    return [{'frame': r['frame'], 'text': r['text'], 'note': r['note']} for r in results['round1']['higgs3']]

def main():
    name, story = sys.argv[1], '--story' in sys.argv
    repo, load_opts, args = SETUPS[name]
    model = load_model(repo, **load_opts)
    out = HERE / 'out' / (name + ('-story' if story else ''))
    out.mkdir(parents=True, exist_ok=True)
    for line in lines(story):
        kw = args(line)
        if isinstance(kw.get('ref_audio'), Path):
            kw['ref_audio'] = load_audio(str(kw['ref_audio']), sample_rate=model.sample_rate)
        mx.random.seed(1)
        start = time.time()
        audio = np.concatenate([np.asarray(r.audio) for r in model.generate(**kw)])
        write(str(out / f"frame{line['frame']}.wav"), audio, model.sample_rate)
        print(f"frame {line['frame']}: {time.time() - start:.1f} s for {len(audio) / model.sample_rate:.1f} s of audio")

if __name__ == '__main__':
    main()
