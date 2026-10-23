import { readFile } from "node:fs/promises";
import path from "node:path";
import type { MethodFiles } from "mthds/protocol";

const HELLO_BUNDLE_PATH = path.join(process.cwd(), "methods", "hello", "main.mthds");
const SUMMARIZE_PDF_BUNDLE_PATH = path.join(
  process.cwd(),
  "methods",
  "summarize-pdf",
  "main.mthds",
);
const GENERATE_IMAGE_BUNDLE_PATH = path.join(
  process.cwd(),
  "methods",
  "generate-image",
  "main.mthds",
);

/**
 * The tree path each example's bundle travels under. Each example method is a
 * single `.mthds` file, so its method tree holds that one file, at the root.
 */
export const BUNDLE_TREE_PATH = "main.mthds";

/**
 * Read a method's bundle from disk and return the method's tree as `execute`
 * takes it: the `files` map from tree path to file entry, here the bundle's
 * TOML text under `main.mthds`.
 */
async function loadMethodFiles(bundlePath: string): Promise<MethodFiles> {
  return { [BUNDLE_TREE_PATH]: await readFile(bundlePath, "utf-8") };
}

export async function loadHelloBundle(): Promise<MethodFiles> {
  return loadMethodFiles(HELLO_BUNDLE_PATH);
}

export async function loadSummarizePdfBundle(): Promise<MethodFiles> {
  return loadMethodFiles(SUMMARIZE_PDF_BUNDLE_PATH);
}

export async function loadGenerateImageBundle(): Promise<MethodFiles> {
  return loadMethodFiles(GENERATE_IMAGE_BUNDLE_PATH);
}

export const HELLO_BUNDLE_PATH_FOR_TESTS = HELLO_BUNDLE_PATH;
export const SUMMARIZE_PDF_BUNDLE_PATH_FOR_TESTS = SUMMARIZE_PDF_BUNDLE_PATH;
export const GENERATE_IMAGE_BUNDLE_PATH_FOR_TESTS = GENERATE_IMAGE_BUNDLE_PATH;
