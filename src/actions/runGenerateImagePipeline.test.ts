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

import { runGenerateImagePipeline } from "./runGenerateImagePipeline";

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

describe("runGenerateImagePipeline", () => {
  it("calls the SDK with the method's tree, pipe code, and trimmed prompt on success", async () => {
    execute.mockResolvedValue({
      pipeline_run_id: "run-1",
      pipe_output: {
        pipeline_run_id: "run-1",
        working_memory: {
          root: {
            image: {
              concept: "native.Image",
              content: { url: "https://cdn.pipelex.com/x.png", mime_type: "image/png" },
            },
          },
          aliases: {},
        },
      },
    });

    const result = await runGenerateImagePipeline("  a red bicycle  ");

    expect(loadMethodTree).toHaveBeenCalledWith("generate-image");
    expect(execute).toHaveBeenCalledWith({
      pipe_code: "generate_image.generate_image",
      tree: METHOD_TREE,
      inputs: { image_prompt: "a red bicycle" },
    });
    expect(result).toEqual({
      ok: true,
      image: {
        url: "https://cdn.pipelex.com/x.png",
        publicUrl: null,
        mimeType: "image/png",
        caption: null,
      },
    });
  });

  it("returns a bad_request error on empty input without calling the SDK", async () => {
    const result = await runGenerateImagePipeline("   ");
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ kind: "bad_request", title: "Prompt required" }),
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("classifies SDK errors into a structured PipelineError", async () => {
    execute.mockRejectedValue(unreachable());
    const result = await runGenerateImagePipeline("a red bicycle");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("api_unreachable");
  });

  it("classifies a missing image URL as bad_image_output", async () => {
    execute.mockResolvedValue({
      pipeline_run_id: "run-1",
      pipe_output: {
        pipeline_run_id: "run-1",
        working_memory: { root: { image: { content: { caption: "no url" } } }, aliases: {} },
      },
    });
    const result = await runGenerateImagePipeline("a red bicycle");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("bad_image_output");
  });

  it("reports a method directory it cannot list without calling the SDK", async () => {
    loadMethodTree.mockRejectedValue(
      new MethodLoadError("generate-image", "not_found", "Cannot read 'methods/generate-image'"),
    );

    const result = await runGenerateImagePipeline("a red bicycle");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("method_load_failed");
    expect(execute).not.toHaveBeenCalled();
  });
});
