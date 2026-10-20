"use server";

import { getMthdsClient } from "@/lib/mthdsClient";
import { loadMethodTree } from "@/lib/methodTree";
import { parseEntities, type ExtractedEntities } from "@/types/helloPipeline";
import { classifyPipelineError, type PipelineError } from "@/lib/errors";

export type RunHelloPipelineResult =
  | { ok: true; entities: ExtractedEntities }
  | { ok: false; error: PipelineError };

/**
 * Server Action: run the hello pipeline against a piece of input text and
 * return either extracted entities or a classified error. The discriminated-
 * union shape lets us pass structured failure data across the server→client
 * boundary; thrown server-action errors are stripped to opaque digests in
 * Next.js production builds, which would defeat the developer-friendly UX.
 */
export async function runHelloPipeline(text: string): Promise<RunHelloPipelineResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: {
        kind: "bad_request",
        title: "Input required",
        message: "Enter some text to extract entities from.",
        details: "Empty input",
      },
    };
  }

  try {
    const tree = await loadMethodTree("hello");
    const client = getMthdsClient();
    const response = await client.execute({
      // `<domain>.<pipe_code>` names exactly one pipe; a bare code is searched across every domain.
      pipe_code: "hello.extract_entities",
      // The method's whole directory, which the SDK sends inline or by content hash.
      tree,
      inputs: { text: trimmed },
    });
    const entities = parseEntities(response.pipe_output);
    return { ok: true, entities };
  } catch (err) {
    return {
      ok: false,
      error: classifyPipelineError(err, {
        apiUrl: process.env.MTHDS_BASE_URL,
        hasApiKey: Boolean(process.env.MTHDS_API_KEY),
      }),
    };
  }
}
