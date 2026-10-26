// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { previewDoc } from "../webmcpTestUtils";
import { studioGuide } from "./guideTools";
import { studioReview } from "./reviewTools";

function place(element: HTMLElement, x: number, y: number, width: number, height: number): void {
  element.getBoundingClientRect = () =>
    ({
      x,
      y,
      left: x,
      top: y,
      right: x + width,
      bottom: y + height,
      width,
      height,
      toJSON: () => ({}),
    }) as DOMRect;
}

describe("studio_review", () => {
  it("reports text against the frame edge and does not edit", () => {
    const doc = previewDoc(
      '<div id="root" data-composition-id="film"><h1 id="title">Too close</h1></div>',
    );
    const root = doc.getElementById("root");
    const title = doc.getElementById("title");
    if (!root || !title) throw new Error("expected nodes");
    place(root, 0, 0, 1920, 1080);
    place(title, 8, 400, 500, 80);

    const result = studioReview({ getPreviewDocument: () => doc });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.advisories.map((item) => item.code)).toEqual(["text_near_edge"]);
    expect(title.textContent).toBe("Too close");
  });
});

describe("studio_guide", () => {
  it("includes the harness fallback and the desktop app", () => {
    const result = studioGuide();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.guide).toContain("Antigravity");
    expect(result.guide).toContain("desktop app");
    expect(result.skills.map((skill) => skill.id)).toContain("title-safe");
  });
});
