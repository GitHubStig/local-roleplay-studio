# Ollama: findings

How Ollama, the Text Model's backend on both machines, pulls, builds, loads and runs models, as found while choosing the Text Model ([text-models.md](text-models.md)). Ollama updates itself from its menu-bar app, often, so there's no upgrade routine: the owner reads each release's notes, and anything worth measuring goes under "To check" below, then into a dated section once it's run. Say which machine and which Ollama version every number is from.

## Versions seen

| Ollama | Where | When |
|---|---|---|
| 0.35.1 | Mac | 2026-10-05: the Text Model survey and builds |
| 0.40.0 | Windows PC | 2026-10-07: the GGUF on the RTX 4070 |
| 0.40.5 | both | 2026-10-16: the Mac-against-PC timing |
| 0.40.12 | both | installed on 2026-10-28 |

## Pulling and building models (2026-10-05, Ollama 0.35.1)

### Pulling GGUFs from Hugging Face

`ollama pull hf.co/{user}/{repo}:{quant}` works for any public GGUF repo. The quant name is case
insensitive, and the full file name also works as a tag
([Hugging Face docs](https://huggingface.co/docs/hub/ollama)). Ollama 0.30 added "improved
performance and GGUF model compatibility through llama.cpp" alongside the MLX engine
([Ollama blog, 2026-06-05](https://ollama.com/blog)). The installed
`pdurlej/gemma-4-26B-A4B-it-heretic` is a community Gemma 4 GGUF, and `ollama show` reports
`gemma4` architecture with thinking levels `false, true` and Apache 2.0. So community Gemma 4
GGUFs do get thinking control. For each new pull, check `ollama show <name>` for the
architecture, thinking levels and template before benchmarking.

### Building an MLX model from a Heretic checkpoint

Ollama's MLX engine runs safetensors models, and llama.cpp runs GGUFs
([Ollama blog](https://ollama.com/blog)). `ollama create` can quantize a safetensors import as it
creates it: `-q, --quantize string  Quantize safetensors model to this level (e.g. nvfp4)`
(local `ollama create --help`, 0.35.1; the
[source](https://github.com/ollama/ollama/blob/main/cmd/cmd.go) rejects this for GGUF imports).
The import itself is a Modelfile with `FROM /path/to/safetensors/directory`
([import docs](https://github.com/ollama/ollama/blob/main/docs/import.mdx)). Ollama's
[MLX performance post](https://ollama.com/blog/mlx-performance) (2026-06-11) measured Gemma 4 12B
and found that NVFP4 "roughly halves the quality loss of 4-bit quantization, relative to
unquantized BF16" compared with q4_K_M, and "generates about 20% faster than q4_K_M".

Whether `ollama create` accepts a directory that is *already* MLX-quantized, such as
[ailexleon/gemma-4-12B-it-qat-uncensored-heretic-mlx-4Bit](https://huggingface.co/ailexleon/gemma-4-12B-it-qat-uncensored-heretic-mlx-4Bit)
(6.77 GB, made with mlx-vlm 0.6.5 from llmfan46's QAT ARA heretic), is **not verified**. The
create help also lists a `--force` flag to "Continue local creation when MLX validation fails",
which suggests creation validates the model against the MLX engine.

### Memory and context

*Superseded:* the survey (2026-10-05) noted that the app sets no `num_ctx`, so Ollama picks the context from the memory it sees. It still sets none, and how long a context a Roleplay needs, and what it costs a GGUF on a 12 GB card, is in the README ("Ollama's context length").

### Structured outputs

Every candidate goes through the same Ollama `format` JSON schema
([structured outputs](https://github.com/ollama/ollama/blob/main/docs/capabilities/structured-outputs.mdx)).
The installed MLX (`orcarouter …:mlx-4bit`) and GGUF (`pdurlej …`) models both already produce
the app's schemas, so both engines handle `format`. No source reports schema reliability for any
of these specific small models. The harness's Reply and Art cuts are the test. Watch for the two
Gemma traps already recorded: blank lines until the token cap when yes/no fields come first, and
runaway whitespace ([text-models.md](text-models.md)).

### What `ollama create` can and can't build

**Converting to MLX saves little memory; bits do.** Memory is the weights times the bits per
weight, and the 4-bit formats store about the same (Q4_K_M about 4.8 bits a weight, NVFP4 about
4.5): the 12B went from 9.5 GB to 8.1. What MLX buys is speed. Ollama 0.35.1's `create -q` offers
only `int4`, `int8`, `nvfp4`, `mxfp4` and `mxfp8`, so nothing under 4 bits can be built this way.

**mlx-community's ready-made MLX models don't run in Ollama when they're mixtures of experts.**
`mlx-community/gemma-4-26B-A4B-it-heretic-4bit` (and its 2.6-bit sibling) imported with
`ollama create` from the folder, but every request failed with "mlx runner failed: layer 0: missing
MoE expert weights". mlx-vlm, which converted them, splits each layer's experts into three
quantized matrices (`experts.switch_glu.gate_proj`, `up_proj`, `down_proj`); Ollama's runner wants
the original layout (`experts.gate_up_proj`, `experts.down_proj`), which only an `ollama create -q`
from the full-precision weights writes (2026-10-05).

## Loading and speed, Mac against PC (2026-10-16)

A raw timing of Ollama, outside the app, to choose which machine to test text-only features on. Both used Ollama 0.40.5 and the same script, which unloads every model, then sends one cold request and warm ones through `/api/chat` (`num_ctx` 16384, temperature 0, seed 42, at most 300 tokens out, Thinking off). The short prompt is the tavern Scenario with a request for the innkeeper's opening line (672 tokens). The long one repeats the Scenario to 8,218 tokens, about a 30-Frame Roleplay's history. One run each. The machines ran different models (the Mac's 12B wasn't run), so this compares each machine's best Text Model, not one model on two machines.

| | PC: 12B Heretic GGUF Q4_K_M | Mac: 26B-A4B Heretic NVFP4 |
|---|---|---|
| Loaded (`ollama ps`) | 8.3 GB, 100% GPU | 19 GB, MLX |
| Cold request (load) | 13.6 s (9.4 s) | **7.1 s (2.9 s)** |
| Warm, short prompt | 4.1–4.2 s | **3.6 s** |
| Long prompt, first read | **7.6 s** | 8.5 s |
| Long prompt, read again from Ollama's cache | 4.2 s | 4.1 s |
| Writing | ~52 tok/s, 49 after the long prompt | **70 tok/s**, 54 after the long prompt |
| Reading a new prompt | **~2,600–2,950 tok/s** (1,500 cold) | 1,200–1,800 tok/s |

The PC's load may have come from Windows' file cache, as the app had the model loaded just before. The two come out about even: the Mac's 26B loads three times as fast and writes faster, and the PC reads a new prompt about 1.5× as fast. In a running Roleplay most of the history comes from Ollama's cache, so writing speed counts most there. The Mac's 12B wasn't measured here: from the per-Action timings above, it would be slower than the PC's.
