import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiTransportError, problemError } from "mthds/errors";
import { MethodLoadError } from "@/types/pipelineError";

const { execute, loadMethodTree } = vi.hoisted(() => ({
  execute: vi.fn(),
  loadMethodTree: vi.fn(),
}));

vi.mock("@/lib/methodTree", () => ({ loadMethodTree }));

vi.mock("@/lib/mthdsClient", () => ({
  getMthdsClient: () => ({ execute }),
}));

import { runHelloPipeline } from "./runHelloPipeline";

// A stand-in for the listed tree: the action hands it to the SDK untouched.
const METHOD_TREE = { files: [], digest: "sha256:tree", readFile: vi.fn() };

beforeEach(() => {
  execute.mockReset();
  loadMethodTree.mockReset();
  loadMethodTree.mockResolvedValue(METHOD_TREE);
});

function unreachable(): ApiTransportError {
  const { problem } = problemError("client.unreachable", { base_url: "http://localhost:8081" });
  return new ApiTransportError(problem, {
    apiUrl: "http://localhost:8081",
    networkCode: "ECONNREFUSED",
  });
}

describe("runHelloPipeline", () => {
  it("calls the SDK with the method's tree, pipe code, and trimmed input on success", async () => {
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

    expect(loadMethodTree).toHaveBeenCalledWith("hello");
    expect(execute).toHaveBeenCalledWith({
      pipe_code: "hello.extract_entities",
      tree: METHOD_TREE,
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
        kind: "bad_request",
        title: "Input required",
      }),
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("classifies SDK errors into a structured PipelineError", async () => {
    execute.mockRejectedValue(unreachable());

    const result = await runHelloPipeline("some text");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("api_unreachable");
    expect(result.error.title).toBe("MTHDS API not reachable");
  });

  it("classifies unknown errors with the unknown fallback", async () => {
    execute.mockRejectedValue(new Error("API down"));
    const result = await runHelloPipeline("some text");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("unknown");
    expect(result.error.details).toContain("API down");
  });

  it("reports a method directory it cannot list without calling the SDK", async () => {
    loadMethodTree.mockRejectedValue(
      new MethodLoadError("hello", "not_found", "Cannot read 'methods/hello'"),
    );

    const result = await runHelloPipeline("some text");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("method_load_failed");
    expect(execute).not.toHaveBeenCalled();
  });
});
