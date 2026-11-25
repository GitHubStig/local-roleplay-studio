import sys, runpy
sys.argv = sys.argv[:4] + ['none']
src = open('stage0.py').read()
g = {'__name__': 'stage0'}
exec(compile(src[:src.index("STEP = ")], 'stage0.py', 'exec'), g)
find, mask, edit, log = g['find'], g['mask'], g['edit'], g['log']
CRY = "Give the woman in image 1 the face and hair of the woman in image 2, but keep her expression exactly as it is in image 1: crying, tears running down her cheeks, her face crumpled with grief. Keep the way her head is turned and the light. Change nothing else."
for v in ('elara', 'elara-high'):
    b = find(v, 'the woman')
    edit(f'{v}-fp-named', v, CRY, 10, mask=mask(f'mask-{v}-named', b, 0.2, 24), refs=['sheet-elara'])
# The close-up with one view (the three-quarter, as her head is turned a little) cut from the sheet.
import subprocess
subprocess.run(['uv','run','-q','--with','pillow','python','-c',"from PIL import Image; s=Image.open('sheet-elara.png'); s.crop((512,0,1024,640)).save('view-elara-tq.png')"], check=True)
b = find('elara-face', 'the woman')
edit('elara-face-fp-view', 'elara-face', CRY, 10, mask=mask('mask-elara-face-view', b, 0.08, 24), refs=['view-elara-tq'])
# The lantern, asked for as itself.
ask_find = g['find'].__code__
b = find('lantern', 'the lantern')
if b: edit('lantern-fp-soft', 'lantern', 'Make the lantern in image 1 exactly the lantern in image 2: its shape, its brass and its etched green glass, at the same size and angle and in the same light. Change nothing else.', 10, mask=mask('mask-lantern', b, 0.2, 24), refs=['sheet-lantern'])
log('followup done')
