"""Contact sheets of the camera bench's renders (README.md), from out/ into grids/:

- targets-<model>: a row per close-up Action, the prompt as the Chain writes it today (trimmed)
  beside the scene kept whole, and the baseline on top;
- first-<model>: the close-ups with the scene whole, the camera sentence in its place and first,
  and the trimmed prompt; then the angles, in place and first;
- edits: a row per camera move, a column per edit model, from the baseline on top.

    uv run --with pillow docs/bench/camera/grid.py
"""

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

HERE = Path(__file__).parent
MODELS = ["qwen-image-2.1", "krea-2", "moss-image"]
WIDTH = 480  # each picture
LABEL = 30


def sheet(title: str, columns: list[str], rows: list[tuple[str, list]], path: Path) -> None:
    """A row per label, its pictures side by side under the column headings."""
    font = ImageFont.load_default(size=18)
    # Tall enough for the tallest picture at the column's width; each fits its cell, its shape kept.
    sizes = [Image.open(f).size for _, fs in rows for f in fs if f and f.exists()]
    height = max(round(h * WIDTH / w) for w, h in sizes)
    out = Image.new("RGB", (WIDTH * len(columns), (height + LABEL) * len(rows) + LABEL * 2), "white")
    draw = ImageDraw.Draw(out)
    draw.text((8, 6), title, fill="black", font=font)
    for c, name in enumerate(columns):
        draw.text((c * WIDTH + 8, LABEL + 6), name, fill="black", font=font)
    for r, (label, files) in enumerate(rows):
        y = LABEL * 2 + r * (height + LABEL)
        draw.text((8, y + 6), label, fill="black", font=font)
        for c, f in enumerate(files):
            if f and f.exists():
                picture = ImageOps.contain(Image.open(f).convert("RGB"), (WIDTH, height))
                out.paste(picture, (c * WIDTH + (WIDTH - picture.width) // 2, y + LABEL))
    out.save(path, quality=85)
    print(path)


def firsts(grids: Path) -> None:
    first, targets = HERE / "out" / "first", HERE / "out" / "targets"
    if not (first / "prompts.json").exists():
        return
    told = json.loads((first / "prompts.json").read_text())
    for model in MODELS:
        rows = []
        for i, action in enumerate(told["targets"], 1):
            rows.append((action, [
                targets / f"{model}-{i:02d}-whole.png",
                first / f"{model}-t{i}-first.png",
                targets / f"{model}-{i:02d}-trimmed.png",
            ]))
        for i, action in enumerate(told["angles"], 1):
            rows.append((action, [first / f"{model}-a{i}-in-place.png", first / f"{model}-a{i}-first.png", None]))
        sheet(f"{model}: the scene whole", ["camera sentence in its place", "camera sentence first", "trimmed (today)"], rows, grids / f"first-{model}.jpg")


def edits(grids: Path) -> None:
    out = HERE / "out" / "edits"
    if not (out / "edits.json").exists():
        return
    told = json.loads((out / "edits.json").read_text())
    models = ["qwen-image-2.1-edit", "qwen-image-2.1-turbo-edit", "flux3-klein-edit", "fibo-2.0-edit-turbo"]
    find = lambda stem: next(iter(out.glob(f"{stem}.*")), None)
    rows = [("Baseline (Qwen-Image 2.1's render)", [out / "baseline.png", None, None, None])]
    for i, instruction in enumerate(told["edits"], 1):
        rows.append((instruction[:110], [find(f"{m}-e{i}") for m in models]))
    sheet("Camera moves as edits", models, rows, grids / "edits.jpg")


def main() -> None:
    out, grids = HERE / "out" / "targets", HERE / "grids"
    grids.mkdir(exist_ok=True)
    actions = json.loads((out / "prompts.json").read_text())["actions"]
    font = ImageFont.load_default(size=18)
    for model in MODELS:
        files = {f.stem.removeprefix(f"{model}-"): f for f in out.glob(f"{model}-*.png")}
        if not files:
            continue
        rows = [("Baseline: the scene as written", files.get("00-baseline"), None)]
        for i, action in enumerate(actions, 1):
            n = f"{i:02d}"
            rows.append((action, files.get(f"{n}-trimmed"), files.get(f"{n}-whole")))
        first = Image.open(next(iter(files.values())))
        height = round(first.height * WIDTH / first.width)
        sheet = Image.new("RGB", (WIDTH * 2, (height + LABEL) * len(rows) + LABEL), "white")
        draw = ImageDraw.Draw(sheet)
        draw.text((8, 6), f"{model}: trimmed (as the Chain writes it today)", fill="black", font=font)
        draw.text((WIDTH + 8, 6), "whole scene, same camera sentence", fill="black", font=font)
        for r, (label, left, right) in enumerate(rows):
            y = LABEL + r * (height + LABEL)
            draw.text((8, y + 6), label, fill="black", font=font)
            for c, f in enumerate((left, right)):
                if f:
                    sheet.paste(Image.open(f).convert("RGB").resize((WIDTH, height)), (c * WIDTH, y + LABEL))
        sheet.save(grids / f"targets-{model}.jpg", quality=85)
        print(grids / f"targets-{model}.jpg")


def wordings(grids: Path) -> None:
    out = HERE / "out" / "edits"
    if not (out / "wordings.json").exists():
        return
    told = json.loads((out / "edits.json").read_text())["edits"]
    rows = [(f"{i}. {t[:100]}", [out / f"qwen-image-2.1-turbo-edit-e{i}.png", out / f"turbo-B-e{i}.png", out / f"turbo-C-e{i}.png"]) for i, t in enumerate(told, 1)]
    sheet("Qwen-Image 2.1 Turbo Edit, three wordings", ["A: what the result shows", "B: keep everything, the move, each person", "C: the move, then keep everything else"], rows, grids / "wordings.jpg")


def nexts(grids: Path) -> None:
    out = HERE / "out" / "edits"
    if not (out / "next.json").exists():
        return
    told = json.loads((out / "next.json").read_text())
    rows = [(f"{t['name']}: {t['instruction'][:95]}", [out / t["from"], out / f"turbo-{t['name']}.png"]) for t in told]
    sheet("Qwen-Image 2.1 Turbo Edit: short words, fixes, moves in a row", ["from", "edited"], rows, grids / "next.jpg")


def wider(grids: Path) -> None:
    out = HERE / "out" / "wider"
    if not (out / "wider.json").exists():
        return
    told = json.loads((out / "wider.json").read_text())
    labels = ["low", "high", "overhead", "Dutch", "close-up: face", "close-up: hands", "close-up: feet", "over the shoulder"]
    for label, key, base in [("solo", "solo", "solo-baseline"), ("two-43", "two", "two-43-baseline")]:
        rows = [("Baseline", [out / f"{base}.png"])] + [
            (f"{labels[i - 1]}: {t[:90]}", [out / f"{label}-e{i}.png"]) for i, t in enumerate(told[key], 1)
        ]
        # Two per row, to keep the sheet short.
        pairs = [(f"{a[0]}  |  {b[0] if b else ''}"[:150], a[1] + (b[1] if b else [None])) for a, b in zip(rows[::2], rows[1::2] + [None])]
        sheet(f"Qwen-Image 2.1 Turbo Edit, wider check: {label}", ["", ""], pairs, grids / f"wider-{label}.jpg")


def untried(grids: Path) -> None:
    out = HERE / "out" / "untried"
    if not (out / "untried.json").exists():
        return
    told = json.loads((out / "untried.json").read_text())
    labels = ["waist up", "legs", "wider", "POV", "extreme close-up: eyes", "from behind"]
    rows = [("Baselines", [out / "two-baseline.png", out / "solo-baseline.png"])] + [
        (f"{labels[i]}", [out / f"two-u{i + 1}.png", out / f"solo-u{i + 1}.png"]) for i in range(len(labels))
    ]
    sheet("Turbo Edit, moves not tried before", ["two people", "one man"], rows, grids / "untried.jpg")


if __name__ == "__main__":
    main()
    firsts(HERE / "grids")
    edits(HERE / "grids")
    wordings(HERE / "grids")
    nexts(HERE / "grids")
    wider(HERE / "grids")
    untried(HERE / "grids")
