# Small uncensored Text Models (under ~12 GB)

Which uncensored ("abliterated", "heretic") local language models under about 12 GB could take
over this app's text jobs on a 48 GB Apple Silicon Mac, next to 20–39 GB Image Models? This note
surveys what exists as of **2026-10-05**, run through Ollama (MLX or GGUF), and ends with a
shortlist to benchmark.

Every claim links to the source that owns it: the model card, the Hugging Face file listing, the
ollama.com page, or the leaderboard's own data file. Sizes are the published file or tag sizes.
"Not verified" means exactly that. Nothing was pulled or run. The only local checks were
`ollama list`, `ollama show` on the two installed baselines, `ollama create --help` (Ollama 0.35.1),
and reading the app's code for which Ollama options it sets.

## Summary

- **The best bet is Gemma 4 12B, decensored with Heretic.** It is a dense 12B model that Google
  released in May 2026. Its official scores sit close to the 26B-A4B mixture of experts that this
  app already likes. On EQ-Bench Creative Writing v3 it scores Elo 1288.9 against 1304.6, and on
  Longform 48.7 against 50.7. A Heretic build with very little damage (KL 0.0284, 0/100 refusals)
  is 7.4 GB at Q4_K_M. Its risk is speed: all 12B parameters are active for every token, against
  about 4B for the 26B-A4B.
- **The same weights can run on Ollama's MLX engine** if you build an NVFP4 model from the
  full-precision weights with `ollama create -q nvfp4`. Ollama measured NVFP4 on exactly this
  model, Gemma 4 12B, and found it loses about half as much quality as q4_K_M and generates about
  20% faster. No uncensored Gemma 4 12B MLX tag was found on ollama.com.
- **Qwen3.5-9B Heretic is the best non-Gemma option**: a different model family, KL 0.0241,
  7.4 GB at Q6_K. It is weaker as a writer on the UGI leaderboard, and it thinks by default, so
  Thinking must stay off.
- **The 26B-A4B heretic at 3 bits fits (11.3–11.6 GB),** and it is worth one run because it is an
  exact comparison against the model already measured. But that model already garbles copied
  sentences at Q4_K_M ([models.md](../models.md)), and fewer bits are unlikely to help.
- **Everything else either doesn't fit or is too weak.** Qwen3.6-35B-A3B, GLM-4.7-Flash and
  Nemotron 3.5 Lightning are 30–35B in total, so they fit only at about 2 bits. Gemma 4 E4B,
  Ministral 3, Mistral Nemo, Phi-4 and Granite 4.2 score well below the 12B on the leaderboards,
  in the range where this app's Mistral 7B test failed.

## What the jobs ask for

From [models.md](../models.md): the hard job is the Chain's prompt edit, which rewrites only the
affected sentences of a nine-sentence prompt and copies the rest word for word. Every 4–8B model
measured so far failed it: spark-x2.5 4B, llama3 8B and Mistral 7B abliterated. Even the 26B-A4B
heretic garbled one copied sentence per run. The other jobs went better. On the Art Agent (who is
in the picture), Suggest (the player's terse lowercase style) and Roleplay replies (strict JSON
`{internal, actions, dialogue}`, never acting for the player), the 26B-A4B heretic was the
fastest and good. Mistral 7B acted for the player and broke format.

So the deciding qualities are instruction-following and faithful copying, then writing, then
speed. Refusal removal only has to be good enough: the engine's Limits check everything the model
writes, whichever model wrote it ([ADR 0002](../adr/0002-guardrails-enforced-by-the-engine.md)).

## Reading the abliteration numbers

[Heretic](https://github.com/p-e-w/heretic) removes refusals by directional ablation. It tunes the
ablation by "co-minimizing the number of refusals and the KL divergence from the original model".
Each Heretic model card reports two numbers:

- **Refusals**: how many of 100 harmful prompts were still refused.
- **KL divergence**: how far the model's output moved on harmless prompts. Lower means less
  damage.

For scale, Heretic's own gemma-3-12b-it scored 3/100 refusals at KL 0.16. Earlier hand-made
abliterations of the same model scored KL 0.45 and 1.04 ([Heretic
README](https://github.com/p-e-w/heretic)). The README also warns that the values "might be
platform- and hardware-dependent". Each uploader also picks their own prompt sets, so KL compares
fairly only between builds of the *same* base model, and even then only roughly.

Gemma 4 and Qwen 3.5 are hybrid thinking models. Some abliterations target only the
non-thinking answer. That suits this app, which runs every Text Model with Thinking off
([models.md](../models.md)). One uploader states this outright and recommends thinking off for
roleplay ([igorls/gemma-4-12B-it-heretic](https://huggingface.co/igorls/gemma-4-12B-it-heretic-v1)).

## What the leaderboards say

**UGI leaderboard** ([space](https://huggingface.co/spaces/DontPlanToEnd/UGI-Leaderboard),
[data file](https://huggingface.co/spaces/DontPlanToEnd/UGI-Leaderboard/blob/main/ugi-leaderboard-data.csv),
last updated 2026-10-03). The columns used here are UGI (overall uncensored general intelligence),
W/10 (willingness to answer, out of 10), NatInt (general knowledge and intelligence) and Writing.
Rows are the no-thinking runs where the board has one, since that is how the app runs models:

| Model (as listed) | Total / active params | UGI | W/10 | NatInt | Writing | Tested |
|---|---|---|---|---|---|---|
| llmfan46/gemma-4-26B-A4B-it-ultra-uncensored-heretic | 26B / 4B | 44.96 | 8.8 | 33.71 | 42.12 | 2026-04-20 |
| llmfan46/Qwen3.6-35B-A3B-uncensored-heretic (no think) | 35B / 3B | 44.25 | 9.5 | 28.42 | 37.6 | 2026-04-26 |
| trohrbaugh/Qwen3.5-9B-heretic-v2 (no thinking) | 9B | 37.57 | 9.2 | 16.05 | 32.52 | 2026-04-05 |
| huihui-ai/Huihui-Qwen3.5-9B-abliterated (no thinking) | 9B | 37.63 | 9.0 | 14.88 | 29.12 | 2026-04-05 |
| llmfan46/gemma-4-E4B-it-ultra-uncensored-heretic | 8B / 4.5B | 38.12 | 9.2 | 16.7 | 19.06 | 2026-06-28 |
| coder3101/gemma-4-E4B-it-heretic | 8B / 4.5B | 37.71 | 9.8 | 18.73 | 22.27 | 2026-06-28 |
| p-e-w/phi-4-heretic | 14B | 36.63 | 8.0 | 21.43 | 24.0 | 2025-11-16 |
| mistralai/Ministral-3-14B-Instruct-2512 (original) | 14B | 32.57 | 6.2 | 16.73 | 31.44 | 2025-12-03 |
| p-e-w/Mistral-Nemo-Instruct-2407-heretic-noslop | 12B | 29.48 | 4.2 | 22.19 | 37.64 | 2026-01-13 |

**Gemma 4 12B is not on the UGI board in any form** as of that data file. It came out on
2026-05-23 ([google/gemma-4-12B-it](https://huggingface.co/google/gemma-4-12B-it)).

**EQ-Bench Creative Writing v3 and Longform** ([creative writing](https://eqbench.com/creative_writing.html),
[longform](https://eqbench.com/creative_writing_longform.html), read from the pages' data files
on 2026-10-05). These test the original models only:

| Model | Creative Writing v3 Elo | Longform score |
|---|---|---|
| google/gemma-4-31B-it | 1368.2 | 56.5 |
| Qwen/Qwen3.8-27B | 1671.3 | 53.3 |
| google/gemma-4-26B-A4B-it | 1304.6 | 50.7 |
| **google/gemma-4-12B-it** | **1288.9** | **48.7** |
| nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-NVFP4 | 1280.3 | — |
| zai-org/GLM-4.7-Flash | 1124.7 | 47.8 |
| Qwen/Qwen3.5-35B-A3B | — | 44.5 |
| mistralai/Ministral-3-14B-Instruct-2512 | — | 31.9 |
| mistralai/Mistral-Nemo-Instruct-2407 | 880.9 | 28.7 |
| openai/gpt-oss-20b | 665.6 | 21.2 |

Qwen3.5-9B and Gemma 4 E4B are not on either EQ-Bench list.

**Google's own benchmarks** ([gemma-4-12B-it card](https://huggingface.co/google/gemma-4-12B-it))
put the 12B close to the 26B-A4B on instruction and agent tasks and well above the E4B:

| | 26B A4B | 12B | E4B |
|---|---|---|---|
| MMLU Pro | 82.6% | 77.2% | 69.4% |
| Tau2 (agentic, avg of 3) | 68.2% | 69.0% | 42.2% |
| BigBench Extra Hard | 64.8% | 53.0% | 33.1% |

Qwen reports IFEval 91.5 and IFBench 64.5 for Qwen3.5-9B
([Qwen3.5-9B card](https://huggingface.co/Qwen/Qwen3.5-9B)). Google's card gives no IFEval number
for Gemma 4, so the two can't be compared on instruction-following from first-party numbers.

## Candidates

### 1. Gemma 4 12B, Heretic (igorls, v1)

- **Base:** [google/gemma-4-12B-it](https://huggingface.co/google/gemma-4-12B-it). A dense model
  of 11.95B parameters, released 2026-05-23, with 256K context. The licence is Apache 2.0 per
  Google's card, although igorls's repos tag it `gemma`. The card says Gemma 4 has native
  `system` role support, so it should not hit the strict-alternation problem that Mistral 7B hit.
  Thinking is switchable (`enable_thinking`). The installed Gemma 4 GGUF defaults to thinking *on*
  in Ollama (`ollama show`), so the app's `think: false` matters.
- **Decensored build:** [igorls/gemma-4-12B-it-heretic-v1](https://huggingface.co/igorls/gemma-4-12B-it-heretic-v1).
  Heretic, **0/100 refusals, KL 0.0284**, abliterated for the non-thinking answer.
- **GGUF:** [igorls/gemma-4-12B-it-heretic-GGUF](https://huggingface.co/igorls/gemma-4-12B-it-heretic-GGUF)
  has Q4_K_M at **7.38 GB** and Q8_0 at 12.67 GB (from the file listing).
  Pull: `ollama pull hf.co/igorls/gemma-4-12B-it-heretic-GGUF:Q4_K_M` (the
  [hf.co syntax](https://huggingface.co/docs/hub/ollama)).
- **On ollama.com:** [HammerAI/gemma-4-12b-heretic](https://ollama.com/HammerAI/gemma-4-12b-heretic)
  is 7.4 GB (`12b-q4_K_M`). Its description names igorls's v1 as the source, but there is no
  readme and the page lists 128K context, so whether it is the same file is **not verified**.
- **MLX:** no uncensored Gemma 4 12B MLX tag was found on ollama.com. The official, censored
  [`gemma4:12b-mlx`](https://ollama.com/library/gemma4/tags) is 7.7 GB. See
  [Building an MLX model](#building-an-mlx-model-from-a-heretic-checkpoint) for making one from the
  v1 safetensors (23.95 GB download).
- **Expected memory when loaded:** about 8–9 GB. This is an estimate: the 26B-A4B heretic grows
  from 16 GB on disk to 18 GB loaded here, at Ollama's default context. Check with `ollama ps`.
- **Why it might fit:** it scores close to the 26B-A4B on Google's benchmarks and on EQ-Bench. It
  is the same family as the two Gemmas this app already rates, gemma4 31B for literal edits and
  the 26B-A4B heretic for Art, Suggest and Replies. It is also among the lowest-KL Heretic builds
  listed here.
- **Risks:** 12B active parameters against about 4B for the 26B-A4B, so it should be noticeably
  slower per token than the current fast model (not measured). Only Google's own scores and
  EQ-Bench (original model) exist for it, with no UGI entry. The Chain's word-for-word copying is
  untested at this size. The two Gemmas measured here passed it at 31B, and the 26B-A4B slipped.

Other Gemma 4 12B uncensored builds, for reference:

| Build | Refusals / KL (card) | Size | Note |
|---|---|---|---|
| [igorls QAT Q4_0 heretic](https://huggingface.co/igorls/gemma-4-12B-it-qat-q4_0-unquantized-heretic-GGUF), on Ollama as [`igorls/gemma-4-12B-it-qat-q4_0-unquantized-heretic`](https://ollama.com/igorls/gemma-4-12B-it-qat-q4_0-unquantized-heretic) | Ollama page: 0/99, KL 0.0154. HF GGUF card (v1.1, 2026-06-07): ~22% with thinking on, **KL 0.32** | Q4_0 7.0 GB | The two pages disagree, and which build the Ollama tag holds is not verified. Q4_0 matches Google's quantization-aware training. |
| [llmfan46/gemma-4-12B-it-uncensored-heretic](https://huggingface.co/llmfan46/gemma-4-12B-it-uncensored-heretic) (ARA method) | 6/100, KL 0.1203 | GGUF repo exists | About four times igorls's KL. |
| [HauhauCS/Gemma4-12B-QAT-Uncensored-HauhauCS-Balanced](https://huggingface.co/HauhauCS/Gemma4-12B-QAT-Uncensored-HauhauCS-Balanced) | "0/465", no KL | Q4_K_M 6.9 GB | Not Heretic. The card says it "reasons before answering", and it ships its own recommended sampling. |
| [huihui_ai/gemma-4-abliterated:12b](https://ollama.com/huihui_ai/gemma-4-abliterated/tags) | none published on the page | 7.6 GB (`12b-qat` also 7.6 GB) | `mgraffam/gemma4-heretic:12b` has the same digest, so it is a copy of this one, not a Heretic build. |

### 2. Qwen3.5-9B, Heretic (llmfan46, v2)

- **Base:** [Qwen/Qwen3.5-9B](https://huggingface.co/Qwen/Qwen3.5-9B). A dense 9B model with a
  hybrid design (Gated DeltaNet plus gated attention) and 262K context, Apache 2.0, released
  2026-02. It **thinks by default** and has a separate non-thinking mode.
- **Decensored build:** [llmfan46/Qwen3.5-9B-ultra-uncensored-heretic](https://huggingface.co/llmfan46/Qwen3.5-9B-ultra-uncensored-heretic).
  Heretic 1.2.0 (ARA), **4/100 refusals (from 86), KL 0.0241**.
- **GGUF:** [llmfan46/Qwen3.5-9B-ultra-uncensored-heretic-GGUF](https://huggingface.co/llmfan46/Qwen3.5-9B-ultra-uncensored-heretic-GGUF)
  (v2 files): Q4_K_M 5.53 GB, **Q6_K 7.36 GB**, Q8_0 9.53 GB.
- **On ollama.com:** [`huihui_ai/qwen3.5-abliterated:9b`](https://ollama.com/huihui_ai/qwen3.5-abliterated/tags)
  is 6.6 GB (q4_K) or 11 GB (q8_0). It is a huihui abliteration, not Heretic, and the page gives
  no KL.
- **MLX:** the official [`qwen3.5:9b-nvfp4`](https://ollama.com/library/qwen3.5/tags) is 7.2 GB
  but censored. An uncensored MLX build would have to be made with `ollama create -q nvfp4`.
- **Why it might fit:** it is a different family from Gemma, so it tells the benchmark whether
  failures belong to Gemma or to the model size. Qwen reports strong instruction-following
  (IFEval 91.5). Its KL is low.
- **Risks:** it is far below the Gemma 4 MoE on UGI (NatInt 16.05 against 33.71, Writing 32.52
  against 42.12, no-thinking runs). The larger Qwen measured here, Qwen3.8 27B, tended to change
  things it wasn't asked to ([models.md](../models.md)). Whether a 9B shares that habit is not
  known. Thinking must be off (`think: false`), and whether Ollama recognises the thinking toggle
  in a GGUF pulled from hf.co is not verified. Check with `ollama show`.

### 3. Gemma 4 26B-A4B Heretic at 3 bits

- **Build:** [llmfan46/gemma-4-26B-A4B-it-uncensored-heretic](https://huggingface.co/llmfan46/gemma-4-26B-A4B-it-uncensored-heretic),
  **11/100 refusals, KL 0.0468**. The "ultra" sibling has 3/100 refusals at KL 0.1237.
- **GGUF at under 12 GB:** [mradermacher/gemma-4-26B-A4B-it-uncensored-heretic-i1-GGUF](https://huggingface.co/mradermacher/gemma-4-26B-A4B-it-uncensored-heretic-i1-GGUF)
  has IQ3_XXS at 11.33 GB, **IQ3_XS at 11.64 GB** and IQ2_M at 10.38 GB (imatrix quants). The
  baseline Q4_K_M is 16.8 GB.
- **Params:** 25.2B total, 3.8B active, 8 of 128 experts per token, 256K context (Google's card).
- **Expected memory when loaded:** about 13 GB (estimate, by the same 16 → 18 GB growth). That is
  a little over the target.
- **Why it might fit:** it is the same model already measured as fast and good at Art, Suggest
  and Replies, so a run shows exactly what dropping from 4 to 3 bits costs.
- **Risks:** at Q4_K_M it already garbled one copied word per Chain run
  ([models.md](../models.md)), so quantization damage will most likely show up first in that job.
  It is not the same upload as the installed `pdurlej/gemma-4-26B-A4B-it-heretic`, whose source
  checkpoint isn't stated on [its Ollama page](https://ollama.com/pdurlej/gemma-4-26B-A4B-it-heretic).

### 4. Qwen3.8-27B-Uncensored at 2 bits (wildcard)

- **Tags:** [`orcarouter/Qwen3.8-27B-Uncensored`](https://ollama.com/orcarouter/Qwen3.8-27B-Uncensored/tags)
  has `mlx-2bit` (MLX) at **9.4 GB**, `iq2_m` at 11 GB and `iq2_xxs` at 9.8 GB. The installed
  `mlx-4bit` is 16 GB.
- **Why it might fit:** it is the careful model already measured, which was right on most Chain
  Actions and never garbled a copy. It has MLX at this size.
- **Risks:** the uploader's own notes call iq2_m "some quality loss" and iq2_xxs "most degraded".
  The MLX 2-bit gets no comment. The model is dense, with all 27B active, and was the slowest
  measured here at 4 bits (14.7–17.5 s per Chain Action). Whether 2 bits makes it faster or keeps
  it careful is not known.

### Set aside

| Model | Why not |
|---|---|
| Gemma 4 E4B heretic, e.g. [coder3101](https://huggingface.co/coder3101/gemma-4-E4B-it-heretic) (3/100, KL 0.0058), [igorls GGUF](https://huggingface.co/igorls/gemma-4-E4B-it-heretic-GGUF) Q8_0 8.03 GB | 4.5B effective. Google rates it far below the 12B (Tau2 42.2% against 69.0%). UGI NatInt is 16.7–18.7 against 33.7 for the 26B-A4B. That is the size class that failed the Chain here. |
| Qwen3.6-35B-A3B heretic ([llmfan46](https://huggingface.co/llmfan46/Qwen3.6-35B-A3B-uncensored-heretic), 10/100, KL 0.0015) | Strong on UGI (44.25 no-think), but under 12 GB only at IQ2 (9.5–11.7 GB, [mradermacher i1](https://huggingface.co/mradermacher/Qwen3.6-35B-A3B-uncensored-heretic-i1-GGUF)). The 3-bit files are 13.6 GB and up. |
| GLM-4.7-Flash heretics (30B total, 3B active, [UGI](https://huggingface.co/spaces/DontPlanToEnd/UGI-Leaderboard)) | Same size problem as Qwen3.6-35B-A3B. EQ-Bench Creative Elo 1124.7, below Gemma 4 12B. Low-bit file sizes not checked. |
| NVIDIA Nemotron 3.5 Lightning (30B, 3B active, [Ollama blog](https://ollama.com/blog)) | 30B total. No abliterated build was looked for. |
| gpt-oss-20b heretic ([p-e-w](https://huggingface.co/p-e-w/gpt-oss-20b-heretic-ara-v4)) | Lowest of these on EQ-Bench (Creative Elo 665.6, Longform 21.2). |
| Ministral 3 8B / 14B (2025-12) | UGI Writing 28.79 / 31.44 for the originals. Longform 31.9 for the 14B. Abliterated builds not checked. |
| Mistral Nemo 12B heretic-noslop ([p-e-w](https://huggingface.co/p-e-w/Mistral-Nemo-Instruct-2407-heretic-noslop)) | A 2024 base. EQ-Bench Creative Elo 880.9, Longform 28.7. Mistral's chat template caused the alternation failure here. Whether Nemo's template does the same is not verified. |
| Phi-4 heretic ([p-e-w](https://huggingface.co/p-e-w/phi-4-heretic)) | UGI NatInt 21.43, Writing 24.0. |
| IBM Granite 4.2 8B heretic ([`richardyoung/granite-4.2-8b-heretic`](https://ollama.com/richardyoung/granite-4.2-8b-heretic)) | 12/100, KL 0.080 per the page. No writing benchmark found. |
| "Qwen3.8-9B" heretics (e.g. [mradermacher](https://huggingface.co/mradermacher/Qwen3.8-9B-heretic-uncensored-GGUF)) | Not an official Qwen model. [empero-ai/Qwen3.8-9B-Distill](https://huggingface.co/empero-ai/Qwen3.8-9B-Distill) is Qwen3.5-9B fine-tuned on reasoning traces weighted toward "hard math and competitive programming", and it opens every answer with `<think>`. |
| Muse Glimmer 30B heretic ([`richardyoung/muse-glimmer-30b-heretic`](https://ollama.com/richardyoung/muse-glimmer-30b-heretic)) | 30B, and still 52/100 refusals per the page. |

## Practical notes

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

The app doesn't set `num_ctx`. It only sets `num_predict` and `format`
(`server/ollamaChat.ts`, `server/roleplay/model.ts`). So Ollama chooses the context from the
memory it sees as VRAM: 4k under 24 GiB, 32k from 24 to 48 GiB, 256k from 48 GiB up
([context-length docs](https://github.com/ollama/ollama/blob/main/docs/context-length.mdx)).
What a 48 GB Mac counts as VRAM is not verified here. The loaded size in `ollama ps` is the
number to compare against the 12 GB target, not the download size.

### Structured outputs

Every candidate goes through the same Ollama `format` JSON schema
([structured outputs](https://github.com/ollama/ollama/blob/main/docs/capabilities/structured-outputs.mdx)).
The installed MLX (`orcarouter …:mlx-4bit`) and GGUF (`pdurlej …`) models both already produce
the app's schemas, so both engines handle `format`. No source reports schema reliability for any
of these specific small models. The harness's Reply and Art cuts are the test. Watch for the two
Gemma traps already recorded: blank lines until the token cap when yes/no fields come first, and
runaway whitespace ([models.md](../models.md)).

## Shortlist to benchmark

In order of expected payoff. Run each through the existing harness (Chain 7 Actions, Art Agent 6
Kael Frames, Suggest 5 cuts, Roleplay replies 4 cuts), Thinking off, one model loaded at a time.
Record `ollama ps` size for each.

1. **Gemma 4 12B Heretic (igorls v1), GGUF Q4_K_M, 7.4 GB.** The likeliest replacement for the
   26B-A4B heretic.
   ```sh
   ollama pull hf.co/igorls/gemma-4-12B-it-heretic-GGUF:Q4_K_M
   ```
2. **The same model as MLX NVFP4.** Same weights, Ollama's faster engine and better 4-bit format.
   Optionally pull the censored official `gemma4:12b-mlx` (7.7 GB) as a control, to tell the
   12B's own limits from abliteration damage.
   ```sh
   hf download igorls/gemma-4-12B-it-heretic-v1 --local-dir ~/models/gemma-4-12B-it-heretic-v1
   printf 'FROM .\n' > ~/models/gemma-4-12B-it-heretic-v1/Modelfile
   cd ~/models/gemma-4-12B-it-heretic-v1 && ollama create gemma-4-12b-heretic:nvfp4 -q nvfp4
   ```
3. **Qwen3.5-9B Heretic (llmfan46 v2), GGUF Q6_K, 7.4 GB.** The non-Gemma comparison.
   ```sh
   ollama pull hf.co/llmfan46/Qwen3.5-9B-ultra-uncensored-heretic-GGUF:Q6_K
   ```
4. **Gemma 4 26B-A4B Heretic (llmfan46) at IQ3_XS, 11.6 GB.** An exact comparison against the
   current fast model at fewer bits.
   ```sh
   ollama pull hf.co/mradermacher/gemma-4-26B-A4B-it-uncensored-heretic-i1-GGUF:gemma-4-26B-A4B-it-uncensored-heretic.i1-IQ3_XS.gguf
   ```
5. **Wildcard: Qwen3.8-27B-Uncensored MLX 2-bit, 9.4 GB.** Only if 1–3 all fail the Chain. It
   checks whether the careful model survives 2 bits.
   ```sh
   ollama pull orcarouter/Qwen3.8-27B-Uncensored:mlx-2bit
   ```

Recipe 2 is untested: the `hf` download path, the Modelfile and the create step were not run.
