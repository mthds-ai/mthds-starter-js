import { describe, it, expect } from "vitest";
import { MthdsApiClient } from "mthds";
import {
  ApiResponseError,
  ApiTransportError,
  BlobUploadError,
  RunStillRunningError,
  problemError,
  type CoreErrorCode,
  type Problem,
  type ProblemParamsByCode,
} from "mthds/errors";
import {
  BadImageOutputError,
  BadPipelineOutputError,
  MethodLoadError,
} from "@/types/pipelineError";
import { classifyPipelineError, classifyTransportError, type ClassifyEnv } from "./errors";

const LOCAL_ENV: ClassifyEnv = { apiUrl: "http://localhost:8081", hasApiKey: true };
const CLOUD_ENV: ClassifyEnv = { apiUrl: "https://api.example.com", hasApiKey: true };

/** The problem document of a core code, as the SDK builds it from the registry. */
function problemOf<Code extends CoreErrorCode>(
  code: Code,
  params: ProblemParamsByCode[Code],
  status?: number,
): Problem {
  const { problem } = problemError(code, params);
  return status === undefined ? problem : { ...problem, status };
}

/** No answer came back: what `MthdsApiClient` throws for a transport failure. */
function noAnswer(
  code: "client.unreachable" | "client.timeout" | "client.outcome_unknown",
  apiUrl: string,
  networkCode?: string,
): ApiTransportError {
  const problem =
    code === "client.unreachable"
      ? problemOf(code, { base_url: apiUrl })
      : code === "client.timeout"
        ? problemOf(code, { seconds: 30 })
        : problemOf(code, {});
  return new ApiTransportError(problem, { apiUrl, networkCode });
}

/** The API answered with a problem document: what `MthdsApiClient` throws for a refusal. */
function refusal(problem: Problem, status: number, statusText = ""): ApiResponseError {
  return new ApiResponseError(problem, {
    apiUrl: "https://api.example.com",
    route: "POST /v1/execute",
    status,
    statusText,
    responseBody: JSON.stringify(problem),
    bodyIsProblem: true,
  });
}

describe("classifyPipelineError — no answer from the API", () => {
  it("uses the localhost branch when the API is local", () => {
    const result = classifyPipelineError(
      noAnswer("client.unreachable", "http://localhost:8081", "ECONNREFUSED"),
      LOCAL_ENV,
    );
    expect(result.kind).toBe("api_unreachable");
    expect(result.title).toBe("MTHDS API not reachable");
    expect(result.message).toContain("ECONNREFUSED");
    expect(result.message).toContain("http://localhost:8081");
    expect(result.hint?.code).toContain("pipelex/pipelex-api");
    expect(result.hint?.codeLanguage).toBe("bash");
    expect(result.details).toContain("client.unreachable");
  });

  it("uses the remote branch when the API is not local", () => {
    const result = classifyPipelineError(
      noAnswer("client.unreachable", "https://api.example.com", "ENOTFOUND"),
      CLOUD_ENV,
    );
    expect(result.kind).toBe("api_unreachable");
    expect(result.message).toContain("https://api.example.com");
    expect(result.hint?.summary).toMatch(/MTHDS_BASE_URL/);
    expect(result.hint?.code).toBe("MTHDS_BASE_URL=https://api.example.com");
  });

  it("handles a failure with no network code", () => {
    const result = classifyPipelineError(
      noAnswer("client.unreachable", "http://localhost:8081"),
      LOCAL_ENV,
    );
    expect(result.kind).toBe("api_unreachable");
    expect(result.message).not.toContain("undefined");
  });

  it("says the API did not answer in time on a client timeout", () => {
    const result = classifyPipelineError(
      noAnswer("client.timeout", "https://api.example.com"),
      CLOUD_ENV,
    );
    expect(result.kind).toBe("api_unreachable");
    expect(result.title).toMatch(/in time/);
    expect(result.hint?.summary).toMatch(/again/);
  });

  it("warns that a run whose request left may exist", () => {
    const result = classifyPipelineError(
      noAnswer("client.outcome_unknown", "https://api.example.com", "ECONNRESET"),
      CLOUD_ENV,
    );
    expect(result.kind).toBe("run_outcome_unknown");
    expect(result.title).toMatch(/may have started/);
    expect(result.hint?.summary).toMatch(/run history/);
  });
});

describe("classifyPipelineError — a run the API accepted but did not finish", () => {
  it("names the run that is still going", () => {
    const err = new RunStillRunningError(
      problemOf("client.follow_failed", { pipeline_run_id: "run-42" }),
      {
        apiUrl: "https://api.example.com",
        route: "POST /v1/execute",
        status: 202,
        statusText: "Accepted",
        responseBody: '{"pipeline_run_id":"run-42"}',
        runId: "run-42",
      },
    );
    const result = classifyPipelineError(err, CLOUD_ENV);
    expect(result.kind).toBe("run_outcome_unknown");
    expect(result.title).toBe("The run is still going");
    expect(result.message).toContain("run-42");
    expect(result.hint?.summary).toContain("run-42");
  });
});

describe("classifyPipelineError — the SDK refuses its configuration", () => {
  it("reports a base URL with a path, as the real client refuses it", () => {
    let thrown: unknown;
    try {
      new MthdsApiClient({ baseUrl: "http://127.0.0.1:8081/v1", apiKey: "test-api-key" });
    } catch (err) {
      thrown = err;
    }
    const result = classifyPipelineError(thrown, LOCAL_ENV);
    expect(result.kind).toBe("config_invalid");
    expect(result.title).toMatch(/URL/);
    expect(result.message).toContain("http://127.0.0.1:8081/v1");
    expect(result.hint?.code).toBe("MTHDS_BASE_URL=http://127.0.0.1:8081");
  });

  it("reports an API key a header cannot carry, without quoting it", () => {
    let thrown: unknown;
    try {
      new MthdsApiClient({ baseUrl: "http://127.0.0.1:8081", apiKey: "secret-key \n" });
    } catch (err) {
      thrown = err;
    }
    const result = classifyPipelineError(thrown, LOCAL_ENV);
    expect(result.kind).toBe("config_invalid");
    expect(result.title).toMatch(/key/);
    expect(result.hint?.code).toBe("MTHDS_API_KEY=your-key-here");
    expect(JSON.stringify(result)).not.toContain("secret-key");
  });
});

describe("classifyPipelineError — credential refusals", () => {
  const invalid = () => refusal(problemOf("auth.invalid_credential", {}, 401), 401, "Unauthorized");

  it("returns auth_missing when no key is set", () => {
    const result = classifyPipelineError(invalid(), {
      apiUrl: "https://api.example.com",
      hasApiKey: false,
    });
    expect(result.kind).toBe("auth_missing");
    expect(result.title).toContain("missing");
    expect(result.hint?.code).toContain("MTHDS_API_KEY");
  });

  it("returns auth_invalid when a key is present", () => {
    const result = classifyPipelineError(invalid(), CLOUD_ENV);
    expect(result.kind).toBe("auth_invalid");
    expect(result.title).toContain("rejected");
    expect(result.message).toContain("refused the request's credential");
  });

  it("treats a forbidden credential like a refused one", () => {
    const err = refusal(
      problemOf("auth.forbidden", { requirement: "runs:write" }, 403),
      403,
      "Forbidden",
    );
    expect(classifyPipelineError(err, CLOUD_ENV).kind).toBe("auth_invalid");
  });

  it("reads a 401 whose body is no problem document as a credential refusal", () => {
    const err = new ApiResponseError(problemOf("client.response_unreadable", { status: 401 }), {
      apiUrl: "https://api.example.com",
      route: "POST /v1/execute",
      status: 401,
      statusText: "Unauthorized",
      responseBody: JSON.stringify({ detail: "Invalid authentication token" }),
      bodyIsProblem: false,
    });
    const result = classifyPipelineError(err, CLOUD_ENV);
    expect(result.kind).toBe("auth_invalid");
    expect(result.details).toContain("Invalid authentication token");
  });
});

describe("classifyPipelineError — a problem read by who must act", () => {
  it.each([
    ["input.missing", { input: "text" }, 422, "bad_request"],
    ["account.quota_exhausted", { quota: "runs" }, 429, "account_limited"],
    [
      "model.unavailable",
      { model: "gpt-x", model_type: "llm", reason: "not_served" },
      501,
      "server_error",
    ],
    ["provider.unavailable", { provider: "openai" }, 502, "server_error"],
  ] as const)("%s → %s", (code, params, status, kind) => {
    const problem = problemOf(code as CoreErrorCode, params as never, status);
    const result = classifyPipelineError(refusal(problem, status), CLOUD_ENV);
    expect(result.kind).toBe(kind);
    expect(result.title).toBe(problem.title);
    expect(result.message).toBe(problem.detail);
    expect(result.hint?.summary).toBe(problem.next_step.detail);
    expect(result.details).toContain(`POST /v1/execute answered HTTP ${status}`);
    expect(result.details).toContain(code);
  });

  it("shows each fault of a method that does not validate, with its file and line", () => {
    const problem: Problem = {
      ...problemOf("method.invalid", {}, 422),
      errors: [
        {
          code: "method.pipe_unresolved",
          detail: "The pipe 'summarise' does not exist.",
          location: { pipe: "summarize_pdf", file: "main.mthds", line: 12 },
        },
      ],
    };
    const result = classifyPipelineError(refusal(problem, 422), CLOUD_ENV);
    expect(result.kind).toBe("method_invalid");
    expect(result.title).toBe(problem.title);
    expect(result.details).toContain("The pipe 'summarise' does not exist.");
    expect(result.details).toContain("main.mthds");
  });

  it("reads a runtime's own code by the domain it declares", () => {
    const problem: Problem = {
      type: "https://docs.pipelex.com/errors/pipelex.billing.credit_exhausted",
      title: "The organization is out of credit",
      status: 402,
      detail: "The organization has no credit left to run this method.",
      code: "pipelex.billing.credit_exhausted",
      domain: "account",
      retry: "no",
      next_step: { kind: "check_account", detail: "Add credit to the organization." },
    };
    const result = classifyPipelineError(refusal(problem, 402), CLOUD_ENV);
    expect(result.kind).toBe("account_limited");
    expect(result.title).toBe("The organization is out of credit");
    expect(result.hint?.summary).toBe("Add credit to the organization.");
  });

  it("reads a domain it does not know as the runtime's", () => {
    const problem: Problem = {
      type: "https://example.com/errors/acme.engine.jammed",
      title: "The engine jammed",
      status: 500,
      detail: "The engine jammed.",
      code: "acme.engine.jammed",
      domain: "galaxy",
      retry: "maybe",
      next_step: { kind: "pray", detail: "Wait for the engine." },
    };
    expect(classifyPipelineError(refusal(problem, 500), CLOUD_ENV).kind).toBe("server_error");
  });

  it("keeps a runtime's own sentence over the registry's detail", () => {
    const problem: Problem = {
      ...problemOf("runtime.unexpected", {}, 500),
      message: "The worker crashed while loading the method.",
    };
    const result = classifyPipelineError(refusal(problem, 500), CLOUD_ENV);
    expect(result.message).toBe("The worker crashed while loading the method.");
  });

  it("truncates very long details", () => {
    const problem: Problem = {
      ...problemOf("method.invalid", {}, 422),
      errors: Array.from({ length: 500 }, (_, i) => ({
        code: "method.syntax",
        detail: `Fault number ${i} of a very broken method.`,
      })),
    };
    const result = classifyPipelineError(refusal(problem, 422), CLOUD_ENV);
    expect(result.details).toContain("truncated");
    expect(result.details.length).toBeLessThan(4100);
  });
});

describe("classifyPipelineError — BlobUploadError", () => {
  it("names the store's host, never the upload URL", () => {
    const err = new BlobUploadError(
      "Uploading a blob to store.example.com failed with HTTP 503.",
      "ab".repeat(32),
      503,
      "store.example.com",
    );
    const result = classifyPipelineError(err, CLOUD_ENV);
    expect(result.kind).toBe("upload_failed");
    expect(result.message).toContain("store.example.com");
    expect(result.message).toContain("HTTP 503");
  });
});

describe("classifyPipelineError — MethodLoadError", () => {
  it("says which method directory is missing", () => {
    const err = new MethodLoadError("hello", "not_found", "Cannot read 'methods/hello': ENOENT");
    const result = classifyPipelineError(err, LOCAL_ENV);
    expect(result.kind).toBe("method_load_failed");
    expect(result.message).toContain("methods/hello/");
    expect(result.details).toContain("ENOENT");
  });

  it("names the refusal of a directory a tree cannot hold", () => {
    const err = new MethodLoadError("hello", "symbolic_link", "'alias.mthds' is a symbolic link");
    const result = classifyPipelineError(err, LOCAL_ENV);
    expect(result.kind).toBe("method_load_failed");
    expect(result.message).toContain("symbolic_link");
  });
});

describe("classifyPipelineError — BadPipelineOutputError", () => {
  it("returns bad_response", () => {
    const err = new BadPipelineOutputError("missing field");
    const result = classifyPipelineError(err, LOCAL_ENV);
    expect(result.kind).toBe("bad_response");
    expect(result.title).toContain("output");
    expect(result.details).toContain("BadPipelineOutputError");
    expect(result.details).toContain("missing field");
  });
});

describe("classifyPipelineError — BadImageOutputError", () => {
  it("returns bad_image_output", () => {
    const err = new BadImageOutputError("no image url");
    const result = classifyPipelineError(err, LOCAL_ENV);
    expect(result.kind).toBe("bad_image_output");
    expect(result.title).toMatch(/image/i);
    expect(result.details).toContain("BadImageOutputError");
    expect(result.details).toContain("no image url");
  });

  it("recommends S3/GCP storage when the image URL isn't web-accessible", () => {
    const err = new BadImageOutputError(
      'The pipeline returned an image at "file:///tmp/storage/abc.png", but a browser cannot load a file: URL.',
      { nonWebUrl: "file:///tmp/storage/abc.png" },
    );
    const result = classifyPipelineError(err, LOCAL_ENV);
    expect(result.kind).toBe("bad_image_output");
    expect(result.title).toMatch(/web-accessible/i);
    expect(result.hint?.summary).toMatch(/S3 or GCP/);
    expect(result.hint?.code).toContain("[storage]");
    expect(result.details).toContain("file:///tmp/storage/abc.png");
  });
});

describe("classifyPipelineError — unknown fallback", () => {
  it("returns unknown for plain Error", () => {
    const err = new Error("???");
    const result = classifyPipelineError(err, LOCAL_ENV);
    expect(result.kind).toBe("unknown");
    expect(result.details).toContain("???");
  });

  it("returns unknown for non-Error throws", () => {
    const result = classifyPipelineError("a string was thrown", LOCAL_ENV);
    expect(result.kind).toBe("unknown");
    expect(result.details).toContain("a string was thrown");
  });
});

describe("classifyTransportError", () => {
  it("returns transport_error for fetch-style TypeError rejections", () => {
    const err = new TypeError("Failed to fetch");
    const result = classifyTransportError(err);
    expect(result.kind).toBe("transport_error");
    expect(result.title).toMatch(/server/i);
    expect(result.details).toContain("TypeError");
    expect(result.details).toContain("Failed to fetch");
    expect(result.hint?.summary).toMatch(/[Rr]eload/);
  });

  it("includes the original Error name and message in details", () => {
    const err = Object.assign(new Error("connection reset"), { name: "AbortError" });
    const result = classifyTransportError(err);
    expect(result.details).toBe("AbortError: connection reset");
  });

  it("handles non-Error throws", () => {
    const result = classifyTransportError("disconnected");
    expect(result.kind).toBe("transport_error");
    expect(result.details).toContain("disconnected");
    expect(result.details).toContain("Unknown");
  });
});
