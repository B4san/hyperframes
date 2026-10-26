import { useEffect } from "react";
import { useStudioShellContext } from "../contexts/StudioContext";
import { readStudioUiPreferences } from "../utils/studioUiPreferences";
import { useDockLayoutStore } from "./dock/dockLayoutStore";
import {
  EDITOR_PAGES,
  EDITOR_PAGE_HINTS,
  EDITOR_PAGE_LABELS,
  type EditorPageId,
} from "./dock/editorPageLayout";
import { cn } from "./ui";

/**
 * The page bar. One click rebuilds the dock around the job: cutting, grading,
 * mixing or delivering. The saved panel tree still wins on reload; clicking a
 * page again restores that page's preset.
 */
export function EditorPageBar() {
  const { projectId } = useStudioShellContext();
  const page = useDockLayoutStore((state) => state.editorPage);
  const applyEditorPage = useDockLayoutStore((state) => state.applyEditorPage);

  useEffect(() => {
    const saved = readStudioUiPreferences(undefined, projectId).editorPage;
    if (!saved || saved === useDockLayoutStore.getState().editorPage) return;
    useDockLayoutStore.setState({ editorPage: saved });
  }, [projectId]);

  return (
    <div
      role="tablist"
      aria-label="Editor pages"
      data-testid="editor-pages"
      className="flex h-7 items-center rounded-md border border-border-strong bg-bg-2 p-0.5"
    >
      {EDITOR_PAGES.map((id) => (
        <PageTab key={id} id={id} selected={page === id} onSelect={applyEditorPage} />
      ))}
    </div>
  );
}

function PageTab({
  id,
  selected,
  onSelect,
}: {
  id: EditorPageId;
  selected: boolean;
  onSelect: (page: EditorPageId) => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      data-testid={`editor-page-${id}`}
      title={EDITOR_PAGE_HINTS[id]}
      className={cn(
        "h-6 rounded px-2.5 text-[11px] font-medium",
        selected ? "bg-on text-accent-ink" : "text-text-3 hover:bg-hover hover:text-text-0",
      )}
      onClick={() => onSelect(id)}
    >
      {EDITOR_PAGE_LABELS[id]}
    </button>
  );
}
