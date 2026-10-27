# Removing models from the Hugging Face cache

`hf cache rm` can report success and free no disk. On the Mac (2026-10-27) removing four repos freed nothing: 57.4 GB of their weights stayed behind in `~/.cache/huggingface/hub/blobs/`, where `hf cache ls` doesn't count them. Remove models with `hf cache rm`, then check that the disk space came back.

## Why it happens

The cache holds each file once, as a blob, and each repo's `snapshots/` folder links to it. `hf cache rm` deletes a repo's links and then deletes a blob only if nothing else uses it. For that it relies on a `<blob>.refs` file beside each shared blob (hub/blobs/<two hex digits>/<sha256>).

On 2026-10-27 the split showed up in one removal: two repos downloaded by `hf` 2.3.0 freed their space (59 GB), and two older ones fetched by mflux left 62.4 GB behind.

The Mac's shared store was written by `huggingface_hub` 1.33.0, which mflux and mlx-audio each carry in their own `uv tool` environment, and it has no `.refs` files and no `.huggingface-shared-blobs` marker. The `hf` command (2.2.0 on 2026-10-27; 2.3.0 after `hf update` the same day) can't tell those blobs are free, so it leaves them. A cache downloaded by the 2.2.0 CLI cleaned up correctly in a test (a tiny repo: 552 KB before, 8 KB of lock files after). It also ignores them when it lists: `hf cache ls` warns "Repo path is not a valid HuggingFace cache directory: …/hub/blobs. Repo ignored." (the "1 cache inconsistencies" notice, shown in full with `--show-warnings`), so its total leaves the shared store out. So this should fade as models are downloaded again by newer libraries, and mflux's own version bump (`huggingface_hub` inside `uv tool list`) is what to watch. New and old blobs are mixed in the cache until then.

## Routine

1. **Note the free space:** `df -h ~`.
2. **Remove the repo:** `hf cache rm model/<owner>/<name> --dry-run`, check what it says, then run it again with `-y`. Don't `rm -rf` inside the cache by hand: a blob may be shared with another repo.
3. **Check that the space came back:** `df -h ~` again, against the repo's size from `hf cache ls`. Don't trust "freed" in the command's output, as it counted 33.5 GB freed when 29.7 GB stayed behind on 2026-10-15.
4. **Look for blobs nothing links to** (read-only):

   ```sh
   python3 - <<'EOF'
   import glob, os
   H = os.path.expanduser('~/.cache/huggingface/hub')
   used = {os.path.realpath(os.path.join(d, f))
           for s in glob.glob(H + '/models--*/snapshots/*') for d, _, fs in os.walk(s) for f in fs}
   total = 0
   for b in [H + '/blobs'] + glob.glob(H + '/models--*/blobs'):
       for d, _, fs in os.walk(b):
           for f in fs:
               p = os.path.join(d, f)
               if f.endswith(('.lock', '.refs')) or f.startswith('.') or os.path.islink(p):
                   continue
               if os.path.realpath(p) not in used:
                   total += os.path.getsize(p)
                   print(f'{os.path.getsize(p) / 1e9:7.2f} GB  {p}')
   print(f'{total / 1e9:.1f} GB with no link')
   EOF
   ```

   This covers the shared `hub/blobs/` store and every repo's own `blobs/` folder. It lists only files that no snapshot links to, so it can't catch a model still in use.
5. **Match them to what you removed before deleting.** A blob's name is not its repo's file hash on the old layout, so match each one by its exact size against the removed repo's files (`https://huggingface.co/api/models/<owner>/<name>/tree/main?recursive=true`, the `size` fields). A blob that matches nothing you removed is not yours to delete: leave it and ask.
6. **Ask before deleting** (AGENTS.md). Then delete only the matched blobs, one file each, and run the check again until it lists nothing. Also compare `df` once more.
7. **Don't use `hf cache prune` for this.** Its help says it removes detached revisions and incomplete downloads, not blobs nothing links to. Not tried on this cache.

## Record

Add the finding to the dated log of what you were doing (for an mflux upgrade, [research/mflux-upgrade-log.md](./research/mflux-upgrade-log.md)): which repos were removed, how much was freed, and any blobs left.

## The `hf` command, and upgrading it

On the Mac (checked 2026-10-27) `hf` came from Hugging Face's own install script, `curl -LsSf https://hf.co/cli/install.sh | bash` (the script makes the venv and leaves a `.hf_installer_marker` in it). It lives in a venv of its own at `~/.hf-cli/venv` (Python 3.12, built from the mise Python), and `~/.local/bin/hf` is a link to it. It isn't a `uv tool`, so `uv tool list` doesn't show it and `uv tool upgrade` doesn't touch it; the `huggingface_hub` inside the `mflux` and `mlx-audio` tools is a separate copy, moved only when those tools are reinstalled ([mflux-upgrade.md](./mflux-upgrade.md)).

To upgrade it:

1. `hf version` for the installed version, and PyPI's [huggingface-hub](https://pypi.org/project/huggingface-hub/) page for the latest.
2. `hf update`, the command's own updater (listed in `hf --help`). Run on the Mac on 2026-10-27, it took 2.2.0 to 2.3.0 and refreshed the venv and the `~/.local/bin/hf` link; running it again says "hf is up to date". `hf cache ls` and the orphan check below still worked afterwards (28 repos, 379.3 GB, 0.0 GB with no link).
3. If that fails, upgrade the venv directly: `~/.hf-cli/venv/bin/python -m pip install --upgrade huggingface_hub`. Or run the install script again, which replaces the venv.
4. `hf version` again, then `hf cache ls` to make sure it still reads the cache, and the orphan check above.

Not tried: the pip route and the re-run of the script. `hf cache rm` on 2.3.0 does not fix the old shared blobs: removing `black-forest-labs/FLUX.2-klein-9B` on 2026-10-27 reported 34.7G freed and freed no disk, leaving six blobs (34.5 GB), which the check found and, matched by size to the repo's files, were deleted. The Windows PC's `hf`, if it has one, was not checked.
