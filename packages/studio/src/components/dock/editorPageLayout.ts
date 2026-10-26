import type { DockviewApi } from "dockview-react";
import {
  addRegisteredPanel,
  applySideMinimums,
  buildEditLayout,
  defaultSideWidths,
  sideMinimumWidth,
} from "./dockLayout";
import type { PanelId } from "./panelRegistry";

/** The browser editor's pages. Same split a finishing suite uses: cut, grade, mix, export. */
export const EDITOR_PAGES = ["edit", "color", "mix", "deliver"] as const;

export type EditorPageId = (typeof EDITOR_PAGES)[number];

export const EDITOR_PAGE_LABELS: Record<EditorPageId, string> = {
  edit: "Edit",
  color: "Color",
  mix: "Mix",
  deliver: "Deliver",
};

export const EDITOR_PAGE_HINTS: Record<EditorPageId, string> = {
  edit: "Assemble, trim and animate on the timeline",
  color: "Grade the shot: wheels, curves and scopes",
  mix: "Levels, fades and effects, with a tall timeline",
  deliver: "Render queue",
};

const COLOR_TIMELINE_H = 200;
const MIX_TIMELINE_H = 480;
const DELIVER_TIMELINE_H = 220;

interface PageRecipe {
  left: readonly PanelId[];
  right: readonly PanelId[];
  activeLeft: PanelId;
  activeRight: PanelId;
  timelineHeight: number;
  wideRight: boolean;
}

const RECIPES: Record<Exclude<EditorPageId, "edit">, PageRecipe> = {
  color: {
    left: ["compositions", "assets"],
    right: ["design", "layers"],
    activeLeft: "compositions",
    activeRight: "design",
    timelineHeight: COLOR_TIMELINE_H,
    wideRight: true,
  },
  mix: {
    left: ["compositions", "assets"],
    right: ["design", "layers"],
    activeLeft: "assets",
    activeRight: "design",
    timelineHeight: MIX_TIMELINE_H,
    wideRight: false,
  },
  deliver: {
    left: ["compositions"],
    right: ["renders", "design"],
    activeLeft: "compositions",
    activeRight: "renders",
    timelineHeight: DELIVER_TIMELINE_H,
    wideRight: false,
  },
};

export function isEditorPageId(value: unknown): value is EditorPageId {
  return typeof value === "string" && (EDITOR_PAGES as readonly string[]).includes(value);
}

function addColumn(
  api: DockviewApi,
  ids: readonly PanelId[],
  panels: readonly PanelId[],
  direction: "left" | "right",
  active: PanelId,
) {
  const present = ids.filter((id) => panels.includes(id));
  const [first, ...rest] = present;
  if (!first) return undefined;
  addRegisteredPanel(api, first, { referencePanel: "preview", direction });
  for (const id of rest)
    addRegisteredPanel(api, id, { referencePanel: first, direction: "within" });
  const focus = present.includes(active) ? active : first;
  api.getPanel(focus)?.api.setActive();
  return first;
}

function widenRight(api: DockviewApi, viewportWidth: number, anchor: PanelId | undefined) {
  if (!anchor) return;
  const group = api.getPanel(anchor)?.group;
  if (!group) return;
  const cap = defaultSideWidths(viewportWidth);
  const floor = sideMinimumWidth(viewportWidth);
  const room = Math.max(floor, viewportWidth - cap.left - 360);
  group.api.setSize({ width: Math.max(cap.right, Math.min(520, room)) });
}

/** Rebuild the dock for one page. Edit is the historical default layout. */
export function buildEditorPageLayout(
  page: EditorPageId,
  api: DockviewApi,
  viewportWidth: number,
  panels: readonly PanelId[],
) {
  if (page === "edit") {
    buildEditLayout(api, viewportWidth, panels);
    return;
  }
  const recipe = RECIPES[page];
  api.clear();
  addRegisteredPanel(api, "preview");
  addRegisteredPanel(api, "timeline", { referencePanel: "preview", direction: "below" });
  const widths = defaultSideWidths(viewportWidth);
  const left = addColumn(api, recipe.left, panels, "left", recipe.activeLeft);
  const right = addColumn(api, recipe.right, panels, "right", recipe.activeRight);
  applySideMinimums(api, viewportWidth);
  if (left) api.getPanel(left)?.group.api.setSize({ width: widths.left });
  if (right && recipe.wideRight) widenRight(api, viewportWidth, right);
  else if (right) api.getPanel(right)?.group.api.setSize({ width: widths.right });
  api.getPanel("timeline")?.group.api.setSize({ height: recipe.timelineHeight });
}
