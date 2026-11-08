# /// script
# requires-python = ">=3.14,<3.15"
# dependencies = ["mlx-audio==0.6.4"]
# [tool.uv]
# python-preference = "only-managed"
# ///
"""
Times each word of a sung song with Whisper (large-v3-turbo, through mlx-audio, on the Mac) and
finds the quoted lines in it: whether a song's words can be timed (they can; not needed for now, as the end song shows nothing in time with its lines).
See README.md.

    uv run words.py clips/ace-step-1.5-xl-turbo-4b-lm/song-150-s1.m4a

For each line: where Whisper puts it, how close its words came, and a clip of just that stretch
(out/words/<song>/<n>.m4a, a second either side), to hear whether it lands on the line.
"""
import difflib, json, re, subprocess, sys
from pathlib import Path
from mlx_audio.stt.utils import load_model

HERE = Path(__file__).parent
LINES = [
    "The rain hadn't stopped in three days",
    "She said you are late, by twenty years",
    "Sit down, if you're staying",
    "I knew the scar above her eye",
    "Your daughter, she said, and the room went still",
    "We'll wait out the storm",
]


def norm(text):
    return re.sub(r"[^a-z' ]", '', text.lower()).split()


def find(line, words):
    """The stretch of words most like the line: its first and last word, and how alike (0–1)."""
    target = norm(line)
    best = (0.0, 0, 0)
    spoken = [norm(w['word']) for w in words]
    for i in range(len(words)):
        for n in range(max(1, len(target) - 2), len(target) + 3):
            got = [t for ws in spoken[i:i + n] for t in ws]
            score = difflib.SequenceMatcher(None, target, got).ratio()
            if score > best[0]:
                best = (score, i, i + n - 1)
    return best


def main():
    model = load_model('mlx-community/whisper-large-v3-turbo-asr-fp16')
    for song in map(Path, sys.argv[1:]):
        result = model.generate(str(song), word_timestamps=True)
        words = [w for seg in result.segments for w in seg.get('words', [])]
        out = HERE / 'out' / 'words' / f'{song.parent.name}-{song.stem}'
        out.mkdir(parents=True, exist_ok=True)
        print(f'== {song} ({len(words)} words)')
        for n, line in enumerate(LINES, 1):
            score, a, b = find(line, words)
            start, end = words[a]['start'], words[min(b, len(words) - 1)]['end']
            heard = ''.join(w['word'] for w in words[a:b + 1]).strip()
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(max(0, start - 1)), '-to', str(end + 1),
                            '-i', str(song), '-c:a', 'aac', '-b:a', '96k', str(out / f'{n}.m4a')], check=True)
            print(json.dumps({'line': n, 'text': line, 'heard': heard, 'alike': round(score, 2),
                              'start': round(start, 2), 'end': round(end, 2)}, ensure_ascii=False))


main()
