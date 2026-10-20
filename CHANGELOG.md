# Changelog

## [Unreleased]

### Added

- **`docs/methods.md`**: how a method's directory reaches the MTHDS API as its tree, which files travel with it, inline or by content hash, and how to add a method.

### Changed

- **Each example runs its method directory as its tree (Breaking)**: the Server Actions list `methods/<name>/` with `loadMethodTree` (`src/lib/methodTree.ts`, replacing `src/lib/loadBundle.ts` and its per-method loaders) and pass it to `execute` as `tree`, so a template, an image or any other file a step reads travels with the bundle; the SDK sends the tree inline when it is small and by content hash otherwise, uploading only the files the API lacks. `mthds_contents` is gone, so the app needs an MTHDS API that takes a run's method as the protocol's `files` map. `next.config.js` traces `methods/` into every build, so a Vercel or `output: "standalone"` deployment ships each method's directory.
- **`mthds` 0.33 (Breaking)**: the SDK moves from `^0.14.0` to `^0.33.0`, which reads the API's address from `MTHDS_BASE_URL` in place of `MTHDS_API_URL`, so rename the variable in your `.env.local`; a value with a path, such as `.../v1`, is now refused before anything is sent.
- **Errors read from the problem document (Breaking)**: `classifyPipelineError` reads each SDK failure by the MTHDS protocol's problem `code` and `domain` and shows the API's own title, sentence, next step and faults, each with the file and line it is in. The kinds `bundle_load_failed` and `config_missing` become `method_load_failed` (a method directory that cannot be listed as a tree, `MethodLoadError`) and `config_invalid` (a base URL or an API key the SDK refuses), and `method_invalid`, `account_limited`, `run_outcome_unknown` (a run whose request left without an answer, which may exist) and `upload_failed` join them.

### Fixed

- **The local API hint**: when the local MTHDS API cannot be reached, the error names a runnable `docker run` of Pipelex's `pipelex/pipelex-api` image and its documentation, where it pointed at a sibling checkout of the archived `pipelex-api` repository.

## [v0.1.1] - 2026-09-24

### Changed

- **Qualified pipe references in the Server Actions**: each action passes `pipe_code` as `<domain>.<pipe_code>` (`hello.extract_entities`, `summarize_pdf.summarize_pdf`, `generate_image.generate_image`) instead of the bare code, so the call names exactly one pipe and stays valid when another loaded domain declares the same code; copy that form into the actions you add.
- **README and `docs/`**: the README says what the app is, what it needs and how to start in the words of the MTHDS standard, naming any MTHDS-compliant API and Pipelex as one of them; the make targets, the optional end-to-end tests and local SDK development moved to `docs/development.md`, the file-input path to `docs/file-and-image-inputs.md`, and `/bootstrap` now removes the README's pointer to itself.
- **CI on every pull request**: `lint-check` and `tests-check` run on `pull_request` with no base-branch filter, so a pull request into `dev`, `main` or any branch you add later is gated without editing the workflows.
- **`/release` skill**: it declares only this repo's specifics (what ships, the version file and the lock, the gates, the release commit and the CI on the release pull request) and leaves the procedure to the Pipelex workspace's release play, which it links to.

### Security

- **Next.js 16.3.6**: `next` and `eslint-config-next` move from 16.2 to `^16.3.6`, out of the range of two critical remote-code-execution advisories (GHSA-p293-qw3h-jr36 on Windows-hosted servers, GHSA-2xp9-vwfh-vxw4 in the Image Optimization API with AVIF) and several lesser Next.js advisories, and the lockfile picks up the in-range fixes for `sharp`, `postcss`, `axios` and the other transitive packages `npm audit` flagged.

## [v0.1.0] - 2026-06-30

### Added

- Initial release of the **mthds-starter-js** template — a minimal Next.js 16 starter that calls an MTHDS API via the [`mthds`](https://www.npmjs.com/package/mthds) SDK to run AI methods (`.mthds` bundles) from a TypeScript app.
- Example pipelines presented as tabs: text entity extraction (`methods/hello`), PDF summary (`methods/summarize-pdf`), and image generation (`methods/generate-image`), with a sample PDF so the PDF example works out of the box.
- Structured error handling — `classifyPipelineError` / `classifyTransportError`, the `PipelineError` model, and `<ErrorDisplay>` — with tagged `BadPipelineOutputError` / `BadImageOutputError` subclasses.
- File-input pipeline: client-side base64 encoding (`clientFile.ts`) plus server-side validation and `Document` envelope building (`fileEncoding.ts`).
- Tooling: `/bootstrap` and `/release` skills, CI workflows (`lint-check`, `tests-check`), Vitest unit tests, and optional live-API Playwright e2e specs.
