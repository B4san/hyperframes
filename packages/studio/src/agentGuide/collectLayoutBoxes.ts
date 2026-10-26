/**
 * Read the live preview into the boxes `reviewLayout` understands.
 * Rects are relative to the composition root, in CSS pixels.
 */

import type { AdvisoryBox, FrameSize } from "./layoutAdvisories";

const TEXT_TAGS = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "span",
  "a",
  "button",
  "label",
  "li",
  "figcaption",
  "blockquote",
]);

export interface LayoutSample {
  frame: FrameSize;
  boxes: AdvisoryBox[];
}

interface BoxReader {
  (element: HTMLElement): DOMRect;
}

function leafText(element: HTMLElement): string | null {
  const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const tag = element.tagName.toLowerCase();
  if (element.querySelector("[id]") && !TEXT_TAGS.has(tag)) return null;
  return text;
}

/** A marker on the composition root does not opt the whole frame out. */
function marked(element: HTMLElement, root: HTMLElement, name: string): boolean {
  let current: HTMLElement | null = element;
  while (current && current !== root) {
    if (current.hasAttribute(name)) return true;
    current = current.parentElement;
  }
  return false;
}

function hidden(doc: Document, node: HTMLElement): boolean {
  const style = doc.defaultView?.getComputedStyle(node);
  return !!style && (style.display === "none" || style.visibility === "hidden");
}

function boxFrom(
  node: HTMLElement,
  root: HTMLElement,
  rootBox: DOMRect,
  readBox: BoxReader,
): AdvisoryBox | null {
  if (node === root || node.closest("[data-hf-color-grading-canvas]")) return null;
  const rect = readBox(node);
  if (rect.width < 1 || rect.height < 1) return null;
  return {
    id: node.id,
    label: node.getAttribute("data-label") || node.id,
    text: leafText(node),
    x: rect.left - rootBox.left,
    y: rect.top - rootBox.top,
    width: rect.width,
    height: rect.height,
    allowOverlap: marked(node, root, "data-layout-allow-overlap"),
    allowOverflow: marked(node, root, "data-layout-allow-overflow"),
  };
}

export function collectLayoutBoxes(
  doc: Document,
  readBox: BoxReader = (element) => element.getBoundingClientRect(),
): LayoutSample | null {
  const root =
    doc.querySelector<HTMLElement>("[data-composition-id]") ?? doc.getElementById("root");
  if (!root) return null;
  const rootBox = readBox(root);
  const frame = {
    width: rootBox.width || root.clientWidth,
    height: rootBox.height || root.clientHeight,
  };
  if (frame.width < 10 || frame.height < 10) return null;

  const boxes: AdvisoryBox[] = [];
  for (const node of root.querySelectorAll<HTMLElement>("[id]")) {
    if (hidden(doc, node)) continue;
    const box = boxFrom(node, root, rootBox, readBox);
    if (box) boxes.push(box);
  }
  return { frame, boxes };
}
