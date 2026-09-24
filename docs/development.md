# Development

How to work on this project: the make targets, the optional end-to-end tests, and running the app against a local checkout of the `mthds` SDK.

## Make targets

Run `make all` after every change. It runs the same gates as CI: `make check`, the unit tests and a production build.

| Target              | Purpose                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| `make install`      | Install the dependencies                                                                            |
| `make dev`          | Start the Next.js dev server                                                                        |
| `make build`        | Production build                                                                                    |
| `make lint`         | ESLint                                                                                              |
| `make format`       | Prettier write                                                                                      |
| `make format-check` | Prettier check (CI)                                                                                 |
| `make typecheck`    | `tsc --noEmit`, for the app and for the e2e specs                                                   |
| `make test`         | Vitest single pass (unit tests, no API call)                                                        |
| `make agent-test`   | Vitest, silent on success (for AI agents)                                                           |
| `make test-e2e`     | **Optional** Playwright e2e — live API, costs an LLM call (prompts first; auto-skips without a key) |
| `make test-e2e-ui`  | Same, with the Playwright UI runner                                                                 |
| `make check`        | lint + format-check + typecheck                                                                     |
| `make all`          | check + test + build (does **not** run e2e — see `test-e2e`)                                        |
| `make use-local`    | Pack and install the sibling `../mthds-js` into `node_modules` (alias: `ul`)                        |
| `make use-npm`      | Restore the npm-published `mthds` package (alias: `un`)                                             |

`make help` lists every target the Makefile declares.

## End-to-end tests (optional)

The Playwright specs in `e2e/` are optional: `make all` never runs them, and you can delete `e2e/` if you do not want live tests. They start the dev server and exercise each example tab, asserting the expected output.

The three happy-path specs (`extract`, `summarize-pdf`, `generate-image`) call the **live** MTHDS API that `.env.local` configures, so each costs an LLM call. Two guards keep that deliberate:

- **They skip without a key.** When `MTHDS_API_KEY` is not set, those specs are reported as skipped instead of failing with an authentication error, so a fresh clone can run `make test-e2e` before it has credentials.
- **`make test-e2e` asks for confirmation** before it spends anything. The prompt is skipped in CI and in non-interactive shells; `CONFIRM=1 make test-e2e` bypasses it in a script.

The fourth spec, `error-display`, checks the error shown when the MTHDS API cannot be reached. It needs no key, costs nothing, and skips itself when the configured API answers its `/health` check.

The first run needs the browser binary: `npx playwright install chromium`.

## Local SDK development

To run the app against a checkout of the [`mthds-js`](https://github.com/mthds-ai/mthds-js) repository in the sibling directory `../mthds-js` instead of the published npm package:

```bash
make use-local   # builds ../mthds-js, packs it with `npm pack`, installs the tarball into node_modules/mthds
make use-npm     # restores the npm version
```

The aliases are `make ul` and `make un`. **Re-run `make use-local` after every SDK edit**: the tarball is a snapshot, not a live link. The install uses a tarball rather than a symlink because Next.js 16's Turbopack does not follow symlinked workspace packages, and both `make dev` and `make build` fail with `Module not found: Can't resolve 'mthds'` against one.
