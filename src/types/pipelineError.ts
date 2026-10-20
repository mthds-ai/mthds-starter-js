/**
 * Tagged errors thrown at the app's system boundaries.
 *
 * The output errors are thrown by the `parseXxx()` narrowers in `src/types/`:
 * the pipeline ran, but its output didn't match the shape the app expects
 * (the bundle was edited, or the model produced something unexpected).
 * `MethodLoadError` is thrown by `loadMethodTree` (`@/lib/methodTree`) when a
 * method's directory cannot be read as a method tree. `classifyPipelineError`
 * in `@/lib/errors` matches on these classes to build a structured
 * `PipelineError` instead of an opaque "unknown" error.
 *
 * They live in their own file (not next to one pipeline's types) because
 * every pipeline shares them, and because `@/lib/errors` is bundled into the
 * client: this file imports nothing, so it is safe there, where the SDK's
 * own `MethodTreeError` (exported only by the Node-side `mthds` barrel) is not.
 */

/**
 * Thrown by `loadMethodTree` when a method's directory under `methods/` cannot
 * be listed as a method tree: it is missing, or it holds something the MTHDS
 * standard refuses in a tree, such as a symbolic link. `code` is the SDK's
 * refusal code (`not_found`, `symbolic_link`, `empty_tree`, …), kept so the
 * error display can say which.
 */
export class MethodLoadError extends Error {
  readonly method: string;
  readonly code: string;

  constructor(method: string, code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MethodLoadError";
    this.method = method;
    this.code = code;
  }
}

/** Thrown by a `parseXxx()` narrower when structured output is malformed. */
export class BadPipelineOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadPipelineOutputError";
  }
}

/**
 * Thrown by `parseGeneratedImage` when an image-generation pipeline returns
 * no usable image URL. Distinct from `BadPipelineOutputError` so the error
 * UI can show image-specific guidance (e.g. the model refused the prompt).
 *
 * `nonWebUrl` is set when the pipeline *did* return an image, but at a URL a
 * browser can't load (`file://`, `pipelex-storage://`, …) — typically the
 * MTHDS API using local file storage. `classifyPipelineError` keys on this
 * field to show storage-specific guidance instead of the generic message,
 * without parsing the error string.
 */
export class BadImageOutputError extends Error {
  readonly nonWebUrl?: string;

  constructor(message: string, options?: { nonWebUrl?: string }) {
    super(message);
    this.name = "BadImageOutputError";
    this.nonWebUrl = options?.nonWebUrl;
  }
}
