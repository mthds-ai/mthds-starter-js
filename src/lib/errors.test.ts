import { describe, it, expect } from "vitest";
import {
  ApiResponseError,
  ApiTransportError,
  buildProblem,
  problemError,
  type BuildProblemOptions,
  type Problem,
} from "mthds/errors";
import { BadImageOutputError, BadPipelineOutputError } from "@/types/pipelineError";
import { classifyPipelineError, classifyTransportError } from "./errors";

const LOCAL_API = "http://127.0.0.1:8081";
const HOSTED_API = "https://api.example.com";

/**
 * The error the SDK raises for an answer of the API that is not the route's
 * result: here, the problem document the API answered with.
 */
function refusal(
  problem: Problem,
  facts: { status?: number; statusText?: string; requestIdHeader?: string } = {},
): ApiResponseError {
  const status = facts.status ?? problem.status ?? 500;
  return new ApiResponseError(problem, {
    apiUrl: LOCAL_API,
    route: "POST /v1/execute",
    status,
    statusText: facts.statusText ?? "",
    responseBody: JSON.stringify(problem),
    requestIdHeader: facts.requestIdHeader,
    bodyIsProblem: true,
  });
}

/** The problem of a registered code, with the step aimed at whoever acts on it. */
function answered(
  code: Parameters<typeof buildProblem>[0],
  params: Record<string, unknown>,
  options: BuildProblemOptions = {},
): Problem {
  // The params are typed per code; the tests pass each code its own.
  return buildProblem(code, params as never, { reader: "actor", ...options });
}

/** The error the SDK raises when nothing answers at the API's base URL. */
function unreachable(apiUrl: string): ApiTransportError {
  return new ApiTransportError(buildProblem("client.unreachable", { base_url: apiUrl }), {
    apiUrl,
    networkCode: "ECONNREFUSED",
  });
}

describe("classifyPipelineError — reading the problem", () => {
  it("shows the problem's title, detail, next step, code and request id", () => {
    const problem = {
      ...answered("auth.invalid_credential", {}, { status: 401 }),
      request_id: "req_123",
    };
    const result = classifyPipelineError(refusal(problem, { statusText: "Unauthorized" }));
    expect(result.title).toBe(problem.title);
    expect(result.message).toBe(problem.detail);
    expect(result.nextStep).toBe(problem.next_step.detail);
    expect(result.domain).toBe("account");
    expect(result.code).toBe("auth.invalid_credential");
    expect(result.requestId).toBe("req_123");
    expect(result.details).toContain("POST /v1/execute answered HTTP 401 Unauthorized");
    expect(result.details).toContain("domain account, retry no");
  });

  it("takes the request id from the answer's header when the problem names none", () => {
    const problem = answered("runtime.unexpected", {}, { status: 500 });
    const result = classifyPipelineError(refusal(problem, { requestIdHeader: "req_from_header" }));
    expect(result.requestId).toBe("req_from_header");
  });

  it("quotes the start of a body that is no problem document", () => {
    const problem = buildProblem("client.response_unreadable", { status: 502 }, { status: 502 });
    const err = new ApiResponseError(problem, {
      apiUrl: HOSTED_API,
      route: "POST /v1/execute",
      status: 502,
      statusText: "Bad Gateway",
      responseBody: "<html>upstream down</html>",
      bodyIsProblem: false,
    });
    const result = classifyPipelineError(err);
    expect(result.code).toBe("client.response_unreadable");
    expect(result.details).toContain("POST /v1/execute answered HTTP 502 Bad Gateway");
    expect(result.details).toContain("the server said: <html>upstream down</html>");
  });

  it("lists every fault of a problem with several, with its location", () => {
    const problem = answered(
      "method.invalid",
      {},
      {
        status: 422,
        errors: [
          {
            code: "method.syntax",
            detail: "The bundle is not valid TOML.",
            location: { file: "main.mthds", line: 3 },
          },
        ],
      },
    );
    const result = classifyPipelineError(refusal(problem));
    expect(result.domain).toBe("method");
    expect(result.details).toContain(
      "- method.syntax: The bundle is not valid TOML. (file 'main.mthds', line 3)",
    );
  });

  it("adds the SDK's own sentence to a problem it built with one", () => {
    const err = problemError(
      "client.not_configured",
      { setting: "base_url" },
      { message: 'Invalid API base URL "localhost": must be host-only.' },
    );
    const result = classifyPipelineError(err);
    expect(result.message).toContain("The client's setting 'base_url' is missing or unusable.");
    expect(result.message).toContain('Invalid API base URL "localhost"');
  });

  it("states the retry verdict and its delay", () => {
    const problem = answered(
      "account.rate_limited",
      { limit: 60, window: 60 },
      { status: 429, retryAfter: 30 },
    );
    const result = classifyPipelineError(refusal(problem));
    expect(result.details).toContain("domain account, retry yes, after 30 seconds");
  });

  it("reads a domain and a step kind it does not know by the protocol's fallbacks", () => {
    const problem: Problem = {
      ...answered("runtime.unexpected", {}, { status: 500 }),
      code: "pipelex.galaxy.unknown",
      domain: "galaxy",
      next_step: { kind: "dance", detail: "Do something new." },
    };
    const result = classifyPipelineError(refusal(problem));
    expect(result.domain).toBe("runtime");
    expect(result.nextStep).toBe("Do something new.");
    expect(result.hint).toBeUndefined();
  });

  it("never parses the SDK's error message", () => {
    const err = unreachable(LOCAL_API);
    Object.defineProperty(err, "message", { value: "a message that names nothing useful" });
    const result = classifyPipelineError(err);
    expect(result.code).toBe("client.unreachable");
    expect(result.title).toBe("The runtime could not be reached");
  });
});

describe("classifyPipelineError — the hint for each next step", () => {
  const cases: Array<{
    name: string;
    problem: Problem;
    stepKind: string;
    hint: { summary?: RegExp; code?: RegExp; docs?: RegExp } | undefined;
  }> = [
    {
      name: "check_credentials of the caller's account gives the MTHDS_API_KEY snippet",
      problem: answered("auth.missing_credential", {}, { status: 401 }),
      stepKind: "check_credentials",
      hint: { summary: /\.env\.local/, code: /^MTHDS_API_KEY=/ },
    },
    {
      name: "check_credentials of the API's own provider key gives the runtime set-up",
      problem: answered("provider.credential_refused", { provider: "openai" }, { status: 502 }),
      stepKind: "check_credentials",
      hint: { summary: /MTHDS API's own set-up/, docs: /api-server\/configuration/ },
    },
    {
      name: "fix_configuration of the runtime gives the runtime set-up",
      problem: answered("runtime.misconfigured", { component: "storage" }, { status: 500 }),
      stepKind: "fix_configuration",
      hint: { summary: /MTHDS API's own set-up/, docs: /api-server\/configuration/ },
    },
    {
      name: "fix_configuration of the app's own settings gives the .env.local set-up",
      problem: buildProblem("client.not_configured", { setting: "api_key" }),
      stepKind: "fix_configuration",
      hint: {
        summary: /MTHDS_BASE_URL and MTHDS_API_KEY/,
        code: /^cp \.env\.example \.env\.local$/,
      },
    },
    {
      name: "change_method points at the example's bundle",
      problem: answered("method.invalid", {}, { status: 422 }),
      stepKind: "change_method",
      hint: { summary: /methods\/<name>\/main\.mthds/ },
    },
    {
      name: "change_input shows the problem's own step and no hint",
      problem: answered("input.missing", { input: "text" }, { status: 422 }),
      stepKind: "change_input",
      hint: undefined,
    },
    {
      name: "read_run, when a run's outcome is unknown, shows the step and no hint",
      problem: buildProblem("client.outcome_unknown", {}),
      stepKind: "read_run",
      hint: undefined,
    },
    {
      name: "report shows the problem's own step and no hint",
      problem: answered("runtime.unexpected", {}, { status: 500 }),
      stepKind: "report",
      hint: undefined,
    },
  ];

  it.each(cases)("$name", ({ problem, stepKind, hint }) => {
    expect(problem.next_step.kind).toBe(stepKind);
    const result = classifyPipelineError(refusal(problem));
    expect(result.nextStep).toBe(problem.next_step.detail);
    if (hint === undefined) {
      expect(result.hint).toBeUndefined();
      return;
    }
    if (hint.summary) expect(result.hint?.summary).toMatch(hint.summary);
    if (hint.code) expect(result.hint?.code).toMatch(hint.code);
    if (hint.docs) expect(result.hint?.docs?.href).toMatch(hint.docs);
  });

  it("client.unreachable at a local URL says to start the API there", () => {
    const result = classifyPipelineError(unreachable(LOCAL_API));
    expect(result.code).toBe("client.unreachable");
    expect(result.domain).toBe("runtime");
    expect(result.title).toBe("The runtime could not be reached");
    expect(result.hint?.summary).toContain(`Start the MTHDS API at ${LOCAL_API}`);
    expect(result.hint?.code).toContain("docker run -p 8081:8081");
    expect(result.hint?.codeLanguage).toBe("bash");
    expect(result.details).toContain("network error: ECONNREFUSED");
  });

  it("client.unreachable at another host says to check MTHDS_BASE_URL", () => {
    const result = classifyPipelineError(unreachable(HOSTED_API));
    expect(result.hint?.summary).toMatch(/MTHDS_BASE_URL/);
    expect(result.hint?.code).toBe(`MTHDS_BASE_URL=${HOSTED_API}`);
  });
});

describe("classifyPipelineError — the app's own output narrowers", () => {
  it("presents a BadPipelineOutputError as the method's to fix", () => {
    const result = classifyPipelineError(new BadPipelineOutputError("missing field"));
    expect(result.domain).toBe("method");
    expect(result.code).toBeUndefined();
    expect(result.title).toContain("output");
    expect(result.details).toBe("BadPipelineOutputError: missing field");
  });

  it("presents a BadImageOutputError with no image", () => {
    const result = classifyPipelineError(new BadImageOutputError("no image url"));
    expect(result.domain).toBe("method");
    expect(result.title).toMatch(/image/i);
    expect(result.details).toContain("no image url");
  });

  it("recommends S3/GCP storage when the image URL isn't web-accessible", () => {
    const err = new BadImageOutputError(
      'The pipeline returned an image at "file:///tmp/storage/abc.png", but a browser cannot load a file: URL.',
      { nonWebUrl: "file:///tmp/storage/abc.png" },
    );
    const result = classifyPipelineError(err);
    expect(result.domain).toBe("operator");
    expect(result.title).toMatch(/web-accessible/i);
    expect(result.hint?.summary).toMatch(/S3 or GCP/);
    expect(result.hint?.code).toContain("[storage]");
    expect(result.details).toContain("file:///tmp/storage/abc.png");
  });
});

describe("classifyPipelineError — failures with no problem", () => {
  it("presents a missing bundle file", () => {
    const err = Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" });
    const result = classifyPipelineError(err);
    expect(result.domain).toBe("method");
    expect(result.title).toContain("bundle");
    expect(result.message).toContain("ENOENT");
  });

  it("falls back for a plain Error", () => {
    const result = classifyPipelineError(new Error("???"));
    expect(result.title).toBe("Something went wrong");
    expect(result.domain).toBe("runtime");
    expect(result.code).toBeUndefined();
    expect(result.details).toContain("???");
  });

  it("falls back for a non-Error throw", () => {
    const result = classifyPipelineError("a string was thrown");
    expect(result.title).toBe("Something went wrong");
    expect(result.details).toContain("a string was thrown");
  });
});

describe("classifyTransportError", () => {
  it("presents a fetch-style TypeError rejection", () => {
    const err = new TypeError("Failed to fetch");
    const result = classifyTransportError(err);
    expect(result.domain).toBe("runtime");
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
    expect(result.domain).toBe("runtime");
    expect(result.details).toContain("disconnected");
    expect(result.details).toContain("Unknown");
  });
});
