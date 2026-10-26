/**
 * `studio_review`: layout observations at the current frame.
 *
 * The tool does not edit. Each warning asks the agent to fix the frame or to
 * leave it when the video is meant to look that way.
 */

import { collectLayoutBoxes } from "../../agentGuide/collectLayoutBoxes";
import { reviewLayout, type LayoutAdvisory } from "../../agentGuide/layoutAdvisories";
import { toolFailure, toolOk, type ToolResult } from "../toolResult";

export interface ReviewToolDeps {
  getPreviewDocument: () => Document | null;
}

export interface StudioReview {
  advisories: LayoutAdvisory[];
  frame: { width: number; height: number } | null;
}

export function studioReview(deps: ReviewToolDeps): ToolResult<StudioReview> {
  const doc = deps.getPreviewDocument();
  if (!doc) {
    return toolFailure(
      "blocked",
      "the composition preview is not ready",
      "Call studio_look, then retry.",
    );
  }
  const sample = collectLayoutBoxes(doc);
  if (!sample) {
    return toolOk({ advisories: [], frame: null });
  }
  return toolOk({
    frame: sample.frame,
    advisories: reviewLayout(sample.frame, sample.boxes),
  });
}

export const STUDIO_REVIEW_INPUT_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

export const STUDIO_REVIEW_DESCRIPTION = [
  "Look for text near the frame edge, text crossing other text, and elements mostly outside the frame.",
  "Each advisory is a choice, not an order. Fix it, or leave it if the video is meant to look that way, and say which.",
  "An intentional cross gets data-layout-allow-overlap on the text or an inner container. An intentional bleed gets data-layout-allow-overflow.",
  "A marker on the composition root does not apply.",
  "Returns ok: true with advisories. An empty list means this frame has none.",
].join(" ");
