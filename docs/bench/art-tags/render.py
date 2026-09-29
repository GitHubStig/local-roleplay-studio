"""
Renders the saved Art Agent prompts on Image Models, and lays each model's pictures out as a grid:
rows are prose, Danbooru-style tags and plain tags; columns Frames 6, 9 and 12. See README.md.

    python3 render.py krea-2 flux2-klein-4b   # render (skipping pictures already in out/), then grid
    python3 render.py --grid-only all          # rebuild grids from out/

Needs mflux on the PATH and Pillow. Full-size pictures go to out/ (not committed); grids to grids/.
"""
import json, re, subprocess, sys, time
from pathlib import Path
from PIL import Image, ImageDraw

HERE = Path(__file__).parent
PROMPTS = HERE / 'prompts' / 'gemma4-31b.json'  # the set every Image Model is compared on
STYLES, FRAMES = ['prose', 'booru', 'plain'], [6, 9, 12]
SEED, SIZE = 7, 512

# As in server/imageModels.ts: id → the mflux command, its model arguments, and default steps.
MODELS = {
    'flux2-klein-4b': ('mflux-generate-flux2', ['--model', 'flux2-klein-4b'], 4),
    'flux2-klein-9b': ('mflux-generate-flux2', ['--model', 'flux2-klein-9b'], 4),
    'z-image-turbo': ('mflux-generate-z-image-turbo',
                      ['--model', 'filipstrand/Z-Image-Turbo-mflux-4bit', '--base-model', 'z-image-turbo'], 9),
    'krea-2': ('mflux-generate-krea2', ['--model', 'krea-2'], 8),
    'ernie-image-turbo': ('mflux-generate-ernie-image-turbo', ['--model', 'ernie-image-turbo'], 8),
    'boogu-image-turbo': ('mflux-generate-boogu', ['--model', 'boogu-image-turbo'], 4),
    'qwen-image-2.1': ('mflux-generate-qwen-2.1', ['--model', 'qwen-image-2.1'], 25),
}


def dress(prompt: str) -> str:
    """The tag sets undressed Elara in 9 and 12; every model was rendered with her in a robe."""
    prompt = re.sub(r'\bElara bare upper body\b', 'Elara robe', prompt, flags=re.I)
    return re.sub(r'\bnude\b', 'robe', prompt, flags=re.I)


def picture(model: str, style: str, frame: int) -> Path:
    return HERE / 'out' / f'{model}-{style}-{frame}.png'


def render(model: str):
    command, args, steps = MODELS[model]
    for row in json.loads(PROMPTS.read_text()):
        out = picture(model, row['style'], row['index'])
        if out.exists():
            continue
        start = time.time()
        subprocess.run([command, *args, '--prompt', dress(row['prompt']), '--seed', str(SEED),
                        '--steps', str(steps), '--width', str(SIZE), '--height', str(SIZE),
                        '--output', str(out)], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print(f'{out.name}  {time.time() - start:.1f} s', flush=True)


def grid(model: str, cell: int = 300):
    image = Image.new('RGB', (60 + cell * 3, 24 + cell * 3), 'white')
    draw = ImageDraw.Draw(image)
    for c, frame in enumerate(FRAMES):
        draw.text((60 + c * cell + cell // 2 - 25, 6), f'Frame {frame}', fill='black')
    for r, style in enumerate(STYLES):
        draw.text((6, 24 + r * cell + cell // 2), style, fill='black')
        for c, frame in enumerate(FRAMES):
            pic = Image.open(picture(model, style, frame)).convert('RGB').resize((cell - 4, cell - 4))
            image.paste(pic, (60 + c * cell, 24 + r * cell))
    out = HERE / 'grids' / f'{model}.jpg'
    image.save(out, quality=80, optimize=True)
    print(f'grids/{out.name}')


if __name__ == '__main__':
    args = sys.argv[1:]
    grid_only = '--grid-only' in args
    models = [a for a in args if a != '--grid-only']
    models = list(MODELS) if models in ([], ['all']) else models
    for m in models:
        if m not in MODELS:
            sys.exit(f'Unknown Image Model {m}; add it to MODELS (see server/imageModels.ts)')
    for m in models:
        if not grid_only:
            render(m)
        grid(m)
