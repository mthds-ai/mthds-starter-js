import { describe, it, expect } from "vitest";
import {
  BUNDLE_TREE_PATH,
  loadGenerateImageBundle,
  loadHelloBundle,
  loadSummarizePdfBundle,
} from "./loadBundle";

describe("loadHelloBundle", () => {
  it("reads the hello method as a one-file tree", async () => {
    const files = await loadHelloBundle();
    expect(Object.keys(files)).toEqual([BUNDLE_TREE_PATH]);
    const bundle = files[BUNDLE_TREE_PATH];
    if (typeof bundle !== "string") throw new Error("expected the bundle as a text entry");
    expect(bundle).toContain('domain      = "hello"');
    expect(bundle).toContain("[pipe.extract_entities]");
    expect(bundle).toContain("[concept.ExtractedEntities]");
  });
});

describe("loadSummarizePdfBundle", () => {
  it("reads the summarize-pdf method as a one-file tree", async () => {
    const files = await loadSummarizePdfBundle();
    expect(Object.keys(files)).toEqual([BUNDLE_TREE_PATH]);
    const bundle = files[BUNDLE_TREE_PATH];
    if (typeof bundle !== "string") throw new Error("expected the bundle as a text entry");
    expect(bundle).toContain('domain      = "summarize_pdf"');
    expect(bundle).toContain("[pipe.summarize_pdf]");
    expect(bundle).toContain("[concept.DocumentSummary]");
  });
});

describe("loadGenerateImageBundle", () => {
  it("reads the generate-image method as a one-file tree", async () => {
    const files = await loadGenerateImageBundle();
    expect(Object.keys(files)).toEqual([BUNDLE_TREE_PATH]);
    const bundle = files[BUNDLE_TREE_PATH];
    if (typeof bundle !== "string") throw new Error("expected the bundle as a text entry");
    expect(bundle).toContain('domain      = "generate_image"');
    expect(bundle).toContain("[pipe.generate_image]");
    expect(bundle).toContain('type        = "PipeImgGen"');
  });
});
