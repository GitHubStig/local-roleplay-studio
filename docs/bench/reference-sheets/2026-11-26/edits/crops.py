"""Kael's head cropped from each picture given, in rows: `crops.py out.jpg row…`, each row
"caption=path|…"."""
import sys
from PIL import Image, ImageDraw
W, H = 1216, 832
BOX = (int(0.40 * W), int(0.04 * H), int(0.64 * W), int(0.46 * H))
out, rows = sys.argv[1], [[c.split('=', 1) for c in r.split('|')] for r in sys.argv[2:]]
tw, th = BOX[2] - BOX[0], BOX[3] - BOX[1]
cols = max(len(r) for r in rows)
sheet = Image.new('RGB', (cols * (tw + 6) + 6, len(rows) * (th + 26) + 6), 'white')
d = ImageDraw.Draw(sheet)
for y, row in enumerate(rows):
    for x, (cap, path) in enumerate(row):
        px, py = 6 + x * (tw + 6), 6 + y * (th + 26)
        d.text((px, py), cap, fill='black')
        sheet.paste(Image.open(path).convert('RGB').crop(BOX), (px, py + 18))
sheet.save(out, quality=88)
