import { mkdirSync, mkdtempSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { linkWorkspaceSkills } from "./workspaceSkills.js";

const roots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "hf-skills-"));
  roots.push(dir);
  return dir;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("linkWorkspaceSkills", () => {
  it("links the global store into a project's .agents/skills", () => {
    const home = tempDir();
    const project = tempDir();
    mkdirSync(join(home, "hyperframes"), { recursive: true });
    writeFileSync(join(home, "hyperframes", "SKILL.md"), "# guide\n");
    writeFileSync(join(project, "hyperframes.json"), "{}\n");

    const result = linkWorkspaceSkills({
      cwd: project,
      source: home,
      skills: ["hyperframes"],
      platform: "linux",
    });

    expect(result.linked).toEqual(["hyperframes"]);
    expect(readlinkSync(join(project, ".agents", "skills", "hyperframes"))).toContain(
      "hyperframes",
    );
  });

  it("does not touch a HyperFrames checkout or a folder that is not a project", () => {
    const home = tempDir();
    const checkout = tempDir();
    mkdirSync(join(checkout, "skills", "hyperframes"), { recursive: true });
    writeFileSync(join(checkout, "skills", "hyperframes", "SKILL.md"), "# source\n");
    writeFileSync(join(checkout, "hyperframes.json"), "{}\n");
    const plain = tempDir();

    expect(
      linkWorkspaceSkills({ cwd: checkout, source: home, skills: ["hyperframes"] }).linked,
    ).toEqual([]);
    expect(
      linkWorkspaceSkills({ cwd: plain, source: home, skills: ["hyperframes"] }).dir,
    ).toBeNull();
  });
});
