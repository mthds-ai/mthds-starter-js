# Changelog

## [Unreleased]

### Changed

- **Qualified pipe references in the Server Actions**: each action passes `pipe_code` as `<domain>.<pipe_code>` (`hello.extract_entities`, `summarize_pdf.summarize_pdf`, `generate_image.generate_image`) instead of the bare code, so the call names exactly one pipe and stays valid when another loaded domain declares the same code; copy that form into the actions you add.
- **README and `docs/`**: the README says what the app is, what it needs and how to start in the words of the MTHDS standard, naming any MTHDS-compliant API and Pipelex as one of them; the make targets, the optional end-to-end tests and local SDK development moved to `docs/development.md`, the file-input path to `docs/file-and-image-inputs.md`, and `/bootstrap` now removes the README's pointer to itself.

## [v0.1.0] - 2026-06-30

### Added

- Initial release of the **mthds-starter-js** template — a minimal Next.js 16 starter that calls an MTHDS API via the [`mthds`](https://www.npmjs.com/package/mthds) SDK to run AI methods (`.mthds` bundles) from a TypeScript app.
- Example pipelines presented as tabs: text entity extraction (`methods/hello`), PDF summary (`methods/summarize-pdf`), and image generation (`methods/generate-image`), with a sample PDF so the PDF example works out of the box.
- Structured error handling — `classifyPipelineError` / `classifyTransportError`, the `PipelineError` model, and `<ErrorDisplay>` — with tagged `BadPipelineOutputError` / `BadImageOutputError` subclasses.
- File-input pipeline: client-side base64 encoding (`clientFile.ts`) plus server-side validation and `Document` envelope building (`fileEncoding.ts`).
- Tooling: `/bootstrap` and `/release` skills, CI workflows (`lint-check`, `tests-check`), Vitest unit tests, and optional live-API Playwright e2e specs.
