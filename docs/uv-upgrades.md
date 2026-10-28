# Updating uv and the Python tools

This is the routine for updating uv on the Windows PC and Apple Silicon Mac, and for checking the Python scripts that uv runs. Updating uv itself, updating its managed Python interpreters, widening a script's supported Python range, and upgrading script dependencies are separate changes; do not combine them by default.

## What is pinned

Each script has inline PEP 723 metadata at its top and a committed lockfile beside it. The inline metadata pins the accepted Python minor range and declares direct dependencies; the lockfile pins the resolved package versions, hashes, and platform-specific alternatives that `uv run` installs. The uv executable itself is installed per machine and is not pinned in this repository.

| Script | Python range | Where it runs | Platform-specific dependency |
|---|---|---|---|
| `python/voice/serve.py` | `>=3.14,<3.15` | Apple Silicon Mac | MLX audio stack; Mac only |
| `python/sharp/make.py` | `>=3.14,<3.15` | Mac and Windows PC | PyTorch from PyPI on the Mac; PyTorch and torchvision from the `cu132` index on Windows |
| `python/triposplat/make.py` | `>=3.14,<3.15` | Mac and Windows PC | PyTorch from PyPI on the Mac; PyTorch and torchvision from the `cu132` index on Windows |
| `python/style/make.py` | `>=3.14,<3.15` | Mac and Windows PC | PyTorch from PyPI on the Mac; PyTorch and torchvision from the `cu132` index on Windows |
| `python/lito/make.py` | `>=3.13,<3.14` | Apple Silicon Mac | `mlx-spatial`, pinned to a Git commit and currently restricted upstream to Python 3.13 |

The direct Git dependencies are pinned to specific commits in the scripts' metadata; for example, SHARP pins `apple/ml-sharp` and LiTo pins `appautomaton/mlx-spatial`. The CUDA index URL is pinned to `cu132`. These are intentional dependency choices, not uv-version pins. A uv-only update should not change any of them or regenerate lockfiles unless the new uv reports a concrete lockfile compatibility issue.

`uv python upgrade 3.14` installs the latest managed 3.14 patch release; it does not move scripts to Python 3.15 or change their package locks. Widening a script's Python range or upgrading its packages is separate work: edit the inline metadata or dependency declaration, regenerate that script's lockfile, inspect the lock diff, and test that script on every machine where it runs. Use `uv lock --script <script> --upgrade-package <name>` or `--upgrade` only when intentionally upgrading package versions.

## Routine uv release upgrade

1. Read the uv release notes and check whether the release changes managed Python builds, script metadata, lockfile formats, index resolution, or platform handling relevant to these scripts.
2. Update uv on each machine using the same installation method already used there. For the standalone installer, `uv self update <version>` installs a selected version; if uv came from a package manager, upgrade it with that package manager instead.
3. Check `uv --version`. If the release updates a managed Python patch or fixes an interpreter security issue, use `uv python upgrade 3.14` on both machines; keep Python 3.13 available for LiTo on the Mac. This only updates the interpreter within that minor version.
4. Run `uv lock --script <script> --check` for all five scripts on both machines. This checks the committed resolution against the current script metadata and platform; it does not run the scripts or prove that a model works.
5. Run the import/CLI checks below for every script supported on that machine. Then run one real smoke job per supported backend, using public benchmark images and temporary output paths when weights are already cached.
6. Inspect `git diff` for every lockfile. A uv-only update should normally leave the script metadata and lockfiles unchanged. If uv requires lockfile changes, review them and rerun the affected smoke tests; do not hide them by reverting lockfiles.

Record each machine's uv version, managed Python versions, lock-check result, and any smoke jobs in its rolling log: [Mac](./research/uv-upgrade-log-mac.md) and [Windows](./research/uv-upgrade-log-windows.md). Include the date and machine with each entry.

## Commands on each machine

On Windows PowerShell, check the version and update a standalone installation:

```powershell
uv --version
uv self update <version>
uv --version
uv python list --only-installed
```

Check all five locks on Windows:

```powershell
$failed = $false
Get-ChildItem -Path python -Recurse -Filter *.py.lock | ForEach-Object {
  $script = $_.FullName -replace '\.lock$', ''
  uv lock --script $script --check
  if ($LASTEXITCODE -ne 0) { $failed = $true }
}
if ($failed) { throw 'One or more Python script locks need attention' }
```

On the Mac, use the same `uv --version` and `uv python list --only-installed` checks. For a standalone installation, update it with `uv self update <version>`; if installed with Homebrew, use `brew upgrade uv` instead. Check all five locks from the repository root:

```sh
set -eu
for lock in python/*/*.py.lock; do
  uv lock --script "${lock%.lock}" --check
done
```

## Script checks

First run `uv run --script <script> --help` for each supported script. This checks that uv can select the declared interpreter, install from the lock, and import the script's dependencies; it does not download model weights or exercise inference.

| Machine | Import/CLI checks | Real smoke jobs |
|---|---|---|
| Windows PC | `python/sharp/make.py`, `python/triposplat/make.py`, and `python/style/make.py` | Run SHARP with a public benchmark scene image, TripoSplat with a public benchmark person image, and style scoring with one benchmark image and one caption. Confirm each writes its expected output; the style result should contain CSD and CLIP vectors. |
| Apple Silicon Mac | All five scripts, including voice and LiTo | Run SHARP, TripoSplat, style scoring, and LiTo with public benchmark inputs; test voice design and speech through the service. Confirm the outputs are readable and non-empty. |

The script CLIs show their required arguments with `--help`; SHARP, TripoSplat, and LiTo take `--image <input> --out <temporary-output.ply>`, while style scoring takes `--in <request.json> --out <result.json>`. The style request shape is `{"images":["<benchmark-image>"],"texts":["<caption>"]}`. Voice is a long-running service; its `--help` check is not a voice-generation test.

On Windows, set the three input paths to a public scene image, a single-person image, and a style request JSON with the shape above, then run:

```powershell
uv run --script python/sharp/make.py --image $scene --out "$env:TEMP\uv-sharp.ply"
uv run --script python/triposplat/make.py --image $person --out "$env:TEMP\uv-triposplat.ply"
uv run --script python/style/make.py --in $styleRequest --out "$env:TEMP\uv-style.json"
```

On the Mac, use equivalent input paths and temporary output paths; run the same three scripts, plus LiTo:

```sh
uv run --script python/sharp/make.py --image "$scene" --out "$TMPDIR/uv-sharp.ply"
uv run --script python/triposplat/make.py --image "$person" --out "$TMPDIR/uv-triposplat.ply"
uv run --script python/style/make.py --in "$style_request" --out "$TMPDIR/uv-style.json"
uv run --script python/lito/make.py --image "$person" --out "$TMPDIR/uv-lito.ply"
```

Test voice generation through the app's voice service with its models already cached; `uv run --script python/voice/serve.py --help` only checks the CLI and imports. `--download` only fetches weights and is not an inference test.

Use the public images under `docs/bench/`, not pictures or prompts from a real Session. Put generated `.ply` files and style JSON outside the repository and clean up those exact outputs when the tests finish. First runs can download model weights and large PyTorch wheels; check what is already cached and ask before starting large downloads or memory-heavy inference. On the Windows PC, run GPU jobs one at a time; SHARP can use nearly all 12 GB of VRAM. Voice, LiTo, and their model runs are Mac-only.

If script metadata, Python ranges, package versions, or application code changed, run the relevant app tests too (`deno task test` and `deno task check`). A routine uv executable upgrade with unchanged scripts and passing smoke checks does not by itself require a dependency upgrade.

## Python 3.15 status

Python 3.15 is not enabled for these scripts yet. As checked on 2026-10-27, PyTorch 2.14.1 and torchvision 0.29.1 have CPython 3.15 wheels on PyTorch's Windows `cu132` index, but neither has a CPython 3.15 wheel on PyPI for the Mac. The pinned `mlx-spatial` commit also declares `requires-python = ">=3.13,<3.14"`. Keep the current script ranges until the Mac dependencies and LiTo's upstream Python range can be tested; see "Python 3.15 for the Python programs" in [open-threads.md](./open-threads.md).

## References

- [uv installation and upgrades](https://docs.astral.sh/uv/getting-started/installation/)
- [uv-managed Python versions](https://docs.astral.sh/uv/concepts/python-versions/)
- [uv 0.13.5 release notes](https://github.com/astral-sh/uv/releases/tag/0.13.5)
- [uv 0.13.6 release notes](https://github.com/astral-sh/uv/releases/tag/0.13.6)
- [Python 3.15 porting guide](https://docs.python.org/3.15/whatsnew/3.15.html#porting-to-python-3-15)
