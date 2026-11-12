export function generationBlocker(state: {
  ready: boolean; busy: string | null; loading: boolean; modelAvailable: boolean; hasReferences: boolean;
  ratioSupported: boolean; missingStyle: boolean; subjectError: string | null; previewError: string | null;
  direction: string; previewCurrent: boolean; overBy: number; recoveryCount: number;
}) {
  if (state.busy) return `${state.busy} Wait for this operation to finish.`;
  if (!state.ready) return "Resolve browser storage before generating.";
  if (!state.modelAvailable) return state.hasReferences ? "Choose an available image model that supports visual references." : "Choose an available image model.";
  if (!state.ratioSupported) return "Choose an aspect ratio supported by this model.";
  if (state.missingStyle) return "The saved visual style is unavailable. Choose another style.";
  if (state.subjectError) return state.subjectError;
  if (!state.direction.trim()) return "Write a direction to generate.";
  if (state.loading) return "Wait for the prompt preview to finish updating.";
  if (state.previewError) return state.previewError;
  if (!state.previewCurrent) return "Waiting for the prompt preview to update.";
  if (state.overBy > 0) return "Shorten or exclude sections until the prompt fits.";
  if (state.recoveryCount >= 20) return "Recover, save or discard previous images before generating more (20-request recovery limit).";
  return null;
}
