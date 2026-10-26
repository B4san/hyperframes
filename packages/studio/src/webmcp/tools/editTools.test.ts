// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import type { TimelineElement } from "../../player/store/timelineElement";
import { mintElementHandle, timelineElementAddress } from "../handles";
import { previewDoc, selectionFor } from "../webmcpTestUtils";
import { studioEdit, type AttributeWrite, type EditToolDeps } from "./editTools";
import { lookSnapshot } from "../webmcpTestUtils";

function row(
  partial: Pick<TimelineElement, "id" | "start" | "duration"> & Partial<TimelineElement>,
): TimelineElement {
  return {
    tag: "div",
    track: 0,
    domId: partial.domId ?? partial.id,
    sourceFile: "index.html",
    playbackRate: 1,
    playbackStart: 0,
    volume: 1,
    ...partial,
  };
}

function handleFor(element: TimelineElement): string {
  const handle = mintElementHandle(timelineElementAddress(element, "index.html", "demo"));
  if (!handle) throw new Error("expected handle");
  return handle;
}

function depsFor(
  elements: TimelineElement[],
  html: string,
  commit = vi.fn(async () => true),
): EditToolDeps & { commit: typeof commit } {
  const doc = previewDoc(html);
  return {
    commit,
    getSnapshot: () => lookSnapshot({ projectId: "demo", elements }),
    getPreviewDocument: () => doc,
    getProjectId: () => "demo",
    getWriteBlockedReason: () => null,
    buildSelection: async (element) => selectionFor(element),
    applySelection: () => undefined,
    commitAttributes: (selection, operations, label) => commit(selection, operations, label),
  };
}

describe("studio_edit", () => {
  it("ripples later clips and writes authored timing", async () => {
    const a = row({ id: "a", start: 10, duration: 2, parentCompositionStart: 10 });
    const b = row({ id: "b", start: 12, duration: 2, parentCompositionStart: 10 });
    const commit = vi.fn(async () => true);
    const deps = depsFor(
      [a, b],
      '<div id="a" data-start="0" data-duration="2"></div><div id="b" data-start="2" data-duration="2"></div>',
      commit,
    );

    const result = await studioEdit(deps, {
      handle: handleFor(a),
      action: "ripple",
      edge: "out",
      delta: 0.5,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stage).toBe("dispatched");
    expect(result.clips).toEqual(["a", "b"]);
    const writes = commit.mock.calls.map((call) => call[1] as readonly AttributeWrite[]);
    expect(writes[0]).toEqual([{ property: "duration", value: "2.5" }]);
    expect(writes[1]).toEqual([{ property: "start", value: "2.5" }]);
  });

  it("grades a clip through the color contract", async () => {
    const shot = row({ id: "shot", start: 0, duration: 4 });
    const commit = vi.fn(async () => true);
    const deps = depsFor([shot], '<div id="shot"></div>', commit);
    const result = await studioEdit(deps, {
      handle: handleFor(shot),
      action: "grade",
      preset: "night-lift",
    });
    expect(result.ok).toBe(true);
    const write = commit.mock.calls[0]?.[1] as readonly AttributeWrite[];
    expect(write[0]?.property).toBe("color-grading");
    expect(write[0]?.value).toContain("night-lift");
  });

  it("refuses a roll that has no shared cut and does not write", async () => {
    const a = row({ id: "a", start: 0, duration: 2 });
    const b = row({ id: "b", start: 3, duration: 2 });
    const commit = vi.fn(async () => true);
    const deps = depsFor([a, b], '<div id="a"></div><div id="b"></div>', commit);
    const result = await studioEdit(deps, {
      handle: handleFor(a),
      action: "roll",
      edge: "out",
      delta: 0.2,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("invalid");
    expect(commit).not.toHaveBeenCalled();
  });
});
