import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiTransportError, buildProblem } from "mthds/errors";

const execute = vi.fn();

vi.mock("@/lib/loadBundle", () => ({
  loadSummarizePdfBundle: vi.fn().mockResolvedValue({ "main.mthds": "DUMMY_BUNDLE_TOML" }),
}));

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

describe("runSummarizePdfPipeline", () => {
  it("calls the SDK with the method's files, pipe code, and a Document input envelope", async () => {
    execute.mockResolvedValue(summaryOutput());

    const result = await runSummarizePdfPipeline({
      dataUrl: PDF_DATA_URL,
      filename: "invoice.pdf",
    });

    expect(execute).toHaveBeenCalledWith({
      pipe_code: "summarize_pdf.summarize_pdf",
      files: { "main.mthds": "DUMMY_BUNDLE_TOML" },
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
      error: expect.objectContaining({ domain: "input" }),
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects a non-PDF data URL as an unsupported file type without calling the SDK", async () => {
    const result = await runSummarizePdfPipeline({
      dataUrl: "data:image/png;base64,AAAA",
      filename: "photo.png",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.domain).toBe("input");
    expect(result.error.title).toBe("Unsupported file type");
    expect(execute).not.toHaveBeenCalled();
  });

  it("presents an SDK error from its problem", async () => {
    execute.mockRejectedValue(unreachable());

    const result = await runSummarizePdfPipeline({
      dataUrl: PDF_DATA_URL,
      filename: "invoice.pdf",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("client.unreachable");
  });
});
