/**
 * `studio_edit`: timeline and grade writes an agent can make without a pointer.
 *
 * The planner in `editEngine` decides the new clip attributes. This file turns
 * that plan into the same attribute commits the inspector uses, one clip at a
 * time, re-finding each clip in the preview because a save can reload it.
 */

import { isHtmlElement } from "@hyperframes/core/runtime/dom-realm";
import type { DomEditSelection } from "../../components/editor/domEditingTypes";
import {
  planClipEdit,
  type ClipEditPatch,
  type ClipEditRequest,
  type EngineClip,
} from "../../editEngine/clipEdit";
import { planGradeEdit, type GradeEditRequest } from "../../editEngine/gradeEdit";
import {
  formatTimelineAttributeNumber,
  formatTimelineMediaOffset,
} from "../../player/components/timelineEditing";
import type { TimelineElement } from "../../player/store/timelineElement";
import { toAuthoredStart } from "../../player/store/timelineElement";
import { mintElementHandle, timelineElementAddress } from "../handles";
import { toolFailure, type ToolFailure } from "../toolResult";
import {
  dispatched,
  runTargetedWrite,
  type StudioWriteResult,
  type TargetedWriteDeps,
  WRITE_RECEIPT_DESCRIPTION,
} from "../writeCoordinator";
import type { StudioLookSnapshot } from "./lookTools";

export interface AttributeWrite {
  property: string;
  value: string | null;
}

export interface EditToolDeps extends TargetedWriteDeps {
  getSnapshot: () => StudioLookSnapshot;
  commitAttributes: (
    selection: DomEditSelection,
    operations: readonly AttributeWrite[],
    label: string,
  ) => Promise<boolean>;
}

export interface StudioEditResult {
  action: string;
  summary: string;
  clips: string[];
}

const ACTIONS = ["trim", "ripple", "roll", "slip", "slide", "retime", "gain", "grade"] as const;
type EditAction = (typeof ACTIONS)[number];

function readField(input: object, key: string): unknown {
  return Reflect.get(input, key);
}

function readString(input: object, key: string): string | undefined {
  const value = readField(input, key);
  return typeof value === "string" ? value : undefined;
}

function readNumber(input: object, key: string): number | undefined {
  const value = readField(input, key);
  return typeof value === "number" ? value : undefined;
}

function readBoolean(input: object, key: string): boolean | undefined {
  const value = readField(input, key);
  return typeof value === "boolean" ? value : undefined;
}

function isAction(value: string | undefined): value is EditAction {
  return value !== undefined && (ACTIONS as readonly string[]).includes(value);
}

function findTimelineElement(snapshot: StudioLookSnapshot, handle: string): TimelineElement | null {
  const path = snapshot.compositionPath ?? "index.html";
  return (
    snapshot.elements.find(
      (element) =>
        mintElementHandle(timelineElementAddress(element, path, snapshot.projectId)) === handle,
    ) ?? null
  );
}

function toEngineClip(element: TimelineElement): EngineClip {
  return {
    id: element.id,
    domId: element.domId,
    hfId: element.hfId,
    track: element.authoredTrack ?? element.track,
    start: element.start,
    duration: element.duration,
    mediaStart: element.playbackStart ?? 0,
    mediaStartAttr:
      element.playbackStartAttr ??
      (element.kind === "composition" ? "playback-start" : "media-start"),
    sourceDuration: element.sourceDuration ?? null,
    playbackRate: element.playbackRate && element.playbackRate > 0 ? element.playbackRate : 1,
    volume: element.volume ?? 1,
    locked: element.timelineLocked === true,
  };
}

function sameSource(
  element: TimelineElement,
  target: TimelineElement,
  activePath: string,
): boolean {
  return (element.sourceFile ?? activePath) === (target.sourceFile ?? activePath);
}

function readAdjust(input: object): Record<string, number> | undefined | "invalid" {
  const value = readField(input, "adjust");
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "invalid";
  const adjust: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "number") return "invalid";
    adjust[key] = entry;
  }
  return adjust;
}

interface GradeInput {
  clipId: string;
  preset?: string;
  intensity?: number;
  adjust?: Record<string, number>;
  clear?: boolean;
}

function gradeRequest(input: object, clipId: string): GradeInput | ToolFailure {
  const adjust = readAdjust(input);
  if (adjust === "invalid") return toolFailure("invalid", "adjust must be an object of numbers");
  return {
    clipId,
    preset: readString(input, "preset"),
    intensity: readNumber(input, "intensity"),
    adjust,
    clear: readBoolean(input, "clear"),
  };
}

function retimeRequest(input: object, clipId: string): ClipEditRequest | ToolFailure {
  const rate = readNumber(input, "rate");
  const keep = readString(input, "keep");
  if (rate === undefined) return toolFailure("invalid", "retime needs rate");
  if (keep !== "duration" && keep !== "source") {
    return toolFailure("invalid", 'retime keep must be "duration" or "source"');
  }
  return { action: "retime", clipId, rate, keep };
}

function gainRequest(input: object, clipId: string): ClipEditRequest | ToolFailure {
  const volume = readNumber(input, "volume");
  if (volume === undefined) return toolFailure("invalid", "gain needs volume");
  return { action: "gain", clipId, volume };
}

function timingRequest(
  input: object,
  clipId: string,
  action: "trim" | "ripple" | "roll" | "slip" | "slide",
): ClipEditRequest | ToolFailure {
  const delta = readNumber(input, "delta");
  if (delta === undefined) return toolFailure("invalid", `${action} needs delta, in seconds`);
  if (action === "slip" || action === "slide") return { action, clipId, delta };
  const edge = readString(input, "edge");
  if (edge !== "in" && edge !== "out") {
    return toolFailure("invalid", `${action} needs edge "in" or "out"`);
  }
  return { action, clipId, edge, delta };
}

function requestFromInput(
  input: object,
  clipId: string,
): ClipEditRequest | GradeInput | ToolFailure {
  const action = readString(input, "action");
  if (!isAction(action)) {
    return toolFailure(
      "invalid",
      "action must be trim, ripple, roll, slip, slide, retime, gain, or grade",
    );
  }
  if (action === "grade") return gradeRequest(input, clipId);
  if (action === "retime") return retimeRequest(input, clipId);
  if (action === "gain") return gainRequest(input, clipId);
  return timingRequest(input, clipId, action);
}

function isGradeInput(request: ClipEditRequest | GradeInput): request is GradeInput {
  return !("action" in request);
}

function attributeOps(element: TimelineElement, patch: ClipEditPatch): AttributeWrite[] {
  const ops: AttributeWrite[] = [];
  if (patch.start !== undefined) {
    ops.push({
      property: "start",
      value: formatTimelineAttributeNumber(toAuthoredStart(element, patch.start)),
    });
  }
  if (patch.duration !== undefined) {
    ops.push({ property: "duration", value: formatTimelineAttributeNumber(patch.duration) });
  }
  if (patch.mediaStart !== undefined) {
    ops.push({
      property: patch.mediaStartAttr,
      value: formatTimelineMediaOffset(patch.mediaStart),
    });
  }
  if (patch.playbackRate !== undefined) {
    ops.push({ property: "playback-rate", value: formatTimelineMediaOffset(patch.playbackRate) });
  }
  if (patch.volume !== undefined) {
    ops.push({ property: "volume", value: formatTimelineMediaOffset(patch.volume) });
  }
  if (patch.colorGrading !== undefined) {
    ops.push({ property: "color-grading", value: patch.colorGrading });
  }
  return ops;
}

function findLive(
  doc: Document | null,
  patch: Pick<ClipEditPatch, "domId" | "hfId">,
): HTMLElement | null {
  if (!doc) return null;
  if (patch.domId) {
    const byId = doc.getElementById(patch.domId);
    if (isHtmlElement(byId)) return byId;
  }
  if (!patch.hfId) return null;
  for (const node of doc.querySelectorAll("[data-hf-id]")) {
    if (isHtmlElement(node) && node.getAttribute("data-hf-id") === patch.hfId) return node;
  }
  return null;
}

function currentGrade(doc: Document | null, element: TimelineElement): string | null {
  return findLive(doc, element)?.getAttribute("data-color-grading") ?? null;
}

async function writePatches(
  deps: EditToolDeps,
  patches: readonly ClipEditPatch[],
  elements: readonly TimelineElement[],
  label: string,
): Promise<ToolFailure | { changed: boolean }> {
  let changed = false;
  for (const patch of patches) {
    const element = elements.find((item) => item.id === patch.id);
    if (!element) return toolFailure("failed", `clip ${patch.id} disappeared before the write`);
    if (!patch.domId && !patch.hfId) {
      return toolFailure("blocked", `clip ${patch.id} has no id to write back to the file`);
    }
    const live = findLive(deps.getPreviewDocument(), patch);
    if (!live) return toolFailure("failed", `clip ${patch.id} is not in the preview`);
    const selection = await deps.buildSelection(live);
    if (!selection) return toolFailure("blocked", `clip ${patch.id} cannot be selected`);
    const operations = attributeOps(element, patch);
    if (operations.length === 0) continue;
    const landed = await deps.commitAttributes(selection, operations, label);
    if (!landed) return toolFailure("failed", `could not save the edit on clip ${patch.id}`);
    changed = true;
  }
  return { changed };
}

export async function studioEdit(
  deps: EditToolDeps,
  input: object,
  signal: AbortSignal = new AbortController().signal,
): Promise<StudioWriteResult<StudioEditResult>> {
  const requested = requestFromInput(input, "");
  if ("ok" in requested) {
    return { ...requested, stage: "refused", operation: "edit" };
  }
  let target: TimelineElement | null = null;
  let lane: TimelineElement[] = [];
  let plan: ReturnType<typeof planClipEdit> | ReturnType<typeof planGradeEdit> | null = null;
  return runTargetedWrite(deps, {
    handle: readField(input, "handle"),
    operation: "edit",
    signal,
    preflight: () => {
      const snapshot = deps.getSnapshot();
      const handle = readString(input, "handle") ?? "";
      target = findTimelineElement(snapshot, handle);
      if (!target) {
        return toolFailure(
          "invalid",
          "that handle is not a timeline clip",
          "Call studio_look and use a clip handle.",
        );
      }
      const activePath = snapshot.compositionPath ?? "index.html";
      const selected = target;
      lane = snapshot.elements.filter((element) => sameSource(element, selected, activePath));
      const parsed = requestFromInput(input, selected.id);
      if ("ok" in parsed) return parsed;
      plan = isGradeInput(parsed)
        ? planGradeEdit({
            ...parsed,
            domId: selected.domId,
            hfId: selected.hfId,
            mediaStartAttr: toEngineClip(selected).mediaStartAttr,
            current: currentGrade(deps.getPreviewDocument(), selected),
          } satisfies GradeEditRequest)
        : planClipEdit(lane.map(toEngineClip), parsed);
      return plan.ok ? null : toolFailure("invalid", plan.reason);
    },
    write: async () => {
      if (!target || !plan || !plan.ok) return toolFailure("failed", "the edit was not planned");
      const patches = "patch" in plan ? [plan.patch] : plan.patches;
      const written = await writePatches(deps, patches, lane, plan.summary);
      if ("ok" in written) return written;
      const value: StudioEditResult = {
        action: readString(input, "action") ?? "edit",
        summary: plan.summary,
        clips: patches.map((patch) => patch.id),
      };
      return dispatched(value, written.changed);
    },
  });
}

export const STUDIO_EDIT_INPUT_SCHEMA = {
  type: "object",
  properties: {
    handle: { type: "string", description: "A clip handle from studio_look." },
    action: {
      type: "string",
      enum: ACTIONS,
      description: "trim, ripple, roll, slip, slide, retime, gain, or grade.",
    },
    edge: {
      type: "string",
      enum: ["in", "out"],
      description: "Which side trim, ripple, or roll moves.",
    },
    delta: {
      type: "number",
      description: "Seconds. Positive moves the edit later or reveals later source.",
    },
    rate: { type: "number", description: "Playback rate for retime, such as 2 or 0.5." },
    keep: {
      type: "string",
      enum: ["duration", "source"],
      description: "retime: duration keeps the timeline slot; source keeps the frames and ripples.",
    },
    volume: { type: "number", description: "Linear gain for the gain action. 1 is unity." },
    preset: { type: "string", description: "Color preset, such as warm-daylight or night-lift." },
    intensity: { type: "number", description: "Grade intensity from 0 to 1." },
    adjust: {
      type: "object",
      description:
        "Primary correction: exposure, contrast, highlights, shadows, whites, blacks, temperature, tint, vibrance, saturation.",
      additionalProperties: { type: "number" },
    },
    clear: { type: "boolean", description: "Remove the clip's color grade." },
  },
  required: ["handle", "action"],
  additionalProperties: false,
} as const;

export const STUDIO_EDIT_DESCRIPTION = [
  "Edit a clip the way a finishing timeline does, by writing the composition.",
  "trim moves one edge and leaves neighbors. ripple moves that edge and shifts later clips on the same track.",
  "roll moves the cut shared with the touching neighbor. slip changes which source frames play without moving the clip.",
  "slide moves the clip and trims the neighbors so the track stays closed.",
  "retime sets data-playback-rate. gain sets data-volume. grade writes data-color-grading.",
  "A positive delta moves an out point later, trims an in point later, or slips toward later source.",
  "Tweens in the scene script do not move with the clip; change those with studio_update_animation.",
  "Returns the clips whose attributes changed.",
  WRITE_RECEIPT_DESCRIPTION,
].join(" ");
