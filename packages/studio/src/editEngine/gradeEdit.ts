/**
 * Primary color grade as a `data-color-grading` patch.
 *
 * The color page already edits this attribute by hand. The planner merges a
 * preset, intensity or primary correction into the grade the clip already
 * has, then serializes it with the same normalizer the wheels use.
 */

import { serializeHfColorGrading } from "@hyperframes/core/color-grading";
import { COLOR_GRADING_ADJUST_KEYS } from "@hyperframes/parsers/color-grading-contract";
import type { ClipEditPatch } from "./clipEdit";

const GRADE_PRESETS = [
  "neutral",
  "warm-daylight",
  "clean-studio",
  "skin-soft",
  "food-pop",
  "night-lift",
  "muted-editorial",
  "vintage-wash",
  "mono-clean",
  "mono-fade",
  "soft-boost",
  "bright-pop",
  "deep-contrast",
  "creator-camcorder",
  "vhs-playback",
  "home-movie-8mm",
  "editorial-halftone",
  "two-ink-print",
] as const;

const PRESETS = new Set<string>(GRADE_PRESETS);
const ADJUST_KEYS = new Set<string>(COLOR_GRADING_ADJUST_KEYS);

export interface GradeEditRequest {
  clipId: string;
  domId?: string;
  hfId?: string;
  mediaStartAttr: ClipEditPatch["mediaStartAttr"];
  current: string | null;
  preset?: string;
  intensity?: number;
  adjust?: Record<string, number>;
  clear?: boolean;
}

export type GradeEditPlan =
  | { ok: true; patch: ClipEditPatch; summary: string }
  | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readCurrent(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function invalidAdjust(adjust: Record<string, number> | undefined): string | null {
  if (!adjust) return null;
  for (const [key, value] of Object.entries(adjust)) {
    if (!ADJUST_KEYS.has(key)) {
      return `adjust.${key} is not a primary correction (${COLOR_GRADING_ADJUST_KEYS.join(", ")})`;
    }
    if (!Number.isFinite(value)) return `adjust.${key} must be a finite number`;
  }
  return null;
}

export function planGradeEdit(request: GradeEditRequest): GradeEditPlan {
  const identity = {
    id: request.clipId,
    domId: request.domId,
    hfId: request.hfId,
    mediaStartAttr: request.mediaStartAttr,
  };
  if (request.clear) {
    return {
      ok: true,
      patch: { ...identity, colorGrading: null },
      summary: "Cleared the color grade",
    };
  }
  const hasChange =
    request.preset !== undefined || request.intensity !== undefined || request.adjust !== undefined;
  if (!hasChange) return { ok: false, reason: "grade needs a preset, intensity, adjust, or clear" };
  if (request.preset !== undefined && !PRESETS.has(request.preset)) {
    return { ok: false, reason: `unknown grade preset "${request.preset}"` };
  }
  if (request.intensity !== undefined && !Number.isFinite(request.intensity)) {
    return { ok: false, reason: "intensity must be a finite number" };
  }
  const adjustError = invalidAdjust(request.adjust);
  if (adjustError) return { ok: false, reason: adjustError };

  const current = readCurrent(request.current);
  const currentAdjust = isRecord(current.adjust) ? current.adjust : {};
  const merged = {
    ...current,
    ...(request.preset !== undefined ? { preset: request.preset } : {}),
    ...(request.intensity !== undefined ? { intensity: request.intensity } : {}),
    ...(request.adjust ? { adjust: { ...currentAdjust, ...request.adjust } } : {}),
  };
  const serialized = serializeHfColorGrading(merged);
  if (!serialized) return { ok: false, reason: "that grade could not be serialized" };
  const label = request.preset ?? "primary";
  return {
    ok: true,
    patch: { ...identity, colorGrading: serialized },
    summary: `Graded the clip (${label})`,
  };
}
