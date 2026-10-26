/**
 * `studio_guide`: the behavior guide, for a harness that did not load skills.
 *
 * Antigravity, Copilot, and any in-browser agent can call this. The same text
 * is also pasted onto the copied edit prompt, so a model that never calls a
 * tool still sees it.
 */

import { BEHAVIOR_SKILLS, renderBehaviorGuide } from "../../agentGuide/behaviorGuide";
import { toolOk, type ToolResult } from "../toolResult";

export interface StudioGuide {
  guide: string;
  skills: { id: string; title: string; when: string }[];
}

export function studioGuide(): ToolResult<StudioGuide> {
  return toolOk({
    guide: renderBehaviorGuide(),
    skills: BEHAVIOR_SKILLS.map((skill) => ({
      id: skill.id,
      title: skill.title,
      when: skill.when,
    })),
  });
}

export const STUDIO_GUIDE_INPUT_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

export const STUDIO_GUIDE_DESCRIPTION = [
  "Read the HyperFrames behavior guide.",
  "Call this when your harness did not load skills, including Google Antigravity with an empty .agents/skills folder.",
  "The guide covers the frame contract, title-safe, overlaps, type, levels, pacing, color, edits, and the desktop app.",
  "Returns ok: true with guide and a list of skills.",
].join(" ");
