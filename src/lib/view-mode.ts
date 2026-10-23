/** How the audit tab presents results: plain language for marketers, or the full technical matrix. */
export type ViewMode = "plain" | "technical";

export const VIEW_MODES: readonly ViewMode[] = ["plain", "technical"];

export function parseView(value: string | null | undefined): ViewMode {
  return value === "technical" ? "technical" : "plain";
}

/** Writes the view into search params. The default view stays out of the URL. */
export function applyView(params: URLSearchParams, view: ViewMode): URLSearchParams {
  if (view === "plain") params.delete("view");
  else params.set("view", view);
  return params;
}
