# /// script
# requires-python = ">=3.14,<3.15"
# dependencies = ["mlx-audio==0.6.4", "soundfile"]
# [tool.uv]
# python-preference = "only-managed"
# ///
"""
Renders the music bench's cases with MiniMax Music 3 through mlx-audio (the Mac), timing each and
noting MLX's peak memory. See README.md.

    uv run render.py                    # every case, mxfp8, seed 1
    uv run render.py tavern-60 key-d    # only these
    MODEL=mlx-community/MiniMax-Music3-4bit SEED=2 uv run render.py

Captions are written as an adapter would write them from a Score and a Cue: the genre and
instruments, the mood, energy, density and tempo in words, and a BPM from the Score's range. The
tavern, Heaven and Buffet cases follow the example Scenarios' Music sections; the song quotes
lines of the kind a Roleplay collects. Output goes to out/<model>/, results to results.jsonl.
"""
import json, os, sys, time
from pathlib import Path
import mlx.core as mx
from mlx_audio.music.generate import generate_music
from mlx_audio.music.utils import load_model

HERE = Path(__file__).parent
MODEL = os.environ.get('MODEL', 'mlx-community/MiniMax-Music3-mxfp8')
SEED = int(os.environ.get('SEED', '1'))
STEPS = int(os.environ.get('STEPS', '30'))

TAVERN = ('Folk instrumental, 18th-century harbour tavern. Lone fiddle, low cello, squeezebox. '
          'Guarded warmth, smoky and intimate, restrained, sparse, slow, 70 BPM.')
TAVERN_TENSE = ('Folk instrumental, 18th-century harbour tavern. Low cello, lone fiddle, a frame drum. '
                'Creeping menace under a calm surface, building, layered, moderate, 96 BPM.')
HEAVEN = ('Sacred ambient. Wordless choir, pipe organ held low, harp, soft strings. '
          'Vast awe with warmth under the solemnity, calm, layered, slow, 60 BPM.')
BUFFET = ('Gentle cinematic. Soft piano, warm strings, a far-off acoustic guitar. '
          'Bittersweet regret giving way to peace, calm, sparse, slow, 66 BPM.')
SONG = ('Folk ballad, a weathered male voice with fiddle, cello and squeezebox. '
        'Bittersweet and tender, a story of a father and a daughter found again, slow, 72 BPM.')
SONG_LYRICS = """[verse]
The rain hadn't stopped in three days
When a stranger came in from the quay
She said you are late, by twenty years
And set her mother's ring by me
[chorus]
Sit down, if you're staying
The fire's low but it's warm
Sit down, if you're staying
We'll wait out the storm
[verse]
I knew the scar above her eye
I'd sworn I'd never see again
Your daughter, she said, and the room went still
As the tide came in
[chorus]
Sit down, if you're staying
The fire's low but it's warm
Sit down, if you're staying
We'll wait out the storm"""
INSTRUMENTAL = '[instrumental]'

# name → (caption, lyrics, seconds)
CASES = {
    'tavern-60': (TAVERN, INSTRUMENTAL, 60),
    'tavern-120': (TAVERN, INSTRUMENTAL, 120),
    'tavern-180': (TAVERN, INSTRUMENTAL, 180),
    'tavern-tense-60': (TAVERN_TENSE, INSTRUMENTAL, 60),
    'heaven-60': (HEAVEN, INSTRUMENTAL, 60),
    'buffet-60': (BUFFET, INSTRUMENTAL, 60),
    'key-d': (TAVERN.replace('slow, 70 BPM', 'slow, 70 BPM, in D minor'), INSTRUMENTAL, 60),
    'key-a': (TAVERN.replace('slow, 70 BPM', 'slow, 70 BPM, in A major'), INSTRUMENTAL, 60),
    'song-150': (SONG, SONG_LYRICS, 150),
}

# MiniMax's own example (its model card's reproducible request), read from the script it publishes,
# fetched into out/reference/ (see README.md): its caption is how MiniMax means it to be prompted.
_REFERENCE = HERE / 'out' / 'reference' / 'minimax_ttm_test.py'
if _REFERENCE.exists():
    _ns = {}
    exec(compile(_REFERENCE.read_text().split('DEFAULT_OUT')[0], str(_REFERENCE), 'exec'), _ns)
    CASES['reference-120'] = (_ns['CAPTION'], _ns['LYRICS'], 120)


def main():
    names = sys.argv[1:] or list(CASES)
    out = HERE / 'out' / MODEL.split('/')[-1]
    out.mkdir(parents=True, exist_ok=True)
    start = time.perf_counter()
    model = load_model(MODEL)
    loaded = time.perf_counter() - start
    print(f'{MODEL} loaded in {loaded:.1f} s', flush=True)
    for name in names:
        caption, lyrics, seconds = CASES[name]
        mx.reset_peak_memory()
        start = time.perf_counter()
        path = generate_music(caption, lyrics, model, duration=seconds, steps=STEPS, seed=SEED,
                              output_path=out / f'{name}-s{SEED}.wav', verbose=False)
        took = time.perf_counter() - start
        import soundfile
        length = soundfile.info(path).duration
        row = dict(model=MODEL, case=name, seed=SEED, steps=STEPS, asked=seconds,
                   length=round(length, 1), took=round(took, 1), load=round(loaded, 1),
                   peak_gb=round(mx.get_peak_memory() / 1e9, 1), date=time.strftime('%Y-%m-%d'))
        print(json.dumps(row), flush=True)
        with open(HERE / 'results.jsonl', 'a') as f:
            f.write(json.dumps(row) + '\n')
        mx.clear_cache()


main()
