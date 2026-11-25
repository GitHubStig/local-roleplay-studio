"""The check after a face pass: Qwen3-VL counts the heads; more than before means the sheet was pasted in."""
import json, re
src = open('views.py').read(); g = {'__name__': 'views'}
exec(compile(src[:src.index("ONE = ")], 'views.py', 'exec'), g)
find_angles, log = g['find_angles'], g['log']
PAIRS = [('kael', 'kael-fp-soft'), ('kael-low', 'kael-low-fp-soft'), ('kael-high', 'kael-high-fp-soft'), ('kael-face', 'kael-face-fp-soft'),
         ('elara', 'elara-fp-named'), ('elara-low', 'elara-low-fp-soft'), ('elara-high', 'elara-high-fp-named'), ('elara-face', 'elara-face-fp-soft'),
         ('grax', 'grax-fp-soft'), ('quay', 'quay-fp-view')]
for before, after in PAIRS:
    a = find_angles(after, 'every person or creature')
    b = find_angles(before, 'every person or creature')
    log(f'count {after}: {len(b)} before, {len(a)} after{"  <-- redo" if len(a) > len(b) else ""}')
