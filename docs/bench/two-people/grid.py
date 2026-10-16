"""Contact sheets of the two-people bench's renders (README.md): one per variant, a row per Frame
and a column per Image Model, from out/ into grids/.

    python -I docs/bench/two-people/grid.py
"""

import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
MODELS = ["qwen-image-2.1", "flux3-klein"]
WIDTH = 608  # each picture, half of 1216
LABEL = 28


def main() -> None:
    out, grids = HERE / "out", HERE / "grids"
    grids.mkdir(exist_ok=True)
    rows: dict[str, list[str]] = {}
    for f in sorted(out.iterdir()):
        m = re.match(r"(.+)-(f\d+)-(" + "|".join(map(re.escape, MODELS)) + r")\.\w+$", f.name)
        if m:
            rows.setdefault(m[1].rsplit("-", 1)[0], [])
            key = f"{m[1]}-{m[2]}"
            if key not in rows[m[1].rsplit("-", 1)[0]]:
                rows[m[1].rsplit("-", 1)[0]].append(key)
    font = ImageFont.load_default(size=20)
    for variant, keys in rows.items():
        height = round(WIDTH * 832 / 1216)
        sheet = Image.new("RGB", (WIDTH * len(MODELS), (height + LABEL) * len(keys) + LABEL), "white")
        draw = ImageDraw.Draw(sheet)
        for c, model in enumerate(MODELS):
            draw.text((c * WIDTH + 8, 4), model, fill="black", font=font)
        for r, key in enumerate(keys):
            y = LABEL + r * (height + LABEL)
            draw.text((8, y + 4), key, fill="black", font=font)
            for c, model in enumerate(MODELS):
                found = list(out.glob(f"{key}-{model}.*"))
                if found:
                    pic = Image.open(found[0]).convert("RGB").resize((WIDTH, height))
                    sheet.paste(pic, (c * WIDTH, y + LABEL))
        path = grids / f"{variant}.jpg"
        sheet.save(path, quality=82)
        print(path, file=sys.stderr)


if __name__ == "__main__":
    main()
