/**
 * Layout observations for the agent.
 *
 * Nothing here edits the composition. Each advisory is a choice: fix it, or
 * leave it when the frame is meant to look that way.
 */

export interface FrameSize {
  width: number;
  height: number;
}

export interface AdvisoryBox {
  id: string;
  label: string;
  text: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  allowOverlap?: boolean;
  allowOverflow?: boolean;
}

export type AdvisoryCode = "text_near_edge" | "text_overlap" | "element_out_of_frame";

export interface LayoutAdvisory {
  code: AdvisoryCode;
  message: string;
  elementIds: string[];
  decision: string;
}

const DECISION = "Fix it, or leave it if the video is meant to look this way. Say which you chose.";

/** Key text stays inside this fraction of the frame (the inner 80 percent). */
const TITLE_SAFE = 0.1;
/** Overlap worth mentioning: this share of the smaller text box. */
const OVERLAP_SHARE = 0.15;
/** A box this far outside is an exit, not a near-edge. */
const OUTSIDE_SHARE = 0.5;

function area(box: AdvisoryBox): number {
  return Math.max(0, box.width) * Math.max(0, box.height);
}

function intersectionArea(a: AdvisoryBox, b: AdvisoryBox): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (width <= 0 || height <= 0) return 0;
  return width * height;
}

function insideArea(box: AdvisoryBox, frame: FrameSize): number {
  const width = Math.min(box.x + box.width, frame.width) - Math.max(box.x, 0);
  const height = Math.min(box.y + box.height, frame.height) - Math.max(box.y, 0);
  if (width <= 0 || height <= 0) return 0;
  return width * height;
}

function snippet(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length <= 42 ? collapsed : `${collapsed.slice(0, 41)}…`;
}

function nearEdge(box: AdvisoryBox, frame: FrameSize): string | null {
  const insetX = frame.width * TITLE_SAFE;
  const insetY = frame.height * TITLE_SAFE;
  const edges: string[] = [];
  if (box.x < insetX) edges.push("left");
  if (box.y < insetY) edges.push("top");
  if (box.x + box.width > frame.width - insetX) edges.push("right");
  if (box.y + box.height > frame.height - insetY) edges.push("bottom");
  if (edges.length === 0) return null;
  return `Text "${snippet(box.text ?? box.label)}" sits in the outer 10 percent (${edges.join(", ")}). Title-safe is the inner 80 percent.`;
}

function outOfFrame(box: AdvisoryBox, frame: FrameSize): boolean {
  const total = area(box);
  if (total <= 0) return false;
  return insideArea(box, frame) / total < 1 - OUTSIDE_SHARE;
}

function advisory(code: AdvisoryCode, message: string, elementIds: string[]): LayoutAdvisory {
  return { code, message, elementIds, decision: DECISION };
}

function edgeAdvisories(frame: FrameSize, boxes: readonly AdvisoryBox[]): LayoutAdvisory[] {
  const found: LayoutAdvisory[] = [];
  for (const box of boxes) {
    if (box.allowOverflow) continue;
    if (outOfFrame(box, frame)) {
      found.push(
        advisory("element_out_of_frame", `"${box.label}" is mostly outside the frame.`, [box.id]),
      );
      continue;
    }
    if (!box.text) continue;
    const message = nearEdge(box, frame);
    if (message) found.push(advisory("text_near_edge", message, [box.id]));
  }
  return found;
}

function overlapAdvisories(boxes: readonly AdvisoryBox[]): LayoutAdvisory[] {
  const text = boxes.filter((box) => box.text && !box.allowOverlap);
  const found: LayoutAdvisory[] = [];
  for (let i = 0; i < text.length; i++) {
    const left = text[i];
    if (!left) continue;
    for (let j = i + 1; j < text.length; j++) {
      const right = text[j];
      if (!right) continue;
      const shared = intersectionArea(left, right);
      const smaller = Math.min(area(left), area(right));
      if (smaller <= 0 || shared / smaller < OVERLAP_SHARE) continue;
      found.push(
        advisory(
          "text_overlap",
          `"${snippet(left.text ?? left.label)}" crosses "${snippet(right.text ?? right.label)}".`,
          [left.id, right.id],
        ),
      );
    }
  }
  return found;
}

export function reviewLayout(frame: FrameSize, boxes: readonly AdvisoryBox[]): LayoutAdvisory[] {
  if (frame.width <= 0 || frame.height <= 0) return [];
  return [...edgeAdvisories(frame, boxes), ...overlapAdvisories(boxes)];
}

export function formatLayoutAdvisories(advisories: readonly LayoutAdvisory[]): string {
  const header = [
    "## Layout warnings",
    "Observations, not orders. Do not fix one just because it is listed.",
  ];
  if (advisories.length === 0) {
    return [...header, "None at this frame."].join("\n");
  }
  const lines = advisories.map((item) => `- ${item.code}: ${item.message} ${item.decision}`);
  return [...header, ...lines].join("\n");
}
