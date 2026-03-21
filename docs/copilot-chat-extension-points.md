# Copilot Chat Extension Points: Adding Language Model Backends

This document captures how the Copilot Chat architecture supports adding new language model backends (cloud and local), and how third-party extensions like Hugging Face integrate with it.

---

## Summary

- **Yes, there is a clean extension point** for adding backends: the VS Code `LanguageModelChatProvider` API.
- Any extension can add a provider—including local models—without forking Copilot.
- Third-party extensions (e.g. Hugging Face) and bundled BYOK providers (e.g. MLX, Ollama) use the same API.
- When a non-copilot model is selected, Copilot Chat uses `ExtensionContributedChatEndpoint` and delegates to the provider via `model.sendRequest()`.

---

## VS Code Language Model Chat Provider API

The extension point is the **VS Code `LanguageModelChatProvider` API** (VS Code 1.104+).

### 1. Declaration in package.json

```json
"contributes": {
  "languageModelChatProviders": [
    {
      "vendor": "my-provider",
      "displayName": "My Provider",
      "managementCommand": "my-provider.manage"
    }
  ]
}
```

- `vendor`: Unique ID; must match the value passed to `registerLanguageModelChatProvider`.
- `managementCommand`: Optional command for API key setup / configuration (e.g. "Manage Models…").

### 2. Registration at activation

```ts
vscode.lm.registerLanguageModelChatProvider('my-provider', myProvider);
```

### 3. Provider interface

| Method | Purpose |
|--------|---------|
| `provideLanguageModelChatInformation(options, token)` | Return available models for the picker |
| `provideLanguageModelChatResponse(model, messages, options, progress, token)` | Handle chat requests and stream responses |
| `provideTokenCount(model, text, token)` | Optional token counting |

### 4. References

- [VS Code API: Language Model Chat Provider](https://code.visualstudio.com/api/extension-guides/ai/language-model-chat-provider)
- Sample: [chat-model-provider-sample](https://github.com/microsoft/vscode-extension-samples/blob/main/chat-model-provider-sample)

---

## How Copilot Chat Routes Requests

When the user picks a model, Copilot’s `ProductionEndpointProvider` chooses an endpoint:

```ts
// src/extension/prompt/vscode-node/endpointProviderImpl.ts
if (model.vendor !== 'copilot') {
  return this._instantiationService.createInstance(ExtensionContributedChatEndpoint, model);
}
```

- **`copilot`**: GitHub Copilot cloud models → `CopilotChatEndpoint` (CAPI).
- **Any other vendor**: Uses `ExtensionContributedChatEndpoint`, which wraps the `vscode.LanguageModelChat` and calls `model.sendRequest()`, which VS Code dispatches to the provider for that vendor.

---

## Two Ways Backends Are Added

| Approach | Examples | How |
|----------|----------|-----|
| **Bundled in Copilot** | MLX, Ollama, Anthropic, OpenAI, Azure, OpenRouter, Gemini, xAI, Custom OAI | Implemented in `BYOKContrib` (`src/extension/byok/vscode-node/byokContribution.ts`), registered via `lm.registerLanguageModelChatProvider`. |
| **Separate extension** | Hugging Face (`huggingface-vscode-chat`) | Separate extension with its own contribution and `registerLanguageModelChatProvider`. |

Both use the same VS Code API; only the hosting extension differs.

---

## Hugging Face Extension Reference

The [Hugging Face Provider for GitHub Copilot Chat](https://github.com/huggingface/huggingface-vscode-chat) is a third-party extension that demonstrates the extension point.

### Architecture

| File | Role |
|------|------|
| `src/extension.ts` | Registers provider, builds User-Agent, adds `huggingface.manage` for API key setup |
| `src/provider.ts` | `HuggingFaceChatModelProvider` implementing `LanguageModelChatProvider` |
| `src/utils.ts` | VS Code ↔ OpenAI message format conversion, schema sanitization |
| `src/types.ts` | HF API and OpenAI-style message types |

### API

- Base URL: `https://router.huggingface.co/v1`
- `GET /models` → model catalog
- `POST /chat/completions` → chat completions (OpenAI-compatible)
- Auth: Bearer token from `context.secrets.get("huggingface.apiKey")`

### Flow

1. `prepareLanguageModelChatInformation`: Ensure API key → fetch models → convert to `LanguageModelChatInformation[]`.
2. `provideLanguageModelChatResponse`: Convert messages, validate tools, POST to `/chat/completions` with streaming.
3. SSE handling: Parse `data: {...}` lines, emit `LanguageModelTextPart`, `LanguageModelToolCallPart`, etc.

---

## Adding Local Model Backends

### Option A: Separate extension

Ship an extension that implements `LanguageModelChatProvider` for your local backend. It appears in the model picker alongside other providers.

- No fork of Copilot required.
- Same pattern as Hugging Face (but for local inference).
- Pick a `vendor` string that matches `registerLanguageModelChatProvider` and is unique among **your** installed extensions. **GitHub Copilot Chat does not ship an MLX BYOK provider**, so registering `mlx` here is not blocked by a built-in duplicate.

### Option B: Bundled in Copilot

Add a provider in `BYOKContrib` and register it (e.g. like Ollama). Requires editing the Copilot extension (or a fork).

---

## Strategic Note: HF Extension vs MLX Extension

**Should you merge the MLX backend into the Hugging Face extension?**

Recommendation: **no**. Keep MLX in this fork (or a separate extension).

| Factor | Hugging Face extension | MLX extension (this fork) |
|--------|------------------------|---------------------------|
| Backend | Cloud (Router API) | Local (MLX server) |
| Auth | HF API token | None / local only |
| Model source | Router API `/models` | User-provided local paths |
| Architecture | Thin client, fetch → cloud | Local server, model registry, Python runtime |

A “model browser” with GGUF/MLX filters and “download & run locally” fits better in **this extension**, because it’s tied to local execution, model management, and runtimes.

---

## Key Files in a Copilot Fork (reference)

Some forks of Copilot include BYOK providers in-tree. **Stock GitHub Copilot Chat does not include an MLX provider**; the paths below are for forks that do.

| Path | Purpose |
|------|---------|
| `src/extension/byok/vscode-node/byokContribution.ts` | Registers BYOK providers |
| `src/extension/byok/vscode-node/mlxProvider.ts` | MLX `LanguageModelChatProvider` (if present in fork) |
| `src/extension/prompt/vscode-node/endpointProviderImpl.ts` | Routes non-copilot models to `ExtensionContributedChatEndpoint` |
| `src/platform/endpoint/vscode-node/extChatEndpoint.ts` | `ExtensionContributedChatEndpoint`; calls `model.sendRequest()` |
| `package.json` `languageModelChatProviders` | Declares vendors (copilot, ollama, huggingface, etc.) |

---

## Vendor IDs in package.json

The Copilot extension declares vendors for both its own and BYOK providers, e.g.:

- `copilot`, `copilotcli`, `claude-code` — Copilot / CLI / Claude Code
- `anthropic`, `xai`, `gemini`, `openrouter`, `openai` — Cloud BYOK
- `ollama`, `customoai`, `azure` — Local / custom BYOK (exact set can vary by release)

**MLX:** Copilot does not register an MLX local provider. A separate extension (e.g. this project) can contribute `vendor: "mlx"` without colliding with a built-in MLX entry.

Third-party extensions (e.g. Hugging Face) add their own entries via their `package.json`; VS Code merges them into the model picker.
