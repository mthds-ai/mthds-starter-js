import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiTransportError, buildProblem } from "mthds/errors";

const execute = vi.fn();

vi.mock("@/lib/loadBundle", () => ({
  loadGenerateImageBundle: vi.fn().mockResolvedValue({ "main.mthds": "DUMMY_BUNDLE_TOML" }),
}));

vi.mock("@/lib/mthdsClient", () => ({
  getMthdsClient: () => ({ execute }),
}));

import { runGenerateImagePipeline } from "./runGenerateImagePipeline";

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

describe("runGenerateImagePipeline", () => {
  it("calls the SDK with the method's files, pipe code, and trimmed prompt on success", async () => {
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

    expect(execute).toHaveBeenCalledWith({
      pipe_code: "generate_image.generate_image",
      files: { "main.mthds": "DUMMY_BUNDLE_TOML" },
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
      error: expect.objectContaining({ domain: "input", title: "Prompt required" }),
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("presents an SDK error from its problem", async () => {
    execute.mockRejectedValue(unreachable());
    const result = await runGenerateImagePipeline("a red bicycle");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("client.unreachable");
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
    expect(result.error.title).toBe("Image generation returned no usable image");
    expect(result.error.code).toBeUndefined();
  });
});
