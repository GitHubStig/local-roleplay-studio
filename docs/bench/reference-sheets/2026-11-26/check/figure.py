"""The stage 6 bench's figure: every sheet, a row per Image Model, its check's verdict under it.
    uv run --with pillow python3 -I figure.py <sheets folder> <looks-comfyui.json> <out.jpg>"""
import json, sys
from PIL import Image, ImageDraw, ImageFont

folder, looks_file, out = sys.argv[1:4]
looks = json.load(open(looks_file))
MODELS = ['qwen-image-2.1', 'qwen-image-2.1-turbo', 'krea-2-lora', 'flux3-klein', 'z-image-turbo', 'fibo-2.0-turbo', 'anima-turbo']
COLS = [(s, seed) for s in ('kael', 'elara', 'lantern') for seed in (1, 2)]
TW, TH, CAP, LEFT, TOP = 384, 160, 34, 170, 26
font = ImageFont.load_default(13)
W = Image.new('RGB', (LEFT + TW * len(COLS), TOP + (TH + CAP) * len(MODELS)), 'white')
d = ImageDraw.Draw(W)
for c, (s, seed) in enumerate(COLS):
    d.text((LEFT + c * TW + 6, 6), f'{s}, seed {seed}', fill='black', font=font)
for r, m in enumerate(MODELS):
    y = TOP + r * (TH + CAP)
    d.text((6, y + TH // 2 - 7), m, fill='black', font=font)
    for c, (s, seed) in enumerate(COLS):
        name = f'{m}-{s}-{seed}.png'
        x = LEFT + c * TW
        W.paste(Image.open(f'{folder}/{name}').convert('RGB').resize((TW - 4, TH - 4)), (x + 2, y + 2))
        flaw = looks[name].get('flaw')
        if flaw:
            d.rectangle([x, y, x + TW - 1, y + TH - 1], outline=(220, 30, 30), width=4)
            short = flaw.replace("Its views aren't the front, a three-quarter turn and the profile, in that order", 'views out of order').replace('It has writing on it: ', 'writing: ').replace('It shows the Lantern of Vael ', 'shown ')
            d.text((x + 4, y + TH + 3), short[:58], fill=(200, 0, 0), font=font)
            if len(short) > 58: d.text((x + 4, y + TH + 17), short[58:116], fill=(200, 0, 0), font=font)
        else:
            d.text((x + 4, y + TH + 3), 'fit', fill=(0, 120, 0), font=font)
W.save(out, quality=86)
