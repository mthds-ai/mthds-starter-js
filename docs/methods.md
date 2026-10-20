# Methods and their trees

Each example runs a method that lives in its own directory under `methods/`. This page explains how that directory reaches the MTHDS API, and how to add a method of your own.

## A method is its whole directory

A method is more than its `.mthds` text. A step can read a template, an image, a stylesheet or a Python module that sits beside the bundle, and those files have to travel with it. The MTHDS standard calls the set of files that belong to a method its tree, and the MTHDS protocol sends that tree in a run request's `files` map, one entry per file, keyed by its path inside the method's directory.

The starter sends each method as its tree:

1. The Server Action calls `loadMethodTree("<name>")` (`src/lib/methodTree.ts`), which lists `methods/<name>/` with the `mthds` SDK's `listMethodTree`.
2. The action passes the listed tree to `MthdsApiClient.execute()` as its `tree` option, beside the qualified pipe reference and the inputs.
3. The SDK turns the tree into the request's `files` map and sends it.

The directory is listed at request time, so an edited method runs on the next request without restarting the dev server.

## Which files travel

The SDK applies the standard's membership rule, so not every file of the directory is sent. These stay behind:

- any file or directory whose name starts with a dot;
- `__pycache__` and `node_modules` directories, Python virtual environments, nested git repositories and nested method packages (a directory holding its own `METHODS.toml`);
- a run's inputs file, named exactly `inputs.json` or `inputs.toml`, which holds one run's data and is never part of the method;
- whatever a `.gitignore` file inside the directory ignores.

A directory holding something a tree cannot hold, such as a symbolic link, is refused before anything is sent, and the page shows a `method_load_failed` error naming the refusal. Run `npx mthds files methods/<name>` to see exactly what a method's tree holds, file by file.

The tree is rooted at the method's own directory (`listMethodTree` with `discover: false`), the way `mthds install` roots each method of a repository's `methods/` folder. A `METHODS.toml` placed higher up, such as at the repository root, therefore never widens what a run sends.

## How the tree travels

The SDK chooses, request by request, how the files travel:

- **Inline**, when the tree is small (its `files` map weighs no more than the SDK's `INLINE_TREE_MAX_BYTES`, 256 KiB, once serialized) or when the API keeps no blob store. Every file is sent in the request, as its text or as Base64 for a binary file.
- **By content hash**, otherwise. The SDK asks the API which files it lacks, uploads only those to the upload targets the API names, and then sends the request with each file named by its SHA-256. A second run of an unchanged method uploads nothing.

The example methods are small enough to travel inline every time. A method that grows past the inline limit, with images for example, needs no change in the app: the SDK switches to sending it by hash. A failed upload shows an `upload_failed` error naming the store's host.

The SDK learns whether the API keeps a blob store, and which limits it sets on a tree, from the API's version handshake, which it asks once and reuses for a few minutes. That is one reason the app keeps a single `MthdsApiClient` per process (`getMthdsClient()` in `src/lib/mthdsClient.ts`).

## Which API it needs

Sending a tree needs an MTHDS API that takes a run's method as the protocol's `files` map. An API that still expects a bundle's text in `mthds_contents` refuses the run, and the page shows the API's refusal.

## Adding a method

1. Create `methods/<name>/main.mthds`, with any file its steps read beside it. The [Pipelex plugin](https://github.com/Pipelex/pipelex-plugins)'s `/pipelex-design` skill builds one.
2. In the new Server Action, call `loadMethodTree("<name>")` and pass the result as `tree`, naming the pipe as `<domain>.<pipe_code>`. There is no per-method loader to write.
3. Add the output's type and its `parseXxx()` narrower in `src/types/`, and call the action from a component, as the examples do.

A method directory name is kebab-case and starts with a letter, such as `summarize-pdf`; `loadMethodTree` refuses any other name before touching the disk.
