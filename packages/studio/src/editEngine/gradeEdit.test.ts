import { describe, expect, it } from "vitest";
import { planGradeEdit } from "./gradeEdit";

const identity = { clipId: "shot", domId: "shot", mediaStartAttr: "media-start" as const };

describe("planGradeEdit", () => {
  it("writes a preset into data-color-grading", () => {
    const plan = planGradeEdit({ ...identity, current: null, preset: "warm-daylight" });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.patch.colorGrading).toContain("warm-daylight");
  });

  it("merges a primary correction onto the grade already on the clip", () => {
    const plan = planGradeEdit({
      ...identity,
      current: JSON.stringify({ preset: "neutral", adjust: { contrast: 0.2 } }),
      adjust: { exposure: 0.15 },
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok || plan.patch.colorGrading == null) return;
    const parsed = JSON.parse(plan.patch.colorGrading) as {
      preset?: string;
      adjust?: { contrast?: number; exposure?: number };
    };
    expect(parsed.preset).toBe("neutral");
    expect(parsed.adjust).toMatchObject({ contrast: 0.2, exposure: 0.15 });
  });

  it("clears the grade and refuses an unknown preset", () => {
    const cleared = planGradeEdit({ ...identity, current: "{}", clear: true });
    expect(cleared.ok).toBe(true);
    if (cleared.ok) expect(cleared.patch.colorGrading).toBeNull();
    expect(planGradeEdit({ ...identity, current: null, preset: "teal-orange" })).toMatchObject({
      ok: false,
    });
  });
});
