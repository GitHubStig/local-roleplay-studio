"""Scans a run of the bench (`out/<label>.jsonl`) for what the prompt says not to do. See README.md."""
import json, re, sys
rows = [json.loads(l) for l in open(sys.argv[1])]
back = re.compile(r"[^.;]*\b(previous|from before|falls? away|replac\w+|no longer|vanish\w*|recede\w*|transitions? (in|to)|shifts? (in|to)|dissolves?|strip\w* (of|away))\b[^.;]*", re.I)
neg = re.compile(r"\b(no|not|without|never|absence|lack)\b[^.,;]{0,30}", re.I)
hits = [(i, back.search(r['caption']).group(0).strip()[:90]) for i, r in enumerate(rows) if back.search(r['caption'])]
print(f"{len(rows)} Cues; look back: {len(hits)}")
for h in hits[:12]: print('  ', h)
n = [(i, m.group(0)[:40]) for i, r in enumerate(rows) for m in neg.finditer(r['caption'])]
print('negations:', len(n), n[:6])
print('story names:', [i for i, r in enumerate(rows) if re.search(r"Kael|Elara|Elias|Michael|Patrick", r['caption'])])
v = [r for r in rows if r['vocals'] != 'none']
sung = lambda r: any(l.strip() and not l.strip().startswith('[') for l in r['lyrics'].split('\n'))
print(f"voiced {len(v)}: voices in the caption {sum(bool(re.search(r'\b(voices?|choir|vocals?)\b', r['caption'], re.I)) for r in v)}, lines to sing {sum(map(sung, v))}")
print('words', min(r['words'] for r in rows), '-', max(r['words'] for r in rows), '; took', sorted(r['took'] for r in rows)[len(rows)//2], 'median', max(r['took'] for r in rows), 'longest')
print('with a course:', sum(bool(re.search(r'\b(opens?|begins?|starts?)\b', r['caption'], re.I) and re.search(r'midway|halfway|mid-way|\bthen\b', r['caption'], re.I) and re.search(r'\b(ends?|close|fades?|fading|settles?)\b', r['caption'], re.I)) for r in rows), 'of', len(rows))
print('repeated tags:', sum(r['lyrics'].count('[Middle') > 1 for r in rows), '; thriller:', sum('thriller' in r['caption'].lower() for r in rows))
words = 'high|bright|shimmer|crystalline|sparkl|sharp|stark|dissonan|scrap|jagged'
print('thin-sounding words per caption, outside thriller:', round(sum(len(re.findall(words, r['caption'], re.I)) for r in rows if 'thriller' not in r['caption'].lower()) / max(1, sum('thriller' not in r['caption'].lower() for r in rows)), 2))
opens = re.compile(r"\b(opens?|begins?|starts?)\b[^.;]*?\b(sustained|held|drone|pedal|swell|single|silence)\b", re.I)
print('opens on a held sound:', sum(bool(opens.search(r['caption'])) for r in rows), '; a drone word anywhere outside thriller:', sum(bool(re.search(r'sustain|drone|pedal|\bheld\b', r['caption'], re.I)) for r in rows if 'thriller' not in r['caption'].lower()))
print('battle words:', sum(bool(re.search(r'aggressive|brutal|violent|frantic|epic|battle', r['caption'], re.I)) for r in rows))
from collections import Counter
print('shapes:', Counter(r.get('shape') for r in rows), '; danger:', [(i, r['replay'][12:20], r['frame']) for i, r in enumerate(rows) if r.get('shape') == 'danger'])
