# /// script
# requires-python = ">=3.14,<3.15"
# dependencies = ["librosa", "soundfile", "numpy", "scipy", "torch", "transformers"]
# [tool.uv]
# python-preference = "only-managed"
# ///
"""
Measures the bench's clips and sets the numbers beside the owner's verdicts (verdicts.json), to see
which, if any, agree with the ear. See README.md.

    uv run analyse.py            # every clip with a verdict; a table, and each measure's correlation

It reads only the .m4a in clips/, as CLAP's scores depend on the audio's format, and merges into
analysis.jsonl: a clip no longer in clips/ keeps its earlier row, as its raw audio may be gone.

Per clip, over 10 s windows:
- development: how far each window's sound (its mel spectrum) moves from the one before, on average;
- repetition: how alike all windows are to each other, on average;
- loudness range: the spread of the windows' loudness, in dB;
- brightness (spectral centroid, Hz), noisiness (spectral flatness), notes a second (onsets);
- CLAP (laion/clap-htsat-unfused, on the CPU): how well the audio matches text, a window at a time
  and averaged: its own caption, and a few words for what's in it (a choir, a synthesizer…).

The verdicts are one listener's, on few clips: a correlation here is a hint, not a finding.
"""
import json, re, sys
from pathlib import Path
import numpy as np
import librosa

HERE = Path(__file__).parent
WINDOW = 10.0
PROBES = {
    'choir': 'a choir singing', 'organ': 'a pipe organ', 'fiddle': 'a violin or fiddle', 'cello': 'a cello',
    'accordion': 'an accordion', 'piano': 'a piano', 'guitar': 'an acoustic guitar', 'synth': 'a synthesizer',
    'electronic': 'electronic music', 'drums': 'drums', 'voice': 'a person singing words',
    'tense': 'tense, suspenseful music', 'calm': 'calm, peaceful music', 'christmas': 'Christmas music',
    'folk': 'folk music', 'real': 'a live recording of real acoustic instruments',
}


def captions():
    """Each case's caption, from ace.py and render.py, without running them."""
    found = {}
    for script, cut in (('ace.py', "\nif __name__ == '__main__'"), ('render.py', '\nmain()')):
        g = {'__file__': str(HERE / script), '__name__': 'analyse'}
        src = (HERE / script).read_text().split(cut)[0]
        # render.py's imports need mlx, which this script doesn't: only its strings are wanted.
        src = re.sub(r'^(from mlx\S*|import mlx\S*).*$', 'pass', src, flags=re.M)
        exec(compile(src, script, 'exec'), g)
        for name, case in g['CASES'].items():
            found.setdefault(script, {})[name] = case[0]
    return found


def case_of(path):
    name = re.sub(r'-s\d+$', '', path.stem)
    return re.sub(r'-cover-from-.*$', '', name)


def decode(path):
    """A clip as mono samples at 48 kHz, through ffmpeg (soundfile can't read .m4a)."""
    import subprocess
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-f', 'f32le', '-ac', '1', '-ar', '48000', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def windows(y, sr):
    n = int(WINDOW * sr)
    return [y[i:i + n] for i in range(0, len(y) - n + 1, n)] or [y]


def measures(y, sr):
    parts = windows(y, sr)
    mels = [librosa.power_to_db(librosa.feature.melspectrogram(y=p, sr=sr, n_mels=64)).mean(1) for p in parts]
    mels = [m - m.mean() for m in mels]
    unit = [m / (np.linalg.norm(m) + 1e-9) for m in mels]
    steps = [1 - float(unit[i] @ unit[i + 1]) for i in range(len(unit) - 1)]
    pairs = [float(unit[i] @ unit[j]) for i in range(len(unit)) for j in range(i + 1, len(unit))]
    loud = [20 * np.log10(np.sqrt(np.mean(p ** 2)) + 1e-9) for p in parts]
    return {
        'development': np.mean(steps) if steps else 0.0,
        'repetition': np.mean(pairs) if pairs else 1.0,
        'loudness_range': float(np.ptp(loud)),
        'brightness': float(librosa.feature.spectral_centroid(y=y, sr=sr).mean()),
        'noisiness': float(librosa.feature.spectral_flatness(y=y).mean()),
        'notes_per_s': len(librosa.onset.onset_detect(y=y, sr=sr)) / (len(y) / sr),
    }


def main():
    from transformers import ClapModel, ClapProcessor
    import torch
    verdicts = {k: v for k, v in json.loads((HERE / 'verdicts.json').read_text()).items() if not k.startswith('_')}
    caps = captions()
    model = ClapModel.from_pretrained('laion/clap-htsat-unfused').eval()
    proc = ClapProcessor.from_pretrained('laion/clap-htsat-unfused')

    def text_embeds(texts):
        with torch.no_grad():
            e = model.get_text_features(**proc(text=texts, return_tensors='pt', padding=True, truncation=True))
        e = getattr(e, 'pooler_output', e)  # newer transformers return an output object
        return torch.nn.functional.normalize(e, dim=-1)

    probe_e = text_embeds(list(PROBES.values()))
    results = HERE / 'analysis.jsonl'
    earlier = {r['clip']: r for r in map(json.loads, results.read_text().splitlines())} if results.exists() else {}
    rows = []
    for rel, (score, words) in verdicts.items():
        path = HERE / 'clips' / rel
        if not path.exists():
            if rel in earlier:
                print(f'kept its earlier row: {rel}', file=sys.stderr)
                rows.append({**earlier[rel], 'score': score})
            else:
                print(f'missing: {rel}', file=sys.stderr)
            continue
        y, sr = decode(path), 48000
        row = {'clip': rel, 'score': score, **measures(librosa.resample(y, orig_sr=48000, target_sr=22050), 22050)}
        with torch.no_grad():
            a = model.get_audio_features(**proc(audio=windows(y, sr), sampling_rate=48000, return_tensors='pt'))
        a = getattr(a, 'pooler_output', a)
        a = torch.nn.functional.normalize(a, dim=-1).mean(0, keepdim=True)
        a = torch.nn.functional.normalize(a, dim=-1)
        for key, sim in zip(PROBES, (a @ probe_e.T)[0].tolist()):
            row[key] = sim
        script = 'render.py' if rel.startswith('MiniMax') else 'ace.py'
        caption = caps.get(script, {}).get(case_of(Path(rel)))
        row['own_caption'] = float((a @ text_embeds([caption]).T)[0, 0]) if caption else float('nan')
        rows.append(row)
        print(json.dumps({k: (round(v, 3) if isinstance(v, float) else v) for k, v in row.items()}), flush=True)
    results.write_text(''.join(json.dumps(r) + '\n' for r in rows))
    keys = [k for k in rows[0] if k not in ('clip', 'score')]
    scores = np.array([r['score'] for r in rows], dtype=float)
    print('\nCorrelation with the verdict (Spearman), across', len(rows), 'clips:')
    from scipy.stats import spearmanr
    for k in keys:
        vals = np.array([r[k] for r in rows], dtype=float)
        ok = ~np.isnan(vals)
        rho, p = spearmanr(vals[ok], scores[ok])
        print(f'  {k:15s} {rho:+.2f}  (p {p:.2f}, n {ok.sum()})')


main()
