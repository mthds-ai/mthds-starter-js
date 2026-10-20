import path from "node:path";
import { listMethodTree, MethodTreeError, type MethodTree } from "mthds";
import { MethodLoadError } from "@/types/pipelineError";

const METHODS_DIR = path.join(process.cwd(), "methods");

/** A method directory name: kebab-case, a letter first, as the example directories are named. */
const METHOD_NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * List one method's tree, the directory `methods/<name>/`, for a run's `tree`.
 *
 * A method is its whole directory, not only its `.mthds` text: a template, an
 * image or a Python module a step reads travels with it. The `mthds` SDK lists
 * the directory by the MTHDS standard's membership rule (hidden files,
 * `node_modules`, a run's `inputs.json` and whatever a `.gitignore` ignores stay
 * behind), hashes each file, and `MthdsApiClient` sends the tree inline or by
 * content hash, uploading only the files the API lacks.
 *
 * The tree is rooted at the method's own directory (`discover: false`), as
 * `mthds install` roots each method of a repository's `methods/` folder, so a
 * `METHODS.toml` placed higher up never widens what a run sends. It is listed
 * at request time, so an edited method runs on the next request without a
 * restart.
 *
 * A directory that cannot be listed as a tree rejects with a `MethodLoadError`,
 * which `classifyPipelineError` reports as `method_load_failed`.
 */
export async function loadMethodTree(
  name: string,
  methodsDir: string = METHODS_DIR,
): Promise<MethodTree> {
  // The name comes from a constant in an action, never from a request, but it
  // is joined into a filesystem path, so it is held to the one shape it can have.
  if (!METHOD_NAME.test(name)) {
    throw new Error(`"${name}" is not a method directory name (kebab-case).`);
  }
  try {
    return await listMethodTree(path.join(methodsDir, name), { discover: false });
  } catch (err) {
    if (err instanceof MethodTreeError) {
      throw new MethodLoadError(name, err.code, err.message, { cause: err });
    }
    throw err;
  }
}
