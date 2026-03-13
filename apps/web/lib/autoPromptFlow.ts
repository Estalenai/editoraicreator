type RunAutoPromptFlowArgs = {
  promptEnabled: boolean;
  autoApply: boolean;
  generatePrompt: () => Promise<string>;
  applyPrompt: (prompt: string) => Promise<void>;
  showPromptEditor: (prompt: string) => void;
  onPromptUsed: (prompt: string) => void;
  buildManualPrompt: () => string;
  setLoadingPrompt: (loading: boolean) => void;
  setError: (value: string | null) => void;
  onStart?: () => void;
};

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  return fallback;
}

export async function runAutoPromptFlow({
  promptEnabled,
  autoApply,
  generatePrompt,
  applyPrompt,
  showPromptEditor,
  onPromptUsed,
  buildManualPrompt,
  setLoadingPrompt,
  setError,
  onStart,
}: RunAutoPromptFlowArgs): Promise<void> {
  onStart?.();

  if (promptEnabled) {
    setLoadingPrompt(true);
    setError(null);
    try {
      const promptText = await generatePrompt();
      if (autoApply) {
        onPromptUsed(promptText);
        await applyPrompt(promptText);
        return;
      }

      showPromptEditor(promptText);
      return;
    } catch (error) {
      setError(getErrorMessage(error, autoApply ? "Falha ao gerar/aplicar prompt." : "Falha ao gerar prompt."));
      return;
    } finally {
      setLoadingPrompt(false);
    }
  }

  try {
    const manualPrompt = buildManualPrompt();
    onPromptUsed(manualPrompt);
    await applyPrompt(manualPrompt);
  } catch (error) {
    setError(getErrorMessage(error, "Falha ao aplicar prompt."));
  }
}
