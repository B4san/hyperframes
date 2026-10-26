// @vitest-environment happy-dom

import type { DockviewApi } from "dockview-react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildEditorPageLayout } from "./editorPageLayout";
import { mountBareDockview } from "./dockTestHarness";
import { PANEL_IDS } from "./panelRegistry";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;

function panelIds(api: DockviewApi): string[] {
  return api.panels.map((panel) => panel.id).sort();
}

describe("buildEditorPageLayout", () => {
  let api: DockviewApi;
  beforeEach(() => {
    ({ api } = mountBareDockview());
    api.layout(1400, 800);
  });
  afterEach(() => {
    api.dispose();
    document.body.innerHTML = "";
  });

  it("keeps the edit page on the full default dock", () => {
    buildEditorPageLayout("edit", api, 1400, PANEL_IDS);
    expect(panelIds(api)).toContain("code");
    expect(panelIds(api)).toContain("timeline");
    expect(api.getPanel("design")?.api.isActive).toBe(true);
  });

  it("opens color on the grade inspector with a short timeline", () => {
    buildEditorPageLayout("color", api, 1400, PANEL_IDS);
    expect(panelIds(api)).toEqual([
      "assets",
      "compositions",
      "design",
      "layers",
      "preview",
      "timeline",
    ]);
    expect(api.getPanel("design")?.api.isActive).toBe(true);
    expect(api.getPanel("timeline")?.group.height).toBe(200);
  });

  it("opens mix with the tall timeline and deliver on the render queue", () => {
    buildEditorPageLayout("mix", api, 1400, PANEL_IDS);
    expect(api.getPanel("timeline")?.group.height).toBe(480);
    expect(api.getPanel("assets")?.group.activePanel?.id).toBe("assets");
    expect(api.getPanel("design")?.api.isActive).toBe(true);

    buildEditorPageLayout("deliver", api, 1400, PANEL_IDS);
    expect(panelIds(api)).toEqual(["compositions", "design", "preview", "renders", "timeline"]);
    expect(api.getPanel("renders")?.api.isActive).toBe(true);
    expect(api.getPanel("timeline")?.group.height).toBe(220);
  });

  it("skips a panel the host did not register", () => {
    buildEditorPageLayout("color", api, 1400, ["preview", "timeline", "design"]);
    expect(panelIds(api)).toEqual(["design", "preview", "timeline"]);
  });
});
