// Import from the client-safe `mthds/errors` subpath, not the top-level `mthds`
// barrel. This module is bundled into the client (client components import
// `classifyTransportError` + the `PipelineError` type from here), and the
// top-level barrel pulls `MthdsApiClient` → `node:fs` into the graph, which a
// client bundler cannot externalize. `mthds/errors` exports the problem
// document's types and readers and the SDK's error classes, and carries no Node
// built-ins.
import {
  ApiResponseError,
  ApiTransportError,
  formatItem,
  formatLocation,
  formatSuggestedFix,
  isProblemError,
  problemDomain,
  problemRequestId,
  problemRetry,
  problemStepKind,
  reportedProblem,
  type Problem,
  type ProblemDomain,
} from "mthds/errors";
import { BadImageOutputError, BadPipelineOutputError } from "@/types/pipelineError";

export interface ErrorHint {
  summary: string;
  /** Optional inline code/command snippet rendered in a `<pre>` block. */
  code?: string;
  codeLanguage?: "bash" | "env" | "json";
  docs?: { label: string; href: string };
}

/**
 * What `<ErrorDisplay>` renders. A failure of the MTHDS API, or one the SDK
 * detected itself, is read from its problem document: its title and detail,
 * its next step, who must act (`domain`), its code and its request id. A
 * failure the app catches itself (an empty input, a file refused before
 * sending, an output the app cannot read) is written here, with no code.
 */
export interface PipelineError {
  /**
   * Who must act, the problem's `domain` read into the protocol's closed list:
   * the caller (`input`), the method's author, the account's owner, whoever
   * runs the API (`operator`), or nobody beforehand (`runtime`). It sets the
   * tone `<ErrorDisplay>` renders with.
   */
  domain: ProblemDomain;
  /** Headline: the problem's title, or the app's own. */
  title: string;
  /** What happened, in one or two sentences: the problem's detail, or the app's own. */
  message: string;
  /** The problem's next step, as the API or the SDK wrote it. */
  nextStep?: string;
  /** This app's own help for that step: where to look and what to type. */
  hint?: ErrorHint;
  /** The problem's code, under "Technical details". Absent for a failure the app caught itself. */
  code?: string;
  /** The API's id for the request that failed, to hand to whoever runs the API. */
  requestId?: string;
  /** Raw technical info for the collapsible "Technical details" section. */
  details: string;
}

/**
 * Turn whatever a Server Action caught into a `PipelineError`. Every error the
 * `mthds` SDK raises carries a problem document, so it is read from that
 * problem alone, never from its class or a server class name. The tagged
 * errors of the app's own output narrowers and a missing bundle file are
 * classified here, since no problem describes them.
 */
export function classifyPipelineError(err: unknown): PipelineError {
  if (isProblemError(err)) return presentProblem(reportedProblem(err), answerLines(err));
  if (err instanceof BadImageOutputError) return classifyBadImageOutput(err);
  if (err instanceof BadPipelineOutputError) return classifyBadOutput(err);
  if (isFsNotFound(err)) return classifyBundleMissing(err);
  return classifyUnknown(err);
}

function presentProblem(problem: Problem, answer: string[]): PipelineError {
  const domain = problemDomain(problem);
  return {
    domain,
    title: problem.title,
    message: problemSentences(problem),
    nextStep: problem.next_step.detail,
    hint: hintFor(problem, domain),
    code: problem.code,
    requestId: problemRequestId(problem),
    details: problemDetails(problem, domain, answer),
  };
}

/**
 * This app's help for the problem's next step, chosen by the step's kind and
 * by who must act. The step's own sentence is always shown; a hint adds where,
 * in this app, the fix goes.
 */
function hintFor(problem: Problem, domain: ProblemDomain): ErrorHint | undefined {
  // The one code with help of its own: a step of `retry` cannot say that the
  // API the app points at may simply not be running.
  if (problem.code === "client.unreachable") return startApiHint(problem);
  switch (problemStepKind(problem)) {
    case "check_credentials":
      // A provider refusing the API's own key is the API's set-up, not the app's key.
      return domain === "operator" ? RUNTIME_SETUP_HINT : API_KEY_HINT;
    case "fix_configuration":
      return domain === "operator" ? RUNTIME_SETUP_HINT : APP_CONFIGURATION_HINT;
    case "change_method":
      return BUNDLE_HINT;
    default:
      return undefined;
  }
}

const API_KEY_HINT: ErrorHint = {
  summary: "Set the key this MTHDS API accepts in .env.local, then restart the dev server:",
  code: "MTHDS_API_KEY=your-key-here",
  codeLanguage: "env",
};

const APP_CONFIGURATION_HINT: ErrorHint = {
  summary:
    "Set MTHDS_BASE_URL and MTHDS_API_KEY in .env.local, starting from the example file, then restart the dev server:",
  code: "cp .env.example .env.local",
  codeLanguage: "bash",
};

const RUNTIME_SETUP_HINT: ErrorHint = {
  summary:
    "This is the MTHDS API's own set-up, not this app's: whoever runs the API configures it. On a Pipelex runner you run yourself, that means its inference backends and their keys.",
  docs: {
    label: "Pipelex API server configuration",
    href: "https://docs.pipelex.com/latest/api-server/configuration/",
  },
};

const BUNDLE_HINT: ErrorHint = {
  summary:
    "Fix the example's bundle, methods/<name>/main.mthds, then run it again. Each fault the API found is listed under Technical details.",
};

function startApiHint(problem: Problem): ErrorHint {
  const baseUrl = typeof problem.params?.base_url === "string" ? problem.params.base_url : null;
  const port = baseUrl ? localPort(baseUrl) : null;
  if (baseUrl && port) {
    return {
      summary: `Start the MTHDS API at ${baseUrl}, then try again. To run Pipelex's runner there from its Docker image:`,
      code: `docker run -p ${port}:8081 -e OPENAI_API_KEY=your-openai-api-key pipelex/pipelex-api:latest`,
      codeLanguage: "bash",
    };
  }
  return {
    summary:
      "Check that MTHDS_BASE_URL in .env.local names an MTHDS API that is up, then restart the dev server:",
    code: `MTHDS_BASE_URL=${baseUrl ?? "https://your-mthds-api.example.com"}`,
    codeLanguage: "env",
  };
}

/** The problem's detail, then the SDK's own sentence when it built the problem with one. */
function problemSentences(problem: Problem): string {
  const own = problem.message;
  return typeof own === "string" && own.length > 0 && own !== problem.detail
    ? `${problem.detail} ${own}`
    : problem.detail;
}

/**
 * What the problem says beyond its sentences, for "Technical details": what
 * the server answered, the retry verdict, the run and the location, and every
 * fault of a problem that lists several, such as a method that does not
 * validate. The code and the request id are fields of their own.
 */
function problemDetails(problem: Problem, domain: ProblemDomain, answer: string[]): string {
  const verdict = [`domain ${domain}`, `retry ${problemRetry(problem)}`];
  if (typeof problem.retry_after === "number") verdict.push(`after ${problem.retry_after} seconds`);
  const lines = [...answer, verdict.join(", ")];
  if (problem.pipeline_run_id !== undefined) lines.push(`run: ${problem.pipeline_run_id}`);
  const where = formatLocation(problem.location);
  if (where) lines.push(`location: ${where}`);
  for (const item of problem.errors ?? []) {
    lines.push(`- ${formatItem(item)}`);
    if (item.suggested_fix !== undefined) lines.push(`  ${formatSuggestedFix(item.suggested_fix)}`);
  }
  return lines.join("\n");
}

/** What the error knows of the exchange beside its problem: the server's answer, or the network's failure. */
function answerLines(err: unknown): string[] {
  if (err instanceof ApiResponseError) {
    const lines = [`${err.route} answered HTTP ${err.status} ${err.statusText}`.trim()];
    if (err.answerExcerpt) lines.push(`the server said: ${err.answerExcerpt}`);
    return lines;
  }
  if (err instanceof ApiTransportError && err.networkCode) {
    return [`network error: ${err.networkCode}`];
  }
  return [];
}

function classifyBadOutput(err: BadPipelineOutputError): PipelineError {
  return {
    domain: "method",
    title: "Pipeline output didn't match the expected shape",
    message:
      "The pipeline ran but its output didn't match the shape this example expects. This usually means the bundle was edited or the LLM produced something unexpected.",
    details: `${err.name}: ${err.message}`,
  };
}

function classifyBadImageOutput(err: BadImageOutputError): PipelineError {
  if (err.nonWebUrl) {
    return {
      domain: "operator",
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
    domain: "method",
    title: "Image generation returned no usable image",
    message:
      "The pipeline ran but its output didn't contain an image URL. The image model may have refused the prompt or returned an unexpected shape.",
    details: `${err.name}: ${err.message}`,
  };
}

function classifyBundleMissing(err: unknown): PipelineError {
  const e = err as NodeJS.ErrnoException;
  return {
    domain: "method",
    title: "Pipeline bundle not found",
    message: `Could not read the .mthds bundle from disk (${e.code ?? "fs error"}). The starter ships with extract_entities.mthds — make sure it's still there.`,
    details: `${e.name}: ${e.message}`,
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
 * Server Action IDs no longer resolve. The SDK's errors only exist
 * server-side and are stripped to opaque digests when crossing the boundary
 * in production, so no problem document survives to be read here. Without
 * this helper, rejections inside `startTransition` bypass `<ErrorDisplay>`
 * and bubble to React's nearest error boundary instead.
 */
export function classifyTransportError(err: unknown): PipelineError {
  const message = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "Unknown";
  return {
    domain: "runtime",
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
    domain: "runtime",
    title: "Something went wrong",
    message:
      "The starter caught an unexpected error. The technical details below should help track it down.",
    details: `${name}: ${message}`,
  };
}

/** The port of a base URL on this machine, or null when the URL names another host. */
function localPort(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const isLocal =
      host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "[::1]";
    if (!isLocal) return null;
    return parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  } catch {
    return null;
  }
}

function isFsNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}
