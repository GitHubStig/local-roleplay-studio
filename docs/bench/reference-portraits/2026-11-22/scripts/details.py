import sys
from PIL import Image, ImageDraw, ImageFont
S, D = sys.argv[1], sys.argv[2]
FONT = '/System/Library/Fonts/SFNS.ttf'
f1, f2, f3 = ImageFont.truetype(FONT, 24), ImageFont.truetype(FONT, 19), ImageFont.truetype(FONT, 18)
P, M = f'{S}/refs-pc', f'{S}/refs-mac'
def tile(path, box=None, size=None):
    im = Image.open(path).convert('RGB')
    if box: im = im.crop(box)
    if size: im = im.resize(size, Image.LANCZOS)
    return im
def wrap(d, text, font, width):
    out, cur = [], ''
    for w in text.split():
        nxt = (cur + ' ' + w).strip()
        if d.textlength(nxt, font=font) > width and cur: out.append(cur); cur = w
        else: cur = nxt
    return out + ([cur] if cur else [])
def sheet(name, title, sub, tiles, labels):
    w = sum(t.width for t in tiles) + 8 * (len(tiles) - 1); h = max(t.height for t in tiles)
    probe = ImageDraw.Draw(Image.new('RGB', (1, 1)))
    rows = [(l, f1, (255, 255, 255), 34) for l in wrap(probe, title, f1, w - 32)] + [(l, f2, (187, 187, 187), 28) for l in wrap(probe, sub, f2, w - 32)]
    top = 16 + sum(r[3] for r in rows) + 6; lab = 34
    out = Image.new('RGB', (w, top + h + lab), (20, 20, 20)); d = ImageDraw.Draw(out); y = 12
    for text, font, colour, step in rows: d.text((16, y), text, font=font, fill=colour); y += step
    x = 0
    for t, l in zip(tiles, labels):
        out.paste(t, (x, top)); d.text((x + 10, top + h + 7), l, font=f3, fill=(220, 220, 220)); x += t.width + 8
    out.save(f'{D}/{name}', quality=86)
CRY = (276, 26, 724, 474); PRO = (346, 27, 826, 507); QUAY = (160, 20, 800, 468)
sheet('d1-crying-one-pass-vs-two.jpg', 'Elara crying, seed 8, full resolution.', 'One pass loses the crying face (a faint tear stays); two passes keep it, with the portrait\'s face.',
      [tile(f'{P}/portrait-elara.png', (232, 70, 792, 630), (448, 448)), tile(f'{P}/sc-cry-plain-8.png', CRY), tile(f'{P}/sc-cry-refs-8.png', CRY), tile(f'{P}/fe-cry-8.png', CRY)],
      ['portrait', 'without portraits', 'one pass', 'two passes'])
sheet('d2-profile-one-pass-vs-two.jpg', 'Kael in profile, seed 8, full resolution.', 'One pass turns him to three-quarter; two passes keep the profile with the portrait\'s face.',
      [tile(f'{P}/portrait-kael.png', (240, 60, 800, 620), (480, 480)), tile(f'{P}/sc-profile-plain-8.png', PRO), tile(f'{P}/sc-profile-refs-8.png', PRO), tile(f'{P}/fe-profile-8.png', PRO)],
      ['portrait', 'without portraits', 'one pass', 'two passes'])
sheet('d3-quay-two-faces-one-edit.jpg', 'Two faces in one edit, seed 8, full resolution.', 'Each painted area given its person, in one pass; then the same with the areas found by Qwen3-VL, no hand.',
      [tile(f'{P}/sc-far-plain-8.png', QUAY), tile(f'{P}/expl-8.png', QUAY), tile(f'{P}/auto-far-8.png', QUAY)],
      ['the picture', 'one edit, areas by hand', 'one edit, areas found'])
sheet('d4-three-portraits.jpg', 'The three portraits, made once each (Qwen-Image 2.1, seed 7).', 'Kael and Elara from the tavern scenario\'s Look; Bram made up for the three-person tests.',
      [tile(f'{P}/portrait-kael.png', size=(640, 640)), tile(f'{P}/portrait-elara.png', size=(640, 640)), tile(f'{P}/bram.png', size=(640, 640))], ['Kael', 'Elara Vance', 'Bram'])
sheet('d5-three-people.jpg', 'Three people at 1216x832, seed 8: without and with the three portraits.', 'Without, Kael is missing (that prompt described no one\'s looks); with them, all three as their portraits.',
      [tile(f'{P}/t-plain-land.png'), tile(f'{P}/t-refs-land.png')], ['without portraits', 'with the three portraits'])
sheet('d6-noise-replay.jpg', 'Noise replay, full resolution: the app\'s edit at the picture\'s own seed.', '"Make the woman\'s white dress deep red", seed 7 on a seed-7 picture, then seed 8.',
      [tile(f'{P}/plain-9.png', size=(768, 768)), tile(f'{P}/app-edit-9.png', size=(768, 768)), tile(f'{P}/app-edit-9-s8.png', size=(768, 768))], ['the picture (seed 7)', 'edit at seed 7', 'edit at seed 8'])
sheet('d7-two-passes-mac-and-pc.jpg', 'Two passes on each machine, from the same picture and portrait.', 'mflux on the Mac (138 s) and ComfyUI on the PC (27 s): the same result.',
      [tile(f'{P}/sc-cry-plain-8.png', CRY), tile(f'{M}/m-fe-cry-8.png', CRY), tile(f'{P}/fe-cry-8.png', CRY)], ['the picture', 'Mac, mflux', 'PC, ComfyUI'])
sheet('d8-flaws.jpg', 'One flaw, twice: a seam where the painted box ends.', 'The edit draws the head a little larger or higher than before, so the hard edge of the box shows the join: across Kael\'s neck (Qwen-Image 2.1, box found by Qwen3-VL), and across Elara\'s mouth (FIBO 2.0 Edit Turbo, her mouth pushed below the box). To fix: a softened edge, or a box with room around the head.',
      [tile(f'{P}/auto-far-8.png', (190, 200, 510, 460), (640, 520)), tile(f'{P}/o-fibo-cry-face-8.png', (360, 230, 660, 530), (520, 520))], ['Kael: the line at the neck', 'Elara (FIBO): the join below the nose'])
print('ok')
