"use server";

import { getMthdsClient } from "@/lib/mthdsClient";
import { loadGenerateImageBundle } from "@/lib/loadBundle";
import { parseGeneratedImage, type GeneratedImage } from "@/types/generateImagePipeline";
import { classifyPipelineError, type PipelineError } from "@/lib/errors";

export type RunGenerateImagePipelineResult =
  | { ok: true; image: GeneratedImage }
  | { ok: false; error: PipelineError };

/**
 * Server Action: generate an image from a text prompt and return either the
 * generated image or a classified error. Same discriminated-union shape as
 * the other examples — structured failures survive the server→client
 * boundary, where thrown server-action errors would be stripped to digests.
 */
export async function runGenerateImagePipeline(
  prompt: string,
): Promise<RunGenerateImagePipelineResult> {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: {
        domain: "input",
        title: "Prompt required",
        message: "Describe the image you want to generate.",
        details: "Empty input",
      },
    };
  }

  try {
    const files = await loadGenerateImageBundle();
    const client = getMthdsClient();
    const response = await client.execute({
      // `<domain>.<pipe_code>` names exactly one pipe; a bare code is searched across every domain.
      pipe_code: "generate_image.generate_image",
      files,
      inputs: { image_prompt: trimmed },
    });
    const image = parseGeneratedImage(response.pipe_output);
    return { ok: true, image };
  } catch (err) {
    return {
      ok: false,
      error: classifyPipelineError(err),
    };
  }
}
