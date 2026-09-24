# mthds-starter-js

A minimal Next.js starter for TypeScript developers who want to run [MTHDS](https://mthds.ai) methods from a web app, through the [`mthds`](https://www.npmjs.com/package/mthds) SDK.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## What this repository is

[MTHDS](https://mthds.ai) is an open standard for AI methods, and a method runs on any MTHDS-compliant runtime. This repository is a Next.js app that runs methods from its Server Actions: each action reads a `.mthds` bundle from disk, sends it with your inputs to an MTHDS API through the `mthds` SDK, and turns the output into a typed value the page renders.

Its example methods are presented as tabs, and each is a pattern to copy:

- **Text entities** (`methods/hello`) extracts the people, organizations and dates named in a text you paste.
- **PDF summary** (`methods/summarize-pdf`) reads a PDF you upload and returns its title, its document type and its key points.
- **Image generation** (`methods/generate-image`) turns a text prompt into an image.

## Prerequisites

- Node.js 22 or later.
- An MTHDS API for the app to call. The `mthds` SDK speaks the [MTHDS protocol](https://mthds.ai/latest/spec/protocol/), so any MTHDS-compliant API works. [Pipelex](https://pipelex.com), the reference runtime, is one of them: you can run its [`pipelex-api`](https://github.com/Pipelex/pipelex-api) server yourself, which is where the shipped `.env.example` points, or call Pipelex's hosted API.

## Quick start

From the root of a clone of this repository:

```bash
cp .env.example .env.local
make install
make dev
```

`.env.local` points the app at an MTHDS API on `http://127.0.0.1:8081`. If yours runs elsewhere or asks for a key, set the two variables under [Configuration](#configuration) first. Then open [http://localhost:3000](http://localhost:3000) and run a method from any tab.

## Configuration

The app reads two variables from `.env.local`, which git ignores:

| Variable        | Purpose                                             | Value in `.env.example` |
| --------------- | --------------------------------------------------- | ----------------------- |
| `MTHDS_API_URL` | Base URL of your MTHDS API, host only, with no path | `http://127.0.0.1:8081` |
| `MTHDS_API_KEY` | API key the SDK sends to that API as a bearer token | `test-api-key`          |

Always set `MTHDS_API_URL`: when it is unset, the SDK falls back to its own default API rather than yours.

## How it works

1. The browser calls a Server Action, one per method: `runHelloPipeline`, `runSummarizePdfPipeline` or `runGenerateImagePipeline`.
2. The action reads the method's `.mthds` bundle from disk and calls `MthdsApiClient.execute()` with the bundle, the pipe to run and the inputs. It names the pipe by its qualified reference, the bundle's domain then the pipe's code (`hello.extract_entities`), so the reference stays exact whatever else is loaded.
3. The MTHDS API runs the pipe and returns its output, loosely typed.
4. A `parseXxx()` narrower in `src/types/` checks that output and returns a typed value.
5. The page renders the value, or `<ErrorDisplay>` renders the classified `PipelineError` the action returned instead of throwing.

A file input, such as the PDF, is read into a data URL in the browser and wrapped in an MTHDS `Document` input on the server, and a generated image comes back as a URL. [File and image inputs](docs/file-and-image-inputs.md) explains both.

## Project structure

```
methods/                      # the .mthds bundles, one directory per method
public/sample-invoice.pdf     # sample PDF, so the PDF example works out of the box
src/
  app/                        # Next.js App Router (layout, page, globals.css)
  actions/                    # 'use server' Server Actions, one per method
  lib/
    mthdsClient.ts            # MthdsApiClient singleton
    loadBundle.ts             # reads the .mthds bundles from disk
    errors.ts                 # classifyPipelineError + PipelineError model
    fileEncoding.ts           # data-URL validation + Document input envelope
    clientFile.ts             # browser File → base64 data URL
  components/                 # ExampleTabs + per-example form and result components
  types/                      # concept types + parseXxx() narrowers
e2e/                          # optional Playwright specs
docs/                         # file and image inputs, development
```

## Add your own method

1. Add `methods/<name>/main.mthds`. Write it by hand from the MTHDS guide [Write your first method](https://mthds.ai/latest/getting-started/first-method/), or have Claude Code or Codex build it with the [Pipelex plugin](https://github.com/Pipelex/pipelex-plugins).
2. Add a loader in `src/lib/loadBundle.ts`, a type and its `parseXxx()` narrower in `src/types/`, and a Server Action in `src/actions/` that names the pipe as `<domain>.<pipe_code>`.
3. Call the action from a component. The example methods are the patterns to copy.

To make this project your own, run `/bootstrap` in Claude Code: it replaces the template's name, description and license holder everywhere, and resets the version and the changelog.

## Documentation

- [File and image inputs](docs/file-and-image-inputs.md): how a file reaches a method, and how a generated image comes back.
- [Development](docs/development.md): every make target, the optional end-to-end tests, and working against a local checkout of the `mthds` SDK.
- [mthds.ai](https://mthds.ai): the MTHDS standard, its language and its protocol.

## Develop

Run `make all` after every change: it runs ESLint, the Prettier check, the TypeScript check, the unit tests and a production build, the same gates as CI. If the Prettier check fails, run `make format`. [Development](docs/development.md) has the rest.

## License

This project is licensed under the [MIT license](LICENSE). Runtime dependencies are distributed under their own licenses via npm.
