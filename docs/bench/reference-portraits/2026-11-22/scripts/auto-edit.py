import sys, json, subprocess
src = open('two-faces.py').read()
head = src[:src.index("for s in (8, 9):\n    pic = up(")]
g2 = {'__name__': 'x'}; sys.argv = sys.argv[:4]; exec(compile(head, 'two-faces.py', 'exec'), g2)
go, k, e, up = g2['go'], g2['k'], g2['e'], g2['up']
OUT = sys.argv[3]
found = {l.split(' ', 1)[0]: json.loads(l.split(' s ', 1)[1]) for l in open('faces-found.txt')}
def mask(name, boxes, pad=0.08):
    f = []
    for b in boxes:
        x1, y1, x2, y2 = [v * 1024 / 1000 for v in b['bbox_2d']]; px, py = (x2 - x1) * pad, (y2 - y1) * pad
        x1, y1, x2, y2 = max(0, x1 - px), max(0, y1 - py), min(1024, x2 + px), min(1024, y2 + py)
        f.append(f"drawbox=x={int(x1)}:y={int(y1)}:w={int(x2-x1)}:h={int(y2-y1)}:color=white:t=fill")
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=black:s=1024x1024', '-frames:v', '1', '-vf', ','.join(f), f'{OUT}/{name}.png'], check=True)
    return up(f'{OUT}/{name}.png', f'lrs-bench-{name}.png')
EXPL = ("Two areas of image 1 are to be repainted: the left one is the man's head, the right one is the woman's head. "
        "Repaint the left area with the face and hair of the man in image 2, Kael. Repaint the right area with the face and hair of the woman in image 3, Elara Vance. "
        "Both changes are needed. Keep their expressions, the way each of them faces, and everything else exactly as in image 1.")
for pic, seed, out in (('lrs-bench-sc-far-8.png', 9, 'auto-far-8'), ('lrs-bench-plain-9.png', 8, 'auto-frame-9')):
    m = mask(f'automask-{out}', found[pic])
    go(out, image=pic, mask=m, prompt=EXPL, seed=seed, portraits=[k, e])
