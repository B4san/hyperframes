/**
 * Put the installed HyperFrames skills where a project harness looks.
 *
 * Antigravity reads `.agents/skills` in the open project. A global install
 * does not fill that folder, so a project with `hyperframes.json` gets links
 * back to the global store. A checkout of HyperFrames itself is left alone:
 * its `skills/` directory is the source, not a consumer.
 */

import { existsSync, lstatSync, mkdirSync, symlinkSync, unlinkSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { copyDirSync } from "./copyDir.js";

export interface WorkspaceSkillLink {
  dir: string | null;
  linked: string[];
}

export function linkWorkspaceSkills(opts: {
  cwd: string;
  source: string;
  skills: readonly string[];
  platform?: NodeJS.Platform;
}): WorkspaceSkillLink {
  const empty: WorkspaceSkillLink = { dir: null, linked: [] };
  if (!existsSync(join(opts.cwd, "hyperframes.json"))) return empty;
  if (existsSync(join(opts.cwd, "skills", "hyperframes", "SKILL.md"))) return empty;

  const dir = join(opts.cwd, ".agents", "skills");
  mkdirSync(dir, { recursive: true });
  const platform = opts.platform ?? process.platform;
  const linked: string[] = [];
  for (const name of opts.skills) {
    const sourceSkill = join(opts.source, name);
    if (!existsSync(join(sourceSkill, "SKILL.md"))) continue;
    const target = join(dir, name);
    if (!replaceLink(target)) continue;
    if (platform === "win32") copyDirSync(sourceSkill, target);
    else symlinkSync(relative(dirname(target), sourceSkill), target);
    linked.push(name);
  }
  return { dir, linked };
}

/** True when the target can be replaced. A real directory the person owns stays. */
function replaceLink(target: string): boolean {
  if (!existsSync(target)) return true;
  try {
    if (!lstatSync(target).isSymbolicLink()) return false;
    unlinkSync(target);
    return true;
  } catch {
    return false;
  }
}
