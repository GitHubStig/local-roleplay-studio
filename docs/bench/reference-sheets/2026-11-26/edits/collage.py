"""Rows of pictures side by side, each captioned, as one JPEG: the stage 5 bench's figures.
Usage: uv run --with pillow python -I collage.py <out.jpg> <row> [<row>…], each row
"caption=path|caption=path|…". Every tile is scaled to 360 px tall."""
import sys
from PIL import Image, ImageDraw

HEIGHT, PAD, CAPTION = 360, 8, 22

def tile(path):
    im = Image.open(path).convert('RGB')
    return im.resize((round(im.width * HEIGHT / im.height), HEIGHT))

out, rows = sys.argv[1], [[c.split('=', 1) for c in r.split('|')] for r in sys.argv[2:]]
tiles = [[(caption, tile(path)) for caption, path in row] for row in rows]
width = max(sum(t.width + PAD for _, t in row) + PAD for row in tiles)
sheet = Image.new('RGB', (width, len(tiles) * (HEIGHT + CAPTION + PAD) + PAD), 'white')
draw = ImageDraw.Draw(sheet)
y = PAD
for row in tiles:
    x = PAD
    for caption, t in row:
        draw.text((x, y), caption, fill='black')
        sheet.paste(t, (x, y + CAPTION))
        x += t.width + PAD
    y += HEIGHT + CAPTION + PAD
sheet.save(out, quality=85)
