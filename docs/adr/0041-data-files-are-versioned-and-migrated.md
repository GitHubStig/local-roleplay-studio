---
status: accepted
---

# Data files are versioned, and migrated as they're read

Until 2026-11-20 the data files had no version, and a change to their shape was made by hand: every Session and `settings.json` on the Mac was upgraded as the change landed, and the code carried no fallback for an older file (AGENTS.md, "No upgrade code"). That kept the app's types free of optional fields that only meant "from before", but it worked only while the Mac was the one place with data. An installed app (ADR 0040) keeps a player's data in their system's folders, which no one upgrades by hand.

## Decision

- **Each data file says its version** in a `version` field, first in the file. A file without one is version 0: everything from before 2026-11-20. Version 1 is the same shape, numbered.
- **A file is migrated to the latest version as it's read**, before anything uses it, by the store that reads it, so the app's types (`shared/`) only ever describe the latest version: no optional field, no `?? []`, no conversion for an older file, as before.
- **Migrated in memory, written on the next save.** Loading a file doesn't rewrite it: the file on disk stays as it was until the app next saves it, stamped with the latest version, so an old file can be loaded again to debug or repeat its migration. Files of different versions can sit side by side, so a step never depends on another file having been migrated. Steps are pure (no clock, no randomness, no files), so loading the same file twice gives the same result.
- **`server/migrations/`, a folder per kind of file** (`session/`, `settings/`, `queue/`), each with a file per version (`v1.ts`, `v2.ts`…) beside its test (`v1_test.ts`). The runner they share is `server/migrations/migrate.ts`. Only the server reads the files, so only it migrates them; `shared/` never imports from the migrations, which import from it.
- **A version's file holds that version's types in full, and the step that makes it from the version before.** Its types are a copy, not imported from `shared/` (which would change them later) or built from the version before (`Omit<V1, …> & …`, which makes finding what a version changed a hunt back through every version). It marks what it changed (`/** v3: added */`), and declares its types by the app's names without exporting them, exporting only its version (`export type V3 = Session`) and its step: so `diff v2.ts v3.ts` shows what changed and nothing else, and the editor's auto-import offers only `shared/`'s `Session`.
- **The runner stamps the version, not the steps.** A step's version is its place in the chain (the first makes version 1), so no step can forget to bump it, or copy the wrong number, and run again on the next load. Steps are never reordered or removed.
- **The chain is typed**: `migrations().then(v1).then(v2).done((doc): Session => doc)` accepts a step only if it takes what the one before it makes. `done` checks that the latest version still fits the app's type, and has no field the app's type has dropped, so changing `shared/` in a way old files no longer fit fails `deno task check` until a version is added.
- **Fits, not equal.** The latest version must fit the app's type, not be identical to it: a change that leaves every old file valid (a model added to a list, an optional field added) needs no version. A field added, renamed or removed, or a value dropped from a list, does.
- **A file that can't be migrated fails loudly**, naming the file and why: a version newer than the app reads (from a newer install, or the other machine's branch), or one that fails the app's checks after migrating. It's never replaced by defaults, which the next save would write over the player's file.

## Considered Options

- **Keep upgrading by hand.** No code, but it only reaches the Mac's files, not an installed app's.
- **`shared/` re-exporting the latest version's types** from the migrations, so the app's types are the latest version's. One copy fewer, but `shared/` can't import from the server, and each new version means moving every re-export to it, which nothing checks.
- **Each version built from the one before.** A few lines per version, but what a version changed is a hunt through its chain; the owner did this before and found it painful past 15 versions.
- **An example document per version instead of types.** Doubles as test data, but only checks the fields the example has.
- **A schema library (Zod, Valibot)** for each version, validating as well. A rewrite of `shared/` into schemas, which must stay plain types and values.
- **Writing a migrated file back at once.** Old versions wouldn't linger on disk, but loading would change the file, so it couldn't be loaded again to debug.

## Consequences

- **Each version is a full copy of its file's types**: about 300 lines for a Session, 100 for Settings and for the queue. Types only, so nothing at runtime.
- **A change to a stored shape comes with a version**, its step and the step's test, in the same change; `deno task check` says when one is needed.
- **`settings.json` no longer has missing fields filled in from the defaults**, as a step now does that, and an invalid one stops the server, naming what's wrong, rather than being replaced by the defaults.
- **Scenario files, `style.json` and `export.json` are left for later**: a Scenario's version would go in its frontmatter, `style.json` is a cache that can be dropped and made again, and `export.json` lives only while an export is queued.
