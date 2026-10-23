# Changelog

## [Unreleased]

### Changed

- **`mthds` 0.33 (Breaking)**: the starter moves from `mthds` `^0.14.0` to `^0.33.0`, whose client reads its base URL from `MTHDS_BASE_URL`, so `.env.example`, the README and every hint name `MTHDS_BASE_URL` in place of `MTHDS_API_URL`: rename the variable in your `.env.local`, or the SDK calls its own default API.
- **Server Actions send the method's tree**: each action passes its method to `execute` as `files`, the map from tree path to file content (`{ "main.mthds": … }`), in place of the retired `mthds_contents` list, and `loadXxxBundle()` returns that map.
- **Failures shown from their problem (Breaking)**: `classifyPipelineError(err)` reads the problem document every SDK error carries, its title, detail, next step, `domain`, code and request id, and no longer takes an environment argument or branches on an error's class or a server class name; `PipelineError` loses `kind` and gains `domain`, `nextStep`, `code` and `requestId`. `<ErrorDisplay>` names who must act and takes its tone from the domain, shows the code and the request id under "Technical details", and adds the app's own hint for a credential, a configuration, a method to fix and an API that cannot be reached.

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
