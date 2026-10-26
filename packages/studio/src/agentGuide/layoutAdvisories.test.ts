import { describe, expect, it } from "vitest";
import { reviewLayout, type AdvisoryBox } from "./layoutAdvisories";

const frame = { width: 1920, height: 1080 };

function text(overrides: Partial<AdvisoryBox> & Pick<AdvisoryBox, "id">): AdvisoryBox {
  return {
    label: overrides.id,
    text: "Hello",
    x: 400,
    y: 300,
    width: 400,
    height: 80,
    ...overrides,
  };
}

describe("reviewLayout", () => {
  it("warns when text sits in the outer 10 percent", () => {
    const advisories = reviewLayout(frame, [text({ id: "title", x: 20, y: 300 })]);
    expect(advisories.map((item) => item.code)).toEqual(["text_near_edge"]);
    expect(advisories[0]?.decision).toContain("Say which you chose");
  });

  it("warns when two text blocks cross", () => {
    const advisories = reviewLayout(frame, [
      text({ id: "a", x: 400, y: 300, text: "One line" }),
      text({ id: "b", x: 420, y: 320, text: "Other line" }),
    ]);
    expect(advisories.map((item) => item.code)).toContain("text_overlap");
  });

  it("treats a mostly-offstage box as an exit, and skips an allowed bleed", () => {
    const offstage = reviewLayout(frame, [
      text({ id: "exit", x: 1800, y: 400, width: 800, height: 100 }),
    ]);
    expect(offstage.map((item) => item.code)).toEqual(["element_out_of_frame"]);

    const allowed = reviewLayout(frame, [
      text({ id: "bleed", x: 20, y: 300, allowOverflow: true }),
    ]);
    expect(allowed).toEqual([]);
  });

  it("does not flag an intentional cross", () => {
    const advisories = reviewLayout(frame, [
      text({ id: "a", x: 400, y: 300, allowOverlap: true }),
      text({ id: "b", x: 420, y: 320 }),
    ]);
    expect(advisories.some((item) => item.code === "text_overlap")).toBe(false);
  });

  it("stays quiet when text is inside the title-safe box", () => {
    expect(reviewLayout(frame, [text({ id: "safe" })])).toEqual([]);
  });
});
