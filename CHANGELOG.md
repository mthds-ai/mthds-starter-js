# Changelog

## [v0.1.0] - 2026-06-30

### Added

- Initial release of the **mthds-starter-js** template — a minimal Next.js 16 starter that calls an MTHDS API via the [`mthds`](https://www.npmjs.com/package/mthds) SDK to run AI methods (`.mthds` bundles) from a TypeScript app.
- Example pipelines presented as tabs: text entity extraction (`methods/hello`), PDF summary (`methods/summarize-pdf`), and image generation (`methods/generate-image`), with a sample PDF so the PDF example works out of the box.
- Structured error handling — `classifyPipelineError` / `classifyTransportError`, the `PipelineError` model, and `<ErrorDisplay>` — with tagged `BadPipelineOutputError` / `BadImageOutputError` subclasses.
- File-input pipeline: client-side base64 encoding (`clientFile.ts`) plus server-side validation and `Document` envelope building (`fileEncoding.ts`).
- Tooling: `/bootstrap` and `/release` skills, CI workflows (`lint-check`, `tests-check`), Vitest unit tests, and optional live-API Playwright e2e specs.
