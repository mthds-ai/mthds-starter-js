---
name: release
description: >
  Cut a release of mthds-starter-js, the MTHDS-branded Next.js template that
  runs .mthds methods through the mthds SDK: the release/vX.Y.Z worktree, the
  package.json bump and the package-lock.json that follows, the changelog entry,
  the gates, one commit, and a pull request to main. Use when the user says
  "release", "cut a release", "bump version", "new version", "prepare a
  release", "make a release", "ship it", or "create release branch". Changelog
  content passed inline ("/release Added a PDF example") becomes the entry. The
  merge is landed by /ledger-land, never by this skill.
---

# Releasing mthds-starter-js

The procedure is the workspace release play, [`docs/releasing.md`](../../../../docs/releasing.md) at the workspace root — `../docs/releasing.md` from this repo's own root, which resolves the same from the main checkout and from any worktree. Read it first, then run it with what follows. The repo key is `mthds-starter-js`, the base is `dev`, and the pull request targets `main` — the ordinary workspace shape, which this repo adopted along with its `dev` branch. The release worktree is `_mthds-starter-js--release`, made with `wt add mthds-starter-js release --branch release/vX.Y.Z`.

The repo declares neither `.worktree.toml` nor `.worktreeinclude`, and needs neither: `wt` resolves the base from `origin/dev`; it provisions with the Makefile's `install` target (`npm install`), which is what puts into the worktree the `node_modules` every gate below runs out of; and it copies `.env`, its default when a repo names no include list.

## What ships

Nothing is published, and that is the whole of it. `package.json` carries `"private": true`, and `.github/workflows/` holds `lint-check.yml` and `tests-check.yml` and nothing else — there is no publish workflow, so no npm package, no image, no docs site, no GitHub Release, and nothing that creates a tag. The merge to `main` promotes the code and stops there.

The landing therefore has no workflow run, no registry answer and no tag to read. What it verifies is the merge itself, from `<main>`:

```bash
git -C <main> fetch --prune origin
git -C <main> log origin/main -1 --oneline                       # the merge is on main
git -C <main> show origin/main:package.json | grep '"version"'   # and carries X.Y.Z
```

That merge SHA is the evidence the release item closes on. The back-merge is the play's ordinary one: `/ledger-land` merges `origin/main` into `dev` after the release, and the changelog is the one conflict it expects.

## Version files and the lock

- **`package.json`** — the top-level `"version"` field, without the `v` prefix, and the only place the number is written. Nothing in the app reads it back or restates it.
- **The lock** — `make lock` (`npm install --package-lock-only`) rewrites `package-lock.json`'s copy of the number without touching `node_modules`. Run it right after the bump. Nothing in CI compares the two, so a skipped lock step ships a lockfile disagreeing with `package.json` and no check complains.
- **Also stamped:** nothing.

## Gates

Run in the worktree, in this order, before the commit:

1. **`make all`** — `make check` first (ESLint over the whole repo, `prettier --check`, then `tsc --noEmit` for the app and `tsc -p tsconfig.e2e.json` for the Playwright specs), then the Vitest suite, then the production Next build. It covers between them what both CI workflows run, so a red here is a red pull request there. It rewrites nothing: a formatting failure is cured by running `make format` and re-running the gate, never by hand-editing files to satisfy Prettier. Red blocks the release. **Marked after the bump:** `format-check` runs Prettier over the Markdown and JSON in the repo, so the changelog entry and the bumped `package.json` are themselves inside this gate — run it once more at the end of the play's step 7, or `make format-check` alone when the first run was green and only those files have changed since.
2. **`make test-e2e`, only when the release touches the SDK call path** — `src/actions/`, `src/lib/mthdsClient.ts`, `src/lib/loadBundle.ts`, `src/lib/errors.ts`, `src/lib/fileEncoding.ts`, `methods/` — **and only with the user's explicit approval**, because the live specs (`extract`, `summarize-pdf`, `generate-image`) call the real MTHDS API and cost an LLM call each. The target prompts before spending (`confirm-live-e2e`, which a non-interactive shell or `CONFIRM=1` skips), and the live specs skip themselves when `MTHDS_API_KEY` is unset — a worktree with no key runs only the offline `error-display` spec and proves nothing about the call path. The browser binary is a one-off per machine rather than per worktree — `npx playwright install chromium` writes into a cache outside the checkout, so a worktree on a machine that has already installed it needs nothing. `make all` excludes these and no CI workflow runs them, which is why the decision to spend is the user's.

## The release commit

`package.json`, `package-lock.json` and `CHANGELOG.md`, staged by name. No gate rewrites files here, so there is nothing else to carry. The repo's pre-commit hook is husky's `npx lint-staged` (`core.hooksPath` is `.husky/_`), which runs `prettier --write` over the staged Markdown and JSON, so it may reformat the changelog entry as the commit is made; `.prettierignore` lists `package-lock.json`, which keeps the formatter off the lock.

## CI on the release pull request

- **`lint-check.yml`** — `npm ci`, then `make check`, on Node 22.
- **`tests-check.yml`** — `npm ci`, then `make agent-test`, then `make build`, on Node 22.

Both are declared `on: pull_request:` with no `branches:` filter at all, so they fire on every pull request whatever its base — the release pull request into `main`, an ordinary one into `dev`, and any future base alike. That is deliberate and matches the sibling starter `pipelex-starter-js`: a base-branch allow-list is what silently leaves a newly added base ungated, which is exactly what happened here while the repo had only `main`.

**Nothing else gates it, and no gate derives the version from the branch name.** This repo has no version check, no changelog check and no branch guard, so CI never asserts that `package.json` equals the version in `release/vX.Y.Z`, that `CHANGELOG.md` carries the entry, that no `[Unreleased]` heading survived, or that the lock agrees with `package.json`. Those are this skill's job and a miss ships unnoticed. For the same reason a pre-release form would pass rather than fail: ship a plain `X.Y.Z`.

## Particulars

- **The changelog headings carry the `v`.** `CHANGELOG.md` uses `## [vX.Y.Z] - YYYY-MM-DD`, which is the play's default shape.
- **Nothing here creates a tag**, since there is no publish or release workflow, so `git describe --tags` finds nothing. The play's pre-flight reading of what the release promotes is the `git log origin/main..dev` range, as in any repo whose base is `dev`, rather than a tag range.
- **No standing release follow-ups.** `ledger/ledger.toml` declares `release_followups` for `pipelex` alone, so filing this repo's release item materializes none — whatever this release arms is filed by hand alongside it.
- **`make use-local` cannot leak into the release, but it can skew the gates.** It installs the sibling `../mthds-js` as a packed tarball with `--no-save`, so neither `package.json` nor `package-lock.json` records it, while `node_modules/mthds` becomes the local build — gates run after it are measuring the sibling SDK rather than the published one. A release worktree provisioned by `make install` holds the npm-published `mthds`, which is what the release should be gated against, and `make use-npm` restores it wherever it was swapped out.
- **This repo is the starter others copy, and `/bootstrap` rewrites this file.** `.claude/skills/bootstrap/scripts/bootstrap.mjs` names `.claude/skills/release/SKILL.md` among its targets: it substitutes the template's name and title and softens the template's prose self-references, while resetting `package.json` to its initial version and restarting `CHANGELOG.md`. A fork therefore inherits this skill under its own name, and inherits the link to the play above, which resolves only inside the Pipelex workspace — what travels usefully into a fork is the specifics on this page, not that pointer.
