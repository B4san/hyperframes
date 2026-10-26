import { describe, expect, it } from "vitest";
import { planClipEdit, type EngineClip } from "./clipEdit";

function clip(
  overrides: Partial<EngineClip> & Pick<EngineClip, "id" | "start" | "duration">,
): EngineClip {
  return {
    track: 0,
    mediaStart: 0,
    mediaStartAttr: "media-start",
    sourceDuration: null,
    playbackRate: 1,
    volume: 1,
    locked: false,
    ...overrides,
  };
}

const lane = [
  clip({ id: "a", start: 0, duration: 2 }),
  clip({ id: "b", start: 2, duration: 2, mediaStart: 1 }),
  clip({ id: "c", start: 4, duration: 2 }),
];

describe("planClipEdit", () => {
  it("trims an out point without moving the neighbors", () => {
    const plan = planClipEdit(lane, { action: "trim", clipId: "b", edge: "out", delta: 0.5 });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.patches).toEqual([expect.objectContaining({ id: "b", duration: 2.5 })]);
  });

  it("trims an in point and keeps the out point by slipping the source", () => {
    const plan = planClipEdit(lane, { action: "trim", clipId: "b", edge: "in", delta: 0.5 });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.patches[0]).toMatchObject({ id: "b", start: 2.5, duration: 1.5, mediaStart: 1.5 });
  });

  it("ripples later clips when the out point moves", () => {
    const plan = planClipEdit(lane, { action: "ripple", clipId: "a", edge: "out", delta: -0.5 });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.patches).toEqual([
      expect.objectContaining({ id: "a", duration: 1.5 }),
      expect.objectContaining({ id: "b", start: 1.5 }),
      expect.objectContaining({ id: "c", start: 3.5 }),
    ]);
  });

  it("rolls a shared cut and keeps the combined span", () => {
    const plan = planClipEdit(lane, { action: "roll", clipId: "a", edge: "out", delta: 0.4 });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const a = plan.patches.find((patch) => patch.id === "a");
    const b = plan.patches.find((patch) => patch.id === "b");
    expect(a).toMatchObject({ duration: 2.4 });
    expect(b).toMatchObject({ start: 2.4, duration: 1.6, mediaStart: 1.4 });
    expect((a?.duration ?? 0) + (b?.duration ?? 0)).toBe(4);
  });

  it("refuses a roll when the next clip does not touch", () => {
    const gapped = [
      clip({ id: "a", start: 0, duration: 2 }),
      clip({ id: "b", start: 3, duration: 2 }),
    ];
    const plan = planClipEdit(gapped, { action: "roll", clipId: "a", edge: "out", delta: 0.2 });
    expect(plan).toMatchObject({ ok: false });
  });

  it("slips only the source window", () => {
    const media = [clip({ id: "b", start: 2, duration: 2, mediaStart: 1, sourceDuration: 10 })];
    const plan = planClipEdit(media, { action: "slip", clipId: "b", delta: 0.5 });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.patches).toEqual([expect.objectContaining({ id: "b", mediaStart: 1.5 })]);
    expect(plan.patches[0]?.start).toBeUndefined();
    expect(plan.patches[0]?.duration).toBeUndefined();
  });

  it("slides a clip between its neighbors", () => {
    const plan = planClipEdit(lane, { action: "slide", clipId: "b", delta: 0.5 });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.patches).toEqual([
      expect.objectContaining({ id: "a", duration: 2.5 }),
      expect.objectContaining({ id: "b", start: 2.5 }),
      expect.objectContaining({ id: "c", start: 4.5, duration: 1.5 }),
    ]);
  });

  it("changes speed without changing duration", () => {
    const plan = planClipEdit(lane, { action: "retime", clipId: "b", rate: 2, keep: "duration" });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.patches).toEqual([expect.objectContaining({ id: "b", playbackRate: 2 })]);
  });

  it("ripples downstream when a speed change keeps the same source", () => {
    const plan = planClipEdit(lane, { action: "retime", clipId: "a", rate: 2, keep: "source" });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.patches).toEqual([
      expect.objectContaining({ id: "a", playbackRate: 2, duration: 1 }),
      expect.objectContaining({ id: "b", start: 1 }),
      expect.objectContaining({ id: "c", start: 3 }),
    ]);
  });

  it("sets linear gain and refuses a locked clip", () => {
    const quiet = planClipEdit(lane, { action: "gain", clipId: "a", volume: 0.5 });
    expect(quiet.ok).toBe(true);
    if (quiet.ok) expect(quiet.patches[0]).toMatchObject({ id: "a", volume: 0.5 });

    const locked = [clip({ id: "a", start: 0, duration: 2, locked: true })];
    expect(planClipEdit(locked, { action: "gain", clipId: "a", volume: 0.5 })).toMatchObject({
      ok: false,
      reason: "clip a is locked",
    });
  });

  it("does not let a trim walk off the start of the source", () => {
    const plan = planClipEdit(lane, { action: "trim", clipId: "a", edge: "in", delta: -2 });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.patches).toEqual([]);
  });
});
