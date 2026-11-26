"""The camera moves' heads, cropped at full size, a row per head: the edit, then each wording at
seeds 11 and 12. Usage: uv run --with pillow python -I heads.py <folder of passes> <out.jpg>"""
import sys
from PIL import Image, ImageDraw
W, H = 1216, 832
folder, out = sys.argv[1:3]
HEADS = {'low': [(0.18, 0.04, 0.38, 0.34), (0.56, 0.0, 0.76, 0.30)], 'close': [(0.15, 0.0, 0.75, 1.0)]}
COLS = [('edit', 'edit-{k}.png')] + [(f'{v} {s}', f'edit-{{k}}-{v}-seed{s}.png') for v in ('named', 'change') for s in (11, 12)]
rows = []
for k, boxes in HEADS.items():
    for b in boxes:
        box = tuple(int(v * s) for v, s in zip(b, (W, H, W, H)))
        h = round(300 * (box[3] - box[1]) / (box[2] - box[0]))
        rows.append([(c, Image.open(f'{folder}/{p.format(k=k)}').convert('RGB').crop(box).resize((300, h))) for c, p in COLS])
sheet = Image.new('RGB', (len(COLS) * 306 + 6, sum(r[0][1].height + 26 for r in rows) + 6), 'white')
d, y = ImageDraw.Draw(sheet), 6
for r in rows:
    for i, (c, im) in enumerate(r):
        d.text((6 + i * 306, y), c, fill='black')
        sheet.paste(im, (6 + i * 306, y + 18))
    y += r[0][1].height + 26
sheet.save(out, quality=88)
