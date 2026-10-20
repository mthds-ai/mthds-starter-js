import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MethodLoadError } from "@/types/pipelineError";
import { loadMethodTree } from "./methodTree";

async function bundleText(name: string): Promise<string> {
  const tree = await loadMethodTree(name);
  return new TextDecoder().decode(await tree.readFile("main.mthds"));
}

describe("loadMethodTree — the example methods", () => {
  it.each([
    ["hello", 'domain      = "hello"', "[pipe.extract_entities]"],
    ["summarize-pdf", 'domain      = "summarize_pdf"', "[pipe.summarize_pdf]"],
    ["generate-image", 'domain      = "generate_image"', "[pipe.generate_image]"],
  ])("lists methods/%s as a tree rooted at its directory", async (name, domain, pipe) => {
    const tree = await loadMethodTree(name);

    expect(tree.root).toBe(path.join(process.cwd(), "methods", name));
    expect(tree.files.map((file) => file.path)).toContain("main.mthds");
    expect(tree.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    const bundle = await bundleText(name);
    expect(bundle).toContain(domain);
    expect(bundle).toContain(pipe);
  });
});

describe("loadMethodTree — a method directory of its own", () => {
  let methodsDir: string;

  beforeEach(async () => {
    methodsDir = await mkdtemp(path.join(tmpdir(), "starter-methods-"));
  });

  afterEach(async () => {
    await rm(methodsDir, { recursive: true, force: true });
  });

  it("sends every file of the directory, and leaves out what the standard keeps behind", async () => {
    const dir = path.join(methodsDir, "letter");
    await mkdir(path.join(dir, "templates"), { recursive: true });
    await writeFile(path.join(dir, "main.mthds"), 'domain = "letter"\n');
    await writeFile(path.join(dir, "templates", "letter.html"), "<p>{{ body }}</p>\n");
    await writeFile(path.join(dir, "inputs.json"), "{}\n");
    await writeFile(path.join(dir, ".notes"), "private\n");

    const tree = await loadMethodTree("letter", methodsDir);

    expect(tree.files.map((file) => file.path)).toEqual(["main.mthds", "templates/letter.html"]);
  });

  it("rejects a missing directory with a MethodLoadError coded not_found", async () => {
    const failure = loadMethodTree("missing", methodsDir);

    await expect(failure).rejects.toBeInstanceOf(MethodLoadError);
    await expect(failure).rejects.toMatchObject({ method: "missing", code: "not_found" });
  });

  it("rejects a directory holding a symbolic link, which a tree cannot hold", async () => {
    const dir = path.join(methodsDir, "linked");
    await mkdir(dir);
    await writeFile(path.join(dir, "main.mthds"), 'domain = "linked"\n');
    await symlink(path.join(dir, "main.mthds"), path.join(dir, "alias.mthds"));

    await expect(loadMethodTree("linked", methodsDir)).rejects.toMatchObject({
      name: "MethodLoadError",
      code: "symbolic_link",
    });
  });

  it("refuses a name that is not a method directory name before touching the disk", async () => {
    await expect(loadMethodTree("../outside", methodsDir)).rejects.toThrow(
      /not a method directory/,
    );
  });
});
