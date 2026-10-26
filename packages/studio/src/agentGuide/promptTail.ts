import { renderBehaviorGuide } from "./behaviorGuide";
import { formatLayoutAdvisories, type LayoutAdvisory } from "./layoutAdvisories";

/** Appended to every copied agent prompt, skills harness or not. */
export function agentPromptTail(advisories: readonly LayoutAdvisory[] = []): string {
  return ["## Behavior guide", renderBehaviorGuide(), "", formatLayoutAdvisories(advisories)].join(
    "\n",
  );
}
