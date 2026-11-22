import subprocess, sys, os
S, D = sys.argv[1], sys.argv[2]
FONT = '/System/Library/Fonts/SFNS.ttf'
items = [
 ('refs-pc/compare.jpg', '01-noise-replay-first-run.jpg', ['First PC run, every render at seed 7, the same seed the portraits were made with.', 'Top: portraits (Mac, then PC). Middle: Mac Frames 6, 9, 12 without, then with portraits. Bottom: PC the same; the three with portraits came back as garish copies of a portrait.']),
 ('refs-pc/app-edit.jpg', '02-noise-replay-app-edit.jpg', ["The app's own Qwen-Image 2.1 edit, seed 7 on a seed-7 picture: \"make the dress deep red\".", 'Left: the picture. Right: the edit, repainted garishly, the dress barely changed. First blamed on a ComfyUI regression; it was the seed.']),
 ('refs-pc/seed8.jpg', '03-noise-replay-fixed-by-seed.jpg', ['The same at seed 8.', 'Left: the picture. Middle: Frame 9 with both portraits, the scene composed. Right: the app edit, the dress red and nothing else changed.']),
 ('refs-pc/compare-s8.jpg', '04-one-pass-faces-hold.jpg', ['One pass: portraits passed into the render (PC, Frames at seed 8).', 'Top: the two portraits, then Frames 6, 9, 12 without portraits. Bottom: Frames 6, 9, 12 with them.']),
 ('refs-pc/composition.jpg', '05-composition-tries.jpg', ['Composition tries, Frames 9 (top) and 12 (bottom).', 'Columns: without portraits, with them, "take only faces and hair", the portrait sentence after the scene, full-length portraits.']),
 ('refs-pc/faces12.jpg', '06-composition-tries-kael-face.jpg', ["Kael's face from Frame 12 in each try.", 'Portrait, without portraits, with them, reworded, sentence after, full-length portraits.']),
 ('refs-pc/three.jpg', '07-one-pass-three-people.jpg', ['Three people, 1216x832. Top: the three portraits (Bram is made up).', 'Bottom left: without portraits, Kael missing (no one described in that prompt). Bottom right: with portraits, all three as their portraits.']),
 ('refs-pc/scenes-a.jpg', '08-one-pass-scenes-a.jpg', ['One pass across scenes. Rows: close-up, profile, the quay at dawn.', 'Columns: seed 8 without, seed 8 with the portrait, seed 9 without, seed 9 with. Faces hold; the profile turns to three-quarter.']),
 ('refs-pc/scenes-b.jpg', '09-one-pass-scenes-b-the-pull.jpg', ['One pass across scenes. Rows: Elara in a blue gown (clothes named), Elara crying (clothes not named).', "Columns as before. Named clothes stay; with portraits she stops crying and wears the portrait's black."]),
 ('refs-pc/scenes-word.jpg', '10-pull-wording-tried.jpg', ['Trying to loosen the pull with words: "take only the face and hair, not the expression, pose or clothes".', 'Per seed: without, the usual wording, the new wording. Rows: crying, profile. No change.']),
 ('refs-pc/loosen.jpg', '11-pull-crop-and-size-tried.jpg', ['Trying to loosen the pull: face crops and 512 px references.', 'Rows: crying seed 8, 9, profile seed 8, 9. Columns: without, portrait, face crop, 512 px, crop at 512. No change.']),
 ('refs-pc/face-edit.jpg', '12-two-pass-face-edit.jpg', ['Two passes: render without portraits, then repaint only the face with the portrait.', 'Columns: portrait, without, one pass, two passes. The tears and the profile are kept.']),
 ('refs-pc/seams.jpg', '13-two-pass-close-up.jpg', ['The two-pass faces at full size: no seam at the edges of the box.', '']),
 ('refs-mac/mac.jpg', '14-mac-mflux-both-ways.jpg', ['The same on the Mac with mflux (PC portraits and pictures).', 'Columns: mflux without, mflux one pass, the PC picture, mflux two passes, ComfyUI two passes. Same behaviour, about 5x slower.']),
 ('refs-pc/others-flux.jpg', '15-other-models-flux3-klein.jpg', ['FLUX.3 Klein. Rows: crying 8, 9, profile 8, 9.', 'Columns: its render without, its render with the portrait, the Qwen picture, its face edit (barely transfers the face).']),
 ('refs-pc/others-turbo.jpg', '16-other-models-qwen-turbo.jpg', ['Qwen-Image 2.1 Turbo. Rows: crying 8, 9, profile 8, 9.', 'Columns as before. Its face edit transfers the face; the tears lost on seed 8.']),
 ('refs-pc/others-fibo.jpg', '17-other-models-fibo2-edit-turbo.jpg', ['FIBO 2.0 Edit Turbo. Rows: crying 8, 9, profile 8, 9.', 'Columns as before. Its face edit drew her face larger, so the box edge cuts across her mouth; it also turns the profile.']),
 ('refs-pc/two-faces.jpg', '18-two-faces-first-wording.jpg', ['Two faces, first wording. Top: portraits. Rows: seed 8, 9.', 'Columns: the picture, one edit for both (only Kael changed), two edits in a row (both changed). Concluded wrongly: one face per edit.']),
 ('refs-pc/checks-two.jpg', '19-two-faces-it-was-the-wording.jpg', ['Checked after the owner asked: one edit, other wordings. Rows: seed 8, 9.', 'Columns: picture, first wording (Kael only), Elara named first (Elara only), each area named (both, in one pass).']),
 ('refs-pc/newcomer.jpg', '20-no-portrait-newcomer.jpg', ["Bram without a portrait. Left: Bram's portrait.", 'Rows: seed 8, 9. Columns: no portraits, Kael and Elara portraits. Bram keeps his own face, but young: the prompt never described him.']),
 ('refs-pc/checks-bram.jpg', '21-newcomer-described.jpg', ["Bram described in the prompt, first. Rows: seed 8, 9.", 'Columns: no portraits, Kael and Elara portraits. Bald and braided both ways. First blamed on prompt order; the old prompt had no looks at all.']),
 ('refs-pc/found.jpg', '22-heads-found-automatically.jpg', ["Heads found by Qwen3-VL (already loaded for Qwen-Image 2.1), in 2-3 s each.", 'Crying 8, 9, profile; the quay 8, 9 and Frame 9, labelled left and right.']),
 ('refs-pc/auto.jpg', '23-whole-chain-automatic.jpg', ['The whole chain with no hand: found boxes as the mask, one edit for both faces.', "Quay before, after (a line across Kael's neck where the box ends), Frame 9 before, after."]),
]
from PIL import Image, ImageDraw, ImageFont
f1 = ImageFont.truetype(FONT, 22); f2 = ImageFont.truetype(FONT, 18)
def wrap(d, text, font, width):
    words, out, cur = text.split(), [], ''
    for w in words:
        nxt = (cur + ' ' + w).strip()
        if d.textlength(nxt, font=font) > width and cur: out.append(cur); cur = w
        else: cur = nxt
    return out + ([cur] if cur else [])
probe = ImageDraw.Draw(Image.new('RGB', (1, 1)))
for src, dst, lines in items:
    im = Image.open(f'{S}/{src}').convert('RGB')
    if im.width > 1600: im = im.resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS)
    rows = [(l, f1, (255, 255, 255), 32) for l in wrap(probe, lines[0], f1, im.width - 32)]
    rows += [(l, f2, (187, 187, 187), 26) for l in wrap(probe, lines[1], f2, im.width - 32)] if lines[1] else []
    h = 16 + sum(r[3] for r in rows) + 8
    out = Image.new('RGB', (im.width, im.height + h), (20, 20, 20)); out.paste(im, (0, h))
    d = ImageDraw.Draw(out); y = 12
    for text, font, colour, step in rows: d.text((16, y), text, font=font, fill=colour); y += step
    out.save(f'{D}/{dst}', quality=82)
print('ok')
