// Import the SDK error classes from the client-safe `mthds/errors` subpath, not
// the top-level `mthds` barrel. This module is bundled into the client (client
// components import `classifyTransportError` + the `PipelineError` type from
// here), and the top-level barrel pulls `MthdsApiClient` → `node:fs` into the
// graph, which a client bundler cannot externalize. `mthds/errors` re-exports
// only the error classes and the problem readers, and carries no Node built-ins.
import {
  ApiResponseError,
  ApiTransportError,
  BlobUploadError,
  ERROR_CODES,
  ProblemError,
  RunStillRunningError,
  codeFamily,
  renderProblemLines,
  reportedProblem,
  type ProblemDomain,
} from "mthds/errors";
import {
  BadImageOutputError,
  BadPipelineOutputError,
  MethodLoadError,
} from "@/types/pipelineError";

export type PipelineErrorKind =
  // The SDK's failures, each a problem document read by its `code` and, past
  // the few codes handled one by one, by its `domain` (who must act).
  | "api_unreachable"
  | "config_invalid"
  | "auth_missing"
  | "auth_invalid"
  | "account_limited"
  | "bad_request"
  | "method_invalid"
  | "server_error"
  | "run_outcome_unknown"
  | "upload_failed"
  // The app's own failures, from its tagged errors.
  | "method_load_failed"
  | "bad_response"
  | "bad_image_output"
  | "transport_error"
  // Pre-flight validation kinds: built inline by a Server Action before the
  // SDK call (see `runSummarizePdfPipeline` / `fileInputErrorToPipelineError`),
  // never produced by `classifyPipelineError` — there is no thrown error to
  // classify. They are still valid kinds so `<ErrorDisplay>` renders them.
  | "file_too_large"
  | "unsupported_file_type"
  | "unknown";

export interface ErrorHint {
  summary: string;
  /** Optional inline code/command snippet rendered in a `<pre>` block. */
  code?: string;
  codeLanguage?: "bash" | "env" | "json";
  docs?: { label: string; href: string };
}

export interface PipelineError {
  kind: PipelineErrorKind;
  /** Headline, e.g. "MTHDS API not reachable". */
  title: string;
  /** 1–2 sentences explaining what happened in plain language. */
  message: string;
  hint?: ErrorHint;
  /** Raw technical info for the collapsible "Technical details" section. */
  details: string;
}

export interface ClassifyEnv {
  apiUrl: string | undefined;
  hasApiKey: boolean;
}

/** The longest "Technical details" text shown, so a long list of faults cannot flood the page. */
const MAX_DETAILS_LENGTH = 4000;

/**
 * Who must act on a problem, mapped to the kind the page shows. A code this
 * module does not handle one by one is read by its domain, which the SDK reads
 * into the protocol's closed list even for a code it does not know.
 */
const KIND_BY_DOMAIN: Record<ProblemDomain, PipelineErrorKind> = {
  input: "bad_request",
  method: "method_invalid",
  account: "account_limited",
  operator: "server_error",
  runtime: "server_error",
};

export function classifyPipelineError(err: unknown, env: ClassifyEnv): PipelineError {
  if (err instanceof ProblemError) return classifyProblem(err, env);
  if (err instanceof BlobUploadError) return classifyBlobUpload(err);
  if (err instanceof MethodLoadError) return classifyMethodLoad(err);
  if (err instanceof BadImageOutputError) return classifyBadImageOutput(err);
  if (err instanceof BadPipelineOutputError) return classifyBadOutput(err);
  return classifyUnknown(err);
}

/**
 * Every failure of `MthdsApiClient` but a blob upload is a `ProblemError`
 * carrying the MTHDS protocol's problem document, so it is read by its `code`,
 * never by its message or an HTTP status.
 */
function classifyProblem(err: ProblemError, env: ClassifyEnv): PipelineError {
  switch (err.code) {
    case ERROR_CODES.CLIENT_UNREACHABLE:
    case ERROR_CODES.CLIENT_TIMEOUT:
      return classifyUnreachable(err, env);
    case ERROR_CODES.CLIENT_OUTCOME_UNKNOWN:
    case ERROR_CODES.CLIENT_FOLLOW_FAILED:
      return classifyOutcomeUnknown(err);
    case ERROR_CODES.CLIENT_NOT_CONFIGURED:
      return classifyNotConfigured(err);
  }
  if (isAuthRefusal(err)) return classifyAuth(err, env);
  return {
    kind: KIND_BY_DOMAIN[err.domain],
    title: err.problem.title,
    message: problemSentence(err),
    hint: { summary: err.nextStep.detail },
    details: problemDetails(err),
  };
}

function classifyUnreachable(err: ProblemError, env: ClassifyEnv): PipelineError {
  const url =
    (err instanceof ApiTransportError ? err.apiUrl : undefined) || env.apiUrl || "(unknown)";
  const networkCode = err instanceof ApiTransportError ? err.networkCode : undefined;
  const codeSuffix = networkCode ? ` (${networkCode})` : "";
  const details = problemDetails(err);

  if (err.code === ERROR_CODES.CLIENT_TIMEOUT) {
    return {
      kind: "api_unreachable",
      title: "MTHDS API did not answer in time",
      message: `The MTHDS API at ${url} did not answer within the SDK's time limit.`,
      hint: { summary: err.nextStep.detail },
      details,
    };
  }

  if (isLocalhostUrl(url)) {
    return {
      kind: "api_unreachable",
      title: "MTHDS API not reachable",
      message: `Tried to reach the local API at ${url}${codeSuffix}, but nothing answered. The starter expects an MTHDS API running on this machine, such as Pipelex's pipelex-api server.`,
      hint: {
        summary: "Start a local MTHDS API, then retry. With Docker, Pipelex's server is one:",
        code: "docker run --name pipelex-api -p 8081:8081 \\\n  -e OPENAI_API_KEY=your-openai-api-key \\\n  pipelex/pipelex-api:latest",
        codeLanguage: "bash",
        docs: {
          label: "Pipelex API server docs",
          href: "https://docs.pipelex.com/latest/api-server/",
        },
      },
      details,
    };
  }

  return {
    kind: "api_unreachable",
    title: "MTHDS API not reachable",
    message: `Tried to reach ${url}${codeSuffix}, but the request did not get a response. Check the URL and your network connection.`,
    hint: {
      summary: "Verify MTHDS_BASE_URL in .env.local points to a reachable API.",
      code: `MTHDS_BASE_URL=${url}`,
      codeLanguage: "env",
    },
    details,
  };
}

/**
 * The run request left, and its outcome is unknown: the connection was lost
 * after it was sent (`client.outcome_unknown`), or the API accepted the run but
 * answered before it finished (`client.follow_failed`). The run may exist and
 * may be spending credit, so the page says not to run it again blindly.
 */
function classifyOutcomeUnknown(err: ProblemError): PipelineError {
  const runId = err instanceof RunStillRunningError ? err.runId : err.problem.pipeline_run_id;
  const runSentence = runId ? ` Its run id is ${runId}.` : "";
  if (err.code === ERROR_CODES.CLIENT_FOLLOW_FAILED) {
    return {
      kind: "run_outcome_unknown",
      title: "The run is still going",
      message: `The MTHDS API accepted the run but answered before it finished, so this page has no result to show.${runSentence}`,
      hint: { summary: err.nextStep.detail },
      details: problemDetails(err),
    };
  }
  return {
    kind: "run_outcome_unknown",
    title: "The run may have started",
    message: `The connection to the MTHDS API was lost after the run request was sent, so the run may exist.${runSentence}`,
    hint: {
      summary:
        "Look for the run in the API's run history before running it again, since a second run spends again.",
    },
    details: problemDetails(err),
  };
}

/**
 * `MthdsApiClient` refused its configuration before sending anything: a base
 * URL that is not host-only, or an API key an HTTP header cannot carry. The
 * SDK never quotes the key, and neither does this message.
 */
function classifyNotConfigured(err: ProblemError): PipelineError {
  const details = problemDetails(err);
  if (err.problem.params?.setting === "api_key") {
    return {
      kind: "config_invalid",
      title: "MTHDS API key is not usable",
      message: problemSentence(err),
      hint: {
        summary:
          "Set MTHDS_API_KEY in .env.local to the key alone, with no space or line break, and restart the dev server:",
        code: "MTHDS_API_KEY=your-key-here",
        codeLanguage: "env",
      },
      details,
    };
  }
  return {
    kind: "config_invalid",
    title: "MTHDS API URL is not valid",
    message: problemSentence(err),
    hint: {
      summary:
        "Set MTHDS_BASE_URL in .env.local to the API's origin, with no path, and restart the dev server:",
      code: "MTHDS_BASE_URL=http://127.0.0.1:8081",
      codeLanguage: "env",
    },
    details,
  };
}

/**
 * A credential refusal: a problem of the `auth` family, or a `401`/`403` whose
 * body was no problem document (such as a gateway's), which the SDK reads as
 * `client.response_unreadable` and which only its status tells apart.
 */
function isAuthRefusal(err: ProblemError): boolean {
  if (codeFamily(err.code) === "auth") return true;
  return (
    err instanceof ApiResponseError &&
    err.code === ERROR_CODES.CLIENT_RESPONSE_UNREADABLE &&
    (err.status === 401 || err.status === 403)
  );
}

function classifyAuth(err: ProblemError, env: ClassifyEnv): PipelineError {
  const url = (err instanceof ApiResponseError ? err.apiUrl : undefined) || env.apiUrl || "The API";
  const details = problemDetails(err);
  if (!env.hasApiKey) {
    return {
      kind: "auth_missing",
      title: "MTHDS API key missing",
      message: `${url} refused the request because no MTHDS_API_KEY was sent.`,
      hint: {
        summary: "Add your API key to .env.local and restart the dev server:",
        code: "MTHDS_API_KEY=your-key-here",
        codeLanguage: "env",
      },
      details,
    };
  }
  return {
    kind: "auth_invalid",
    title: "MTHDS API key rejected",
    message: `${url} refused the credentials you provided: ${problemSentence(err)} The MTHDS_API_KEY in .env.local is not valid for this API.`,
    hint: {
      summary: "Double-check the key and the API URL it's intended for.",
      code: "MTHDS_API_KEY=your-key-here",
      codeLanguage: "env",
    },
    details,
  };
}

/**
 * A file of the method's tree failed to upload to the store the API named.
 * The SDK uploads only for a tree too large to travel inline, and the error
 * names the store's host, never its upload URL, which grants write access.
 */
function classifyBlobUpload(err: BlobUploadError): PipelineError {
  const status = err.status === undefined ? "could not be reached" : `answered HTTP ${err.status}`;
  return {
    kind: "upload_failed",
    title: "Could not upload the method's files",
    message: `The method's tree was too large to send inline, so the SDK uploaded its files to the store the MTHDS API named, and the store at ${err.host} ${status}. The run was not sent.`,
    hint: { summary: "Retry. If it keeps failing, the API's file store may be unavailable." },
    details: `${err.name}: ${err.message}\nblob: ${err.sha256}`,
  };
}

function classifyMethodLoad(err: MethodLoadError): PipelineError {
  const message =
    err.code === "not_found"
      ? `The method directory methods/${err.method}/ does not exist. Each example runs the method in its own directory under methods/.`
      : `The method directory methods/${err.method}/ holds something a method's tree cannot (${err.code}), so it cannot be sent.`;
  return {
    kind: "method_load_failed",
    title: "Method could not be read",
    message,
    details: `${err.name} (${err.code}): ${err.message}`,
  };
}

function classifyBadOutput(err: BadPipelineOutputError): PipelineError {
  return {
    kind: "bad_response",
    title: "Pipeline output didn't match the expected shape",
    message:
      "The pipeline ran but its output didn't match the shape this example expects. This usually means the bundle was edited or the LLM produced something unexpected.",
    details: `${err.name}: ${err.message}`,
  };
}

function classifyBadImageOutput(err: BadImageOutputError): PipelineError {
  if (err.nonWebUrl) {
    return {
      kind: "bad_image_output",
      title: "Generated image isn't web-accessible",
      message:
        "The pipeline generated an image, but the MTHDS API returned a URL a browser can't load — typically a file:// path on the API server's disk. This happens when the API uses the local file storage provider.",
      hint: {
        summary:
          "Configure the MTHDS API with an S3 or GCP storage provider so it returns presigned HTTPS URLs. Set this in pipelex-api's .pipelex/pipelex.toml:",
        code: '[storage]\nmethod = "s3"  # or "gcp"',
        codeLanguage: "env",
        docs: { label: "Pipelex storage configuration", href: "https://docs.pipelex.com/" },
      },
      details: `${err.name}: ${err.message}`,
    };
  }
  return {
    kind: "bad_image_output",
    title: "Image generation returned no usable image",
    message:
      "The pipeline ran but its output didn't contain an image URL. The image model may have refused the prompt or returned an unexpected shape.",
    details: `${err.name}: ${err.message}`,
  };
}

/**
 * Classify a client-side rejection of an awaited Server Action call.
 *
 * Distinct from `classifyPipelineError`: the Server Action's own try/catch
 * already routes every application-level failure into a structured
 * `{ ok: false, error }` result, so a rejected await here is by construction
 * a *transport* failure — the browser couldn't deliver the request, the dev
 * server died mid-call, or the page is running against a stale build whose
 * Server Action IDs no longer resolve. The SDK error classes referenced by
 * `classifyPipelineError` only exist server-side and are stripped to opaque
 * digests when crossing the boundary in production, so they would never
 * `instanceof`-match here. Without this helper, rejections inside
 * `startTransition` bypass `<ErrorDisplay>` and bubble to React's nearest
 * error boundary instead.
 */
export function classifyTransportError(err: unknown): PipelineError {
  const message = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "Unknown";
  return {
    kind: "transport_error",
    title: "Could not reach the server",
    message:
      "The browser couldn't deliver the request to the Next.js server. The dev server may have stopped, the network may have dropped, or this page may be running against a stale build whose Server Action IDs no longer exist on the deployed server.",
    hint: {
      summary:
        "Reload the page. If the problem persists, check your network and confirm the server is reachable.",
    },
    details: `${name}: ${message}`,
  };
}

function classifyUnknown(err: unknown): PipelineError {
  const message = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "Unknown";
  return {
    kind: "unknown",
    title: "Something went wrong",
    message:
      "The starter caught an unexpected error. The technical details below should help track it down.",
    details: `${name}: ${message}`,
  };
}

/**
 * The problem's own sentence: the `message` member a runtime or the SDK may
 * add for this occurrence, else the registry's `detail`.
 */
function problemSentence(err: ProblemError): string {
  const { message, detail } = err.problem;
  return typeof message === "string" && message ? message : detail;
}

/**
 * The problem as the `mthds` CLI prints it — its sentences, its next step, its
 * code and every fault its `errors` list, each with the file and line it is
 * in — after the route and status of the answer it came on, and the start of
 * the body when the body was no problem document. `responseBody` itself is
 * never shown: it can hold the presigned upload URLs of a blob-store answer.
 */
function problemDetails(err: ProblemError): string {
  const context: string[] = [];
  if (err instanceof ApiResponseError) {
    context.push(`${err.route} answered HTTP ${err.status} ${err.statusText}`.trim());
    if (err.answerExcerpt) context.push(`The server answered: ${err.answerExcerpt}`);
  }
  if (err.cause instanceof Error) context.push(`Caused by: ${err.cause.message}`);
  const lines = [err.name, ...renderProblemLines(reportedProblem(err), context)];
  return truncate(lines.join("\n"), MAX_DETAILS_LENGTH);
}

function isLocalhostUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host === "[::1]"
    );
  } catch {
    return false;
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}… (truncated)`;
}
