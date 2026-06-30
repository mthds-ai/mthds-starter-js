"use server";

import { getMthdsClient } from "@/lib/mthdsClient";
import { loadHelloBundle } from "@/lib/loadBundle";
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
    const bundle = await loadHelloBundle();
    const client = getMthdsClient();
    const response = await client.execute({
      pipe_code: "extract_entities",
      mthds_contents: [bundle],
      inputs: { text: trimmed },
    });
    const entities = parseEntities(response.pipe_output);
    return { ok: true, entities };
  } catch (err) {
    return {
      ok: false,
      error: classifyPipelineError(err, {
        apiUrl: process.env.MTHDS_API_URL,
        hasApiKey: Boolean(process.env.MTHDS_API_KEY),
      }),
    };
  }
}
