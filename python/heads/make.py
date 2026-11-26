# /// script
# requires-python = ">=3.14,<3.15"
# dependencies = [
#   "mflux==0.24.0",
#   "pillow",
# ]
# [tool.uv]
# python-preference = "only-managed"
# ///
"""
Asks the Qwen3-VL inside Qwen-Image 2.1 on mflux (its text encoder, which reads pictures) about a
picture: where the heads are, for the face pass of reference sheets, and whether a sheet is fit to
use (docs/design/pictures.md, `server/heads/`). Run once per picture by the Deno server, with each
question it asks of it, so the model loads once:

    uv run python/heads/make.py --model <repo> --base-model qwen-image-2.1 --image <png> --ask <text> [--ask <text>…]

and prints a line of JSON on stdout: {"replies": <the model's answers, as written, in order>,
"seconds": <the answers'>}. The server reads them, as it does ComfyUI's.

`--quantize` (8 by default, as an edit loads) quantizes the weights as they load. Only the text
encoder is read: MLX loads lazily, so the transformer and VAE never are. mflux keeps the model's
own version, the same as the `mflux` tool the app renders with (0.24.0).

Measured 2026-11-25 on the Mac (M5 Pro, 48 GB): 7–9 s an answer, about 21 s with Python starting
and the model loading, MLX's peak 10.8 GB.
"""
import argparse
import json
import sys
import time

from PIL import Image
from mflux.models.common.resolution.config_resolution import ConfigResolution
from mflux.models.qwen21.variants.edit.qwen_image_21_edit import QwenImage21Edit

parser = argparse.ArgumentParser()
parser.add_argument("--model", required=True)
parser.add_argument("--base-model", required=True)
parser.add_argument("--image", required=True)
parser.add_argument("--ask", required=True, action="append")
parser.add_argument("--quantize", type=int, default=8)
parser.add_argument("--max-tokens", type=int, default=400)
args = parser.parse_args()

config = ConfigResolution.resolve_restricted(
    None, args.base_model, model_path=args.model, extra_keys=("qwen-image-2.1-turbo",), base_model=None
)
model = QwenImage21Edit(
    quantize=args.quantize or None, model_path=args.model, model_config=config
)
picture = Image.open(args.image).convert("RGBA")
start = time.time()
# mflux's own grounding chat, greedy, over a ~512 px copy of the picture.
replies = [model._vision_reply(ask, [picture], args.max_tokens) for ask in args.ask]
print(json.dumps({"replies": replies, "seconds": round(time.time() - start, 1)}))
sys.stdout.flush()
