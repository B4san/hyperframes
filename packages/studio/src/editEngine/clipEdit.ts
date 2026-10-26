/**
 * Timeline edit planner for the browser editor.
 *
 * The math is the part a finishing suite calls trim, ripple, roll, slip,
 * slide and retime. It plans attribute changes for clips that already exist
 * in the composition. It does not touch the DOM or the files: the caller
 * writes the patches through Studio's existing save path, so a gesture and
 * an agent land on the same code.
 */

import { RATE_RANGE } from "@hyperframes/core/audio-automation";
import { clampAudioGain } from "@hyperframes/core/audio-gain";
import { roundToCenti } from "../utils/rounding";

const MIN_DURATION = 1 / 60;
/** Two edges this close already share a cut. */
const TOUCH = 0.05;

export type MediaStartAttr = "media-start" | "playback-start";

export interface EngineClip {
  id: string;
  domId?: string;
  hfId?: string;
  track: number;
  start: number;
  duration: number;
  mediaStart: number;
  mediaStartAttr: MediaStartAttr;
  sourceDuration: number | null;
  playbackRate: number;
  volume: number;
  locked: boolean;
}

export interface ClipEditPatch {
  id: string;
  domId?: string;
  hfId?: string;
  mediaStartAttr: MediaStartAttr;
  start?: number;
  duration?: number;
  mediaStart?: number;
  playbackRate?: number;
  volume?: number;
  colorGrading?: string | null;
}

export type ClipEditPlan =
  | { ok: true; patches: ClipEditPatch[]; summary: string }
  | { ok: false; reason: string };

type TrimEdge = "in" | "out";

export type ClipEditRequest =
  | { action: "trim" | "ripple" | "roll"; clipId: string; edge: TrimEdge; delta: number }
  | { action: "slip" | "slide"; clipId: string; delta: number }
  | { action: "retime"; clipId: string; rate: number; keep: "duration" | "source" }
  | { action: "gain"; clipId: string; volume: number };

function refuse(reason: string): ClipEditPlan {
  return { ok: false, reason };
}

function succeed(patches: Array<ClipEditPatch | null>, summary: string): ClipEditPlan {
  return { ok: true, patches: patches.filter((patch) => patch !== null), summary };
}

function seconds(value: number): string {
  return `${roundToCenti(value)}s`;
}

function findClip(clips: readonly EngineClip[], id: string): EngineClip | ClipEditPlan {
  return clips.find((clip) => clip.id === id) ?? refuse(`no clip with id ${id}`);
}

function isRefusal(value: EngineClip | ClipEditPlan): value is ClipEditPlan {
  return "ok" in value;
}

function endOf(clip: EngineClip): number {
  return clip.start + clip.duration;
}

function sameTrack(clips: readonly EngineClip[], clip: EngineClip): EngineClip[] {
  return clips
    .filter((other) => other.track === clip.track && other.id !== clip.id)
    .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}

function nextTouching(clips: readonly EngineClip[], clip: EngineClip): EngineClip | null {
  const end = endOf(clip);
  const next = sameTrack(clips, clip).find((other) => other.start >= end - TOUCH);
  if (!next || next.start - end > TOUCH) return null;
  return next;
}

function prevTouching(clips: readonly EngineClip[], clip: EngineClip): EngineClip | null {
  const previous = sameTrack(clips, clip).filter((other) => endOf(other) <= clip.start + TOUCH);
  const prev = previous[previous.length - 1];
  if (!prev || clip.start - endOf(prev) > TOUCH) return null;
  return prev;
}

function downstream(clips: readonly EngineClip[], clip: EngineClip, from: number): EngineClip[] {
  return sameTrack(clips, clip).filter((other) => other.start >= from - 0.001);
}

/** How much longer this clip can run before it runs out of source. */
function sourceRoom(clip: EngineClip): number {
  if (clip.sourceDuration == null) return Number.POSITIVE_INFINITY;
  const used = clip.mediaStart + clip.duration * clip.playbackRate;
  return (clip.sourceDuration - used) / clip.playbackRate;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function diff(before: EngineClip, after: EngineClip): ClipEditPatch | null {
  const patch: ClipEditPatch = {
    id: before.id,
    domId: before.domId,
    hfId: before.hfId,
    mediaStartAttr: before.mediaStartAttr,
  };
  let changed = false;
  if (Math.abs(before.start - after.start) >= 0.005) {
    patch.start = after.start;
    changed = true;
  }
  if (Math.abs(before.duration - after.duration) >= 0.005) {
    patch.duration = after.duration;
    changed = true;
  }
  if (Math.abs(before.mediaStart - after.mediaStart) >= 0.0001) {
    patch.mediaStart = after.mediaStart;
    changed = true;
  }
  if (Math.abs(before.playbackRate - after.playbackRate) >= 0.0001) {
    patch.playbackRate = after.playbackRate;
    changed = true;
  }
  if (Math.abs(before.volume - after.volume) >= 0.0001) {
    patch.volume = after.volume;
    changed = true;
  }
  return changed ? patch : null;
}

function lockedReason(clips: readonly EngineClip[], ids: readonly string[]): string | null {
  const hit = clips.find((clip) => clip.locked && ids.includes(clip.id));
  return hit ? `clip ${hit.id} is locked` : null;
}

function finiteDelta(delta: number): ClipEditPlan | null {
  return Number.isFinite(delta) ? null : refuse("delta must be a finite number of seconds");
}

function trim(
  clips: readonly EngineClip[],
  clip: EngineClip,
  edge: TrimEdge,
  delta: number,
): ClipEditPlan {
  const locked = lockedReason(clips, [clip.id]);
  if (locked) return refuse(locked);
  if (edge === "in") return trimIn(clip, delta);
  return trimOut(clip, delta);
}

function trimIn(clip: EngineClip, delta: number): ClipEditPlan {
  const applied = clamp(
    delta,
    Math.max(-clip.start, -clip.mediaStart / clip.playbackRate),
    clip.duration - MIN_DURATION,
  );
  const next: EngineClip = {
    ...clip,
    start: roundToCenti(clip.start + applied),
    duration: roundToCenti(clip.duration - applied),
    mediaStart: clip.mediaStart + applied * clip.playbackRate,
  };
  return succeed([diff(clip, next)], `Trimmed the in point by ${seconds(applied)}`);
}

function trimOut(clip: EngineClip, delta: number): ClipEditPlan {
  const applied = clamp(delta, MIN_DURATION - clip.duration, sourceRoom(clip));
  const next: EngineClip = { ...clip, duration: roundToCenti(clip.duration + applied) };
  return succeed([diff(clip, next)], `Trimmed the out point by ${seconds(applied)}`);
}

function ripple(
  clips: readonly EngineClip[],
  clip: EngineClip,
  edge: TrimEdge,
  delta: number,
): ClipEditPlan {
  if (edge === "in") return rippleIn(clips, clip, delta);
  return rippleOut(clips, clip, delta);
}

function openLane(
  clips: readonly EngineClip[],
  clip: EngineClip,
): { later: EngineClip[] } | ClipEditPlan {
  const later = downstream(clips, clip, endOf(clip));
  const locked = lockedReason(clips, [clip.id, ...later.map((item) => item.id)]);
  return locked ? refuse(locked) : { later };
}

function shifted(later: readonly EngineClip[], shift: number): Array<ClipEditPatch | null> {
  return later.map((item) => diff(item, { ...item, start: roundToCenti(item.start + shift) }));
}

function rippleOut(clips: readonly EngineClip[], clip: EngineClip, delta: number): ClipEditPlan {
  const lane = openLane(clips, clip);
  if ("ok" in lane) return lane;
  const applied = clamp(delta, MIN_DURATION - clip.duration, sourceRoom(clip));
  const shift = limitShift(lane.later, applied);
  const next: EngineClip = { ...clip, duration: roundToCenti(clip.duration + shift) };
  return succeed(
    [diff(clip, next), ...shifted(lane.later, shift)],
    `Rippled the out point by ${seconds(shift)}`,
  );
}

function rippleIn(clips: readonly EngineClip[], clip: EngineClip, delta: number): ClipEditPlan {
  const lane = openLane(clips, clip);
  if ("ok" in lane) return lane;
  const applied = clamp(delta, -clip.mediaStart / clip.playbackRate, clip.duration - MIN_DURATION);
  const shift = limitShift(lane.later, -applied);
  const used = -shift;
  const next: EngineClip = {
    ...clip,
    duration: roundToCenti(clip.duration - used),
    mediaStart: clip.mediaStart + used * clip.playbackRate,
  };
  return succeed(
    [diff(clip, next), ...shifted(lane.later, shift)],
    `Rippled the in point by ${seconds(used)}`,
  );
}

function limitShift(clips: readonly EngineClip[], delta: number): number {
  let applied = delta;
  for (const clip of clips) {
    if (clip.start + applied < 0) applied = -clip.start;
  }
  return applied;
}

function roll(
  clips: readonly EngineClip[],
  clip: EngineClip,
  edge: TrimEdge,
  delta: number,
): ClipEditPlan {
  if (edge === "out") return rollOut(clips, clip, delta);
  return rollIn(clips, clip, delta);
}

function rollOut(clips: readonly EngineClip[], clip: EngineClip, delta: number): ClipEditPlan {
  const next = nextTouching(clips, clip);
  if (!next) return refuse("roll needs the next clip on this track to touch this out point");
  const locked = lockedReason(clips, [clip.id, next.id]);
  if (locked) return refuse(locked);
  const applied = clamp(
    delta,
    Math.max(MIN_DURATION - clip.duration, -next.mediaStart / next.playbackRate),
    Math.min(next.duration - MIN_DURATION, sourceRoom(clip)),
  );
  const rolled: EngineClip = { ...clip, duration: roundToCenti(clip.duration + applied) };
  const neighbor: EngineClip = {
    ...next,
    start: roundToCenti(next.start + applied),
    duration: roundToCenti(next.duration - applied),
    mediaStart: next.mediaStart + applied * next.playbackRate,
  };
  return succeed(
    [diff(clip, rolled), diff(next, neighbor)],
    `Rolled the cut by ${seconds(applied)}`,
  );
}

function rollIn(clips: readonly EngineClip[], clip: EngineClip, delta: number): ClipEditPlan {
  const prev = prevTouching(clips, clip);
  if (!prev) return refuse("roll needs the previous clip on this track to touch this in point");
  const locked = lockedReason(clips, [clip.id, prev.id]);
  if (locked) return refuse(locked);
  const applied = clamp(
    delta,
    Math.max(MIN_DURATION - prev.duration, -clip.mediaStart / clip.playbackRate),
    Math.min(clip.duration - MIN_DURATION, sourceRoom(prev)),
  );
  const neighbor: EngineClip = { ...prev, duration: roundToCenti(prev.duration + applied) };
  const rolled: EngineClip = {
    ...clip,
    start: roundToCenti(clip.start + applied),
    duration: roundToCenti(clip.duration - applied),
    mediaStart: clip.mediaStart + applied * clip.playbackRate,
  };
  return succeed(
    [diff(prev, neighbor), diff(clip, rolled)],
    `Rolled the cut by ${seconds(applied)}`,
  );
}

function slip(clips: readonly EngineClip[], clip: EngineClip, delta: number): ClipEditPlan {
  const locked = lockedReason(clips, [clip.id]);
  if (locked) return refuse(locked);
  const room = sourceRoom(clip);
  const applied = clamp(delta, -clip.mediaStart / clip.playbackRate, room);
  const next: EngineClip = { ...clip, mediaStart: clip.mediaStart + applied * clip.playbackRate };
  return succeed([diff(clip, next)], `Slipped the source by ${seconds(applied)}`);
}

function slide(clips: readonly EngineClip[], clip: EngineClip, delta: number): ClipEditPlan {
  const prev = prevTouching(clips, clip);
  const next = nextTouching(clips, clip);
  if (!prev || !next) return refuse("slide needs a clip touching both sides on the same track");
  const locked = lockedReason(clips, [clip.id, prev.id, next.id]);
  if (locked) return refuse(locked);
  const applied = clamp(
    delta,
    Math.max(MIN_DURATION - prev.duration, -clip.start, -next.mediaStart / next.playbackRate),
    Math.min(next.duration - MIN_DURATION, sourceRoom(prev)),
  );
  const previous: EngineClip = { ...prev, duration: roundToCenti(prev.duration + applied) };
  const moved: EngineClip = { ...clip, start: roundToCenti(clip.start + applied) };
  const following: EngineClip = {
    ...next,
    start: roundToCenti(next.start + applied),
    duration: roundToCenti(next.duration - applied),
    mediaStart: next.mediaStart + applied * next.playbackRate,
  };
  return succeed(
    [diff(prev, previous), diff(clip, moved), diff(next, following)],
    `Slid the clip by ${seconds(applied)}`,
  );
}

function retime(
  clips: readonly EngineClip[],
  clip: EngineClip,
  rate: number,
  keep: "duration" | "source",
): ClipEditPlan {
  if (!Number.isFinite(rate) || rate <= 0) return refuse("rate must be a positive number");
  const nextRate = clamp(rate, RATE_RANGE.min, RATE_RANGE.max);
  if (keep === "duration") {
    const locked = lockedReason(clips, [clip.id]);
    if (locked) return refuse(locked);
    return succeed(
      [diff(clip, { ...clip, playbackRate: nextRate })],
      `Set playback rate to ${nextRate}, keeping the timeline duration`,
    );
  }
  const lane = openLane(clips, clip);
  if ("ok" in lane) return lane;
  const duration = Math.max(
    MIN_DURATION,
    roundToCenti((clip.duration * clip.playbackRate) / nextRate),
  );
  const shift = limitShift(lane.later, duration - clip.duration);
  const fitted = roundToCenti(clip.duration + shift);
  const next: EngineClip = { ...clip, playbackRate: nextRate, duration: fitted };
  return succeed(
    [diff(clip, next), ...shifted(lane.later, shift)],
    `Set playback rate to ${nextRate} and rippled the timeline to keep the same source`,
  );
}

function gain(clips: readonly EngineClip[], clip: EngineClip, volume: number): ClipEditPlan {
  if (!Number.isFinite(volume) || volume < 0)
    return refuse("volume must be a non-negative linear gain");
  const locked = lockedReason(clips, [clip.id]);
  if (locked) return refuse(locked);
  const next = clampAudioGain(volume);
  return succeed([diff(clip, { ...clip, volume: next })], `Set gain to ${next}`);
}

export function planClipEdit(clips: readonly EngineClip[], request: ClipEditRequest): ClipEditPlan {
  const deltaRefusal = "delta" in request ? finiteDelta(request.delta) : null;
  if (deltaRefusal) return deltaRefusal;
  const clip = findClip(clips, request.clipId);
  if (isRefusal(clip)) return clip;
  switch (request.action) {
    case "trim":
      return trim(clips, clip, request.edge, request.delta);
    case "ripple":
      return ripple(clips, clip, request.edge, request.delta);
    case "roll":
      return roll(clips, clip, request.edge, request.delta);
    case "slip":
      return slip(clips, clip, request.delta);
    case "slide":
      return slide(clips, clip, request.delta);
    case "retime":
      return retime(clips, clip, request.rate, request.keep);
    case "gain":
      return gain(clips, clip, request.volume);
    default: {
      const unknown: never = request;
      return refuse(`unsupported edit ${String(unknown)}`);
    }
  }
}
