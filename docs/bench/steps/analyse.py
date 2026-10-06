# Strips of the steps, the step counts side by side with face close-ups, and how far each is from 40.
from PIL import Image, ImageDraw, ImageFont
import numpy as np, glob, re
from scipy.ndimage import gaussian_filter
try: font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 30)
except Exception: font = None

def steps(d):
    return {int(re.search(r'step(\d+)of', f).group(1)): f for f in glob.glob(f'{d}/*step*of*.png')}

def grid(files, picks, cols, w, out, label='step'):
    tiles = [(k, Image.open(files[k]).convert('RGB').resize((w, w), Image.LANCZOS)) for k in picks]
    rows = -(-len(tiles) // cols); pad = 42
    g = Image.new('RGB', (cols * (w + 8), rows * (w + pad)), 'white'); d = ImageDraw.Draw(g)
    for i, (k, t) in enumerate(tiles):
        x, y = (i % cols) * (w + 8), (i // cols) * (w + pad)
        g.paste(t, (x, y + pad - 4)); d.text((x + 4, y + 4), f'{label} {k}', fill='black', font=font)
    g.save(out, 'WEBP', quality=92, method=6)

s40 = steps('steps40'); s10 = steps('steps10')
grid(s40, list(range(0, 41)), 7, 400, 'grid-40.webp')
grid(s40, [1, 8, 14, 18, 22, 26, 30, 34, 40], 9, 512, 'strip-40.webp')
grid(s10, list(range(1, 11)), 10, 512, 'strip-10.webp')

def ssim(a, b):
    a = a.astype(float); b = b.astype(float); C1, C2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    mu_a, mu_b = gaussian_filter(a, 1.5), gaussian_filter(b, 1.5)
    va = gaussian_filter(a * a, 1.5) - mu_a ** 2; vb = gaussian_filter(b * b, 1.5) - mu_b ** 2
    cov = gaussian_filter(a * b, 1.5) - mu_a * mu_b
    return float((((2 * mu_a * mu_b + C1) * (2 * cov + C2)) / ((mu_a ** 2 + mu_b ** 2 + C1) * (va + vb + C2))).mean())

counts = [10, 15, 20, 25, 30, 40]
img = {n: Image.open(f's{n}.png').convert('RGB') for n in counts}
gray = {n: np.asarray(img[n].convert('L')) for n in counts}
rgb = {n: np.asarray(img[n]).astype(int) for n in counts}
print('steps | vs 40: mean change, SSIM | vs the previous count: mean change, SSIM')
prev = None
for n in counts:
    line = f'{n:5} | {np.abs(rgb[n]-rgb[40]).mean():5.1f}, {ssim(gray[n], gray[40]):.3f}'
    if prev: line += f' | {np.abs(rgb[n]-rgb[prev]).mean():5.1f}, {ssim(gray[n], gray[prev]):.3f}'
    print(line); prev = n

faces = {'Elara': (600, 90, 760, 230), 'Kael': (200, 360, 360, 530)}
rows = [('whole', None)] + list(faces.items())
w = 512; pad = 42
g = Image.new('RGB', (len(counts) * (w + 8), len(rows) * (w + pad)), 'white'); d = ImageDraw.Draw(g)
for r, (name, box) in enumerate(rows):
    for c, n in enumerate(counts):
        t = img[n] if box is None else img[n].crop(box)
        t = t.resize((w, int(w * t.height / t.width)), Image.LANCZOS)
        x, y = c * (w + 8), r * (w + pad)
        g.paste(t, (x, y + pad - 4)); d.text((x + 4, y + 4), f'{n} steps' + ('' if box is None else f' · {name}'), fill='black', font=font)
g.save('counts.webp', 'WEBP', quality=92, method=6)
