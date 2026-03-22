// This is a placeholder file for VS Code API types
// The actual types are provided by the @types/vscode package

// Augment VS Code types for Copilot Chat / Cursor compatibility
declare module 'vscode' {
  interface LanguageModelChatInformation {
    /**
     * Whether the model shows up in the model picker. Required for models
     * to appear in the "Other Models" section of Copilot Chat.
     */
    isUserSelectable?: boolean;
    /**
     * Optional category for grouping models in the picker.
     */
    category?: { label: string; order: number };
  }

  interface PrepareLanguageModelChatModelOptions {
    /**
     * Per-provider configuration from Manage Models (when user adds provider).
     */
    configuration?: { url?: string; apiKey?: string };
  }
}