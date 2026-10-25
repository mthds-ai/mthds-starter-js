import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiTransportError, buildProblem } from "mthds/errors";

const execute = vi.fn();

vi.mock("@/lib/loadBundle", () => ({
  loadHelloBundle: vi.fn().mockResolvedValue({ "main.mthds": "DUMMY_BUNDLE_TOML" }),
}));

vi.mock("@/lib/mthdsClient", () => ({
  getMthdsClient: () => ({ execute }),
}));

import { runHelloPipeline } from "./runHelloPipeline";

/** The error the SDK raises when nothing answers at the API's base URL. */
function unreachable(): ApiTransportError {
  const apiUrl = "http://localhost:8081";
  return new ApiTransportError(buildProblem("client.unreachable", { base_url: apiUrl }), {
    apiUrl,
    networkCode: "ECONNREFUSED",
  });
}

beforeEach(() => {
  execute.mockReset();
});

describe("runHelloPipeline", () => {
  it("calls the SDK with the method's files, pipe code, and trimmed input on success", async () => {
    execute.mockResolvedValue({
      pipeline_run_id: "run-1",
      pipe_output: {
        pipeline_run_id: "run-1",
        working_memory: {
          root: {
            entities: { content: { people: ["Ada"], orgs: ["ACME"], dates: ["1843"] } },
          },
          aliases: {},
        },
      },
    });

    const result = await runHelloPipeline("  hello world  ");

    expect(execute).toHaveBeenCalledWith({
      pipe_code: "hello.extract_entities",
      files: { "main.mthds": "DUMMY_BUNDLE_TOML" },
      inputs: { text: "hello world" },
    });
    expect(result).toEqual({
      ok: true,
      entities: { people: ["Ada"], orgs: ["ACME"], dates: ["1843"] },
    });
  });

  it("returns a bad_request error on empty input without calling the SDK", async () => {
    const result = await runHelloPipeline("   ");
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        domain: "input",
        title: "Input required",
      }),
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("presents an SDK error from its problem", async () => {
    execute.mockRejectedValue(unreachable());

    const result = await runHelloPipeline("some text");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("client.unreachable");
    expect(result.error.title).toBe("The runtime could not be reached");
  });

  it("classifies unknown errors with the unknown fallback", async () => {
    execute.mockRejectedValue(new Error("API down"));
    const result = await runHelloPipeline("some text");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.title).toBe("Something went wrong");
    expect(result.error.code).toBeUndefined();
    expect(result.error.details).toContain("API down");
  });
});
