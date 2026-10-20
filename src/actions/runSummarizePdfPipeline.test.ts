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

import { runSummarizePdfPipeline } from "./runSummarizePdfPipeline";

const PDF_DATA_URL = "data:application/pdf;base64,JVBERi0xLjQK";

function summaryOutput() {
  return {
    pipeline_run_id: "run-1",
    pipe_output: {
      pipeline_run_id: "run-1",
      working_memory: {
        root: {
          summary: {
            content: { title: "Invoice", doc_type: "invoice", key_points: ["Total $1,728"] },
          },
        },
        aliases: {},
      },
    },
  };
}

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

describe("runSummarizePdfPipeline", () => {
  it("calls the SDK with the method's tree, pipe code, and a Document input envelope", async () => {
    execute.mockResolvedValue(summaryOutput());

    const result = await runSummarizePdfPipeline({
      dataUrl: PDF_DATA_URL,
      filename: "invoice.pdf",
    });

    expect(loadMethodTree).toHaveBeenCalledWith("summarize-pdf");
    expect(execute).toHaveBeenCalledWith({
      pipe_code: "summarize_pdf.summarize_pdf",
      tree: METHOD_TREE,
      inputs: {
        document: {
          concept: "Document",
          content: { url: PDF_DATA_URL, filename: "invoice.pdf", mime_type: "application/pdf" },
        },
      },
    });
    expect(result).toEqual({
      ok: true,
      summary: { title: "Invoice", docType: "invoice", keyPoints: ["Total $1,728"] },
    });
  });

  it("returns a bad_request error on empty input without calling the SDK", async () => {
    const result = await runSummarizePdfPipeline({ dataUrl: "", filename: "" });
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ kind: "bad_request" }),
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects a non-PDF data URL as unsupported_file_type without calling the SDK", async () => {
    const result = await runSummarizePdfPipeline({
      dataUrl: "data:image/png;base64,AAAA",
      filename: "photo.png",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("unsupported_file_type");
    expect(execute).not.toHaveBeenCalled();
  });

  it("classifies SDK errors into a structured PipelineError", async () => {
    execute.mockRejectedValue(unreachable());

    const result = await runSummarizePdfPipeline({
      dataUrl: PDF_DATA_URL,
      filename: "invoice.pdf",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("api_unreachable");
  });

  it("reports a method directory it cannot list without calling the SDK", async () => {
    loadMethodTree.mockRejectedValue(
      new MethodLoadError("summarize-pdf", "not_found", "Cannot read 'methods/summarize-pdf'"),
    );

    const result = await runSummarizePdfPipeline({
      dataUrl: PDF_DATA_URL,
      filename: "invoice.pdf",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("method_load_failed");
    expect(execute).not.toHaveBeenCalled();
  });
});
