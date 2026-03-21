# Ollama Local Models: Engineering Guide

This document provides a comprehensive technical reference for how local Ollama models are supported in the vscode-copilot-byomlx-chat (GitHub Copilot Chat) extension.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Configuration](#configuration)
5. [Provider Implementation](#provider-implementation)
6. [Class Hierarchy](#class-hierarchy)
7. [BYOK Integration](#byok-integration)
8. [Ollama API Integration](#ollama-api-integration)
9. [Request Flow](#request-flow)
10. [Capability Detection](#capability-detection)
11. [Tool Calling](#tool-calling)
12. [Error Handling](#error-handling)
13. [Telemetry and Monitoring](#telemetry-and-monitoring)
14. [Differences from Other BYOK Providers](#differences-from-other-byok-providers)
15. [File Reference](#file-reference)

---

## Overview

Ollama support allows users to run chat completions against a **local Ollama server** instead of cloud-hosted models. Ollama runs LLMs locally (e.g., Llama, Mistral, CodeLlama) and exposes an OpenAI-compatible API.

Key characteristics:

- **Local execution**: No data leaves the machine
- **No API key**: Uses `BYOKAuthType.None`; no authentication required
- **OpenAI-compatible**: Uses the `/v1/chat/completions` endpoint format
- **Model discovery**: Fetches model list from Ollama’s native API
- **BYOK-gated**: Requires a GitHub Copilot subscription (Pro or Free with BYOK enabled) to access

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           VS Code / Copilot Chat UI                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ lm.registerLanguageModelChatProvider('ollama', provider)
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  BYOKContrib (byokContribution.ts)                                           │
│  - Registers OllamaLMProvider when auth token + isBYOKEnabled                │
│  - Provider appears in model picker as "Ollama"                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  OllamaLMProvider (ollamaProvider.ts)                                        │
│  - Extends AbstractOpenAICompatibleLMProvider                                │
│  - Overrides: getAllModels, getModelsBaseUrl, createOpenAIEndPoint           │
│  - Uses Ollama APIs: /api/tags, /api/show, /api/version                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ createOpenAIEndPoint() → OpenAIEndpoint
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  OpenAIEndpoint (openAIEndpoint.ts)                                          │
│  - POST {baseUrl}/v1/chat/completions                                        │
│  - API key: empty string (no Authorization header required by Ollama)        │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ HTTP
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Ollama Server (localhost:11434 or configured URL)                           │
│  - /v1/chat/completions (OpenAI-compatible)                                  │
│  - /api/tags, /api/show, /api/version (native)                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

### 1. GitHub Copilot Subscription

Ollama is part of the **BYOK (Bring Your Own Key)** system. BYOK providers are only registered when:

- The user has a valid `copilotToken` (signed into GitHub Copilot)
- `isBYOKEnabled()` returns true (individual or internal Copilot, not GitHub Enterprise)

```typescript
// src/extension/byok/common/byokProvider.ts
export function isBYOKEnabled(copilotToken: Omit<CopilotToken, 'token'>, capiClientService: ICAPIClientService): boolean {
    if (isScenarioAutomation) return true;
    const isGHE = capiClientService.dotcomAPIURL !== 'https://api.github.com';
    return (copilotToken.isIndividual || copilotToken.isInternal) && !isGHE;
}
```

Without a Copilot subscription, the Ollama provider is never registered and will not appear in the model picker.

### 2. Ollama Server

- **Version**: 0.6.4 or higher
- **Default URL**: `http://localhost:11434`
- **Start**: Run `ollama serve` (or equivalent for your installation)

---

## Configuration

### package.json Contribution

The Ollama provider is declared in `package.json` under `contributes.languageModelChatProviders`:

```json
{
  "vendor": "ollama",
  "displayName": "Ollama",
  "configuration": {
    "type": "object",
    "properties": {
      "url": {
        "type": "string",
        "description": "The endpoint URL for the Ollama server",
        "default": "http://localhost:11434",
        "title": "URL"
      }
    },
    "required": ["url"]
  }
}
```

### User Configuration

Users configure Ollama via the Copilot Chat "Manage Models" flow, which stores the `url` in the language model provider group configuration. The key `url` is required; the default is `http://localhost:11434`.

### Deprecated Setting (Migration)

A legacy setting `github.copilot.chat.byok.ollamaEndpoint` existed. On first run, `OllamaLMProvider.migrateConfig()` migrates any value to the new provider group configuration and clears the deprecated setting.

---

## Provider Implementation

### Core File: `src/extension/byok/vscode-node/ollamaProvider.ts`

`OllamaLMProvider` extends `AbstractOpenAICompatibleLMProvider<OllamaConfig>` and overrides:

| Method | Purpose |
|--------|---------|
| `getAllModels()` | Fetches models from `/api/tags`, enriches with `/api/show`, returns `OpenAICompatibleLanguageModelChatInformation[]` |
| `getModelsBaseUrl()` | Returns `config.url ?? 'http://localhost:11434'` |
| `createOpenAIEndPoint()` | Builds `OpenAIEndpoint` with URL `{baseUrl}/v1/chat/completions` and empty API key |

### Model Cache

A per-instance `_modelCache` caches `IChatModelInformation` per `{baseUrl}/{modelId}` to avoid repeated `/api/show` calls when listing models.

### Version Check

Before listing models, the provider calls `/api/version` and enforces `MINIMUM_OLLAMA_VERSION = '0.6.4'`. Older versions receive a clear upgrade message.

---

## Class Hierarchy

```
LanguageModelChatProvider (VS Code API)
        │
        ▼
AbstractLanguageModelChatProvider
  - provideLanguageModelChatInformation()
  - provideLanguageModelChatResponse() [abstract]
  - provideTokenCount() [abstract]
  - getAllModels() [abstract]
        │
        ▼
AbstractOpenAICompatibleLMProvider
  - Uses CopilotLanguageModelWrapper for chat responses
  - Delegates to OpenAIEndpoint
  - Default getModelsFromEndpoint() uses /models (Ollama overrides this)
        │
        ▼
OllamaLMProvider
  - Overrides getAllModels (uses /api/tags, /api/show)
  - Overrides createOpenAIEndPoint (uses /v1/chat/completions)
  - No API key; BYOKAuthType.None
```

---

## BYOK Integration

### Registration Flow

1. User signs into GitHub Copilot.
2. `authService.onDidAuthenticationChange` fires.
3. `BYOKContrib._authChange()` checks `authService.copilotToken && isBYOKEnabled()`.
4. If true, it creates `OllamaLMProvider` and registers it:

   ```typescript
   this._providers.set('ollama', instantiationService.createInstance(OllamaLMProvider, this._byokStorageService));
   this._store.add(lm.registerLanguageModelChatProvider('ollama', provider));
   ```

### Auth Type

Ollama uses `BYOKAuthType.None` (no API key). The `createOpenAIEndPoint` call passes an empty string for the API key:

```typescript
return this._instantiationService.createInstance(OpenAIEndpoint, modelInfo, model.configuration?.apiKey ?? '', url);
```

`OpenAIEndpoint.getExtraHeaders()` still sets `Authorization: Bearer ` when the key is empty; Ollama ignores this.

---

## Ollama API Integration

### Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/version` | GET | Version check (minimum 0.6.4) |
| `/api/tags` | GET | List available models |
| `/api/show` | POST | Model details (context length, vision, tool calling) |
| `/v1/chat/completions` | POST | Chat completions (OpenAI-compatible) |

### Request Flow for Model Discovery

1. `getAllModels()` is called.
2. `_checkOllamaVersion(baseUrl)` → GET `/api/version`.
3. GET `/api/tags` → `{ models: [{ model, ... }, ...] }`.
4. For each model: `_getOllamaModelInfo(baseUrl, model.model)` → POST `/api/show` with `{ model: modelId }`.
5. Parse `OllamaModelInfoAPIResponse` for:
   - `model_info['general.architecture']` → context length key
   - `model_info['general.basename']` or `remote_model` → display name
   - `capabilities` array → `vision`, `tools`

### Chat Request Format

Chat requests use the standard OpenAI Chat Completions format. The `OpenAIEndpoint` sends:

- `POST {baseUrl}/v1/chat/completions`
- Headers: `Content-Type: application/json`, `Authorization: Bearer ` (empty)
- Body: messages, model, stream, tools, etc.

---

## Request Flow

End-to-end flow from user message to Ollama response:

1. User selects an Ollama model in the picker and sends a message.
2. Copilot routes to `ExtensionContributedChatEndpoint` (non-copilot vendor).
3. VS Code invokes `OllamaLMProvider.provideLanguageModelChatResponse()`.
4. Provider calls `createOpenAIEndPoint(model)` → `OpenAIEndpoint` with `/v1/chat/completions` URL.
5. Provider delegates to `CopilotLanguageModelWrapper.provideLanguageModelResponse()`.
6. Wrapper calls `endpoint.makeChatRequest()` (or `makeChatRequest2`).
7. `IChatMLFetcher` performs the HTTP POST to Ollama.
8. Ollama streams the response; wrapper converts to `LanguageModelResponsePart2` and reports via `Progress`.
9. Tool calls, if any, are handled by the Tool Calling Loop and subsequent rounds.

---

## Capability Detection

Capabilities are derived from `/api/show`:

| Ollama Field | Mapping |
|--------------|---------|
| `capabilities` includes `'vision'` | `vision: true` |
| `capabilities` includes `'tools'` | `toolCalling: true` |
| `model_info['{arch}.context_length']` | `maxInputTokens`, `maxOutputTokens` |
| `model_info['general.basename']` or `remote_model` | Display name |

Defaults when metadata is missing:

- Context window: 32768
- Output tokens: `min(4096, contextWindow/2)` when context < 4096, else 4096

---

## Tool Calling

Ollama models use the same tool-calling plumbing as other BYOK providers. Tools are converted to OpenAI function format and sent in the chat request body to `/v1/chat/completions`. Whether a given model receives tools depends on (a) its reported capabilities and (b) model-family-based tool allowlists.

### How Tool Calling Works

1. **Request flow**: `getAgentTools()` in `agentIntent.ts` determines which tools to pass for a given endpoint.
2. **Tool conversion**: `CopilotLanguageModelWrapper` maps tools to `OpenAiFunctionTool` format before the request.
3. **Capability gating**: If `supportsToolCalls` is false, the request body’s `tools` field is stripped in `ChatEndpoint.interceptBody()`.

### Tool Capability from Ollama

The provider sets `toolCalling` from the `/api/show` response:

```typescript
// ollamaProvider.ts - _getOllamaModelInfo
toolCalling: modelInfo.capabilities.includes('tools')
```

Models that report `'tools'` in their capabilities get `supportsToolCalls: true` and receive tools. Models without tool support do not get tools in the request.

### Tools Ollama Does NOT Get

Some tools are restricted by model family (GPT or Anthropic):

| Tool | Restriction |
|------|-------------|
| **SearchSubagent** | GPT and Anthropic only |
| **ExecutionSubagent** | GPT and Anthropic only |
| **Custom tool search** | Anthropic only |

These checks live in `getAgentTools()` via `isGptFamily(model)` and `isAnthropicFamily(model)`. Ollama models (e.g., `llama3`, `codellama`, `mistral`) do not match, so these tools are disabled.

### Edit Tool Selection

Ollama does not have hardcoded edit-tool preferences like GPT or Anthropic. Instead, it uses the **Edit Tool Learning Service** for extension-contributed models:

- No `supportedEditTools` / `editToolsHint` from the provider.
- No hardcoded family match (GPT/Sonnet/etc.).
- Falls back to learning data → starts in **Initial** state → `[EditFile, ReplaceString]`.

Cloud models get family-specific edit tools:

- **GPT**: `ApplyPatch` (and sometimes `ReplaceString` / `MultiReplaceString`).
- **Anthropic**: `ReplaceString`, `MultiReplaceString`.
- **Gemini**: `ReplaceString` (and `MultiReplaceString` for Gemini 3).

Ollama does not get `ApplyPatch` or `MultiReplaceString` initially; the learning system may adjust the edit tool set over time based on success/failure.

### Tools Ollama Does Get

- **EditFile**, **ReplaceString** (via edit tool learning).
- **CoreRunTest**, **CoreRunTask** (based on workspace tests/tasks).
- **CoreManageTodoList** (allowed; disabled only for grok-code).
- **task_complete** (when in autopilot mode).
- Other built-in tools (read file, list directory, grep, etc.) that pass `getEnabledTools()`.

### Summary

| Aspect | Ollama | Cloud (GPT, Anthropic) |
|--------|--------|------------------------|
| Tool-calling mechanism | Same (OpenAI format → `/v1/chat/completions`) | Same |
| Tool support detection | `capabilities.includes('tools')` from `/api/show` | Model metadata |
| Edit tools | `EditFile` + `ReplaceString` (learning-based) | Family-specific (`ApplyPatch`, `ReplaceString`, `MultiReplaceString`) |
| SearchSubagent | No | Yes (GPT/Anthropic) |
| ExecutionSubagent | No | Yes (GPT/Anthropic) |
| Custom tool search | No | Yes (Anthropic) |
| Core tools (run test, run task, etc.) | Yes | Yes |

### Related Files

| File | Role |
|------|------|
| `src/extension/intents/node/agentIntent.ts` | `getAgentTools()` — tool allowlist by model family |
| `src/extension/tools/common/editToolLearningService.ts` | Edit tool selection for BYOK models |
| `src/extension/tools/common/editToolLearningStates.ts` | Initial state: `[EditFile, ReplaceString]` |
| `src/platform/endpoint/common/chatModelCapabilities.ts` | `modelSupportsReplaceString`, `modelSupportsApplyPatch`, etc. |
| `src/platform/endpoint/node/chatEndpoint.ts` | Strips `tools` from body when `!supportsToolCalls` |

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No config | `getAllModels()` returns `[]` |
| Version &lt; 0.6.4 | Throws with upgrade instructions |
| Version check fails | Throws: "Unable to verify Ollama server version..." |
| `/api/tags` fails | Throws: "Failed to fetch models from Ollama. Please ensure Ollama is running..." |
| Remote host | User sets `url` to e.g. `http://host:11434` |

---

## Telemetry and Monitoring

Ollama requests are instrumented like other OpenAI-compatible BYOK providers:

| File | Instrumentation |
|------|-----------------|
| `src/extension/prompt/node/chatMLFetcher.ts` | `chat` spans per LLM call via `CopilotLanguageModelWrapper` → `endpoint.makeChatRequest` |

Fetcher calls use `callSite` for attribution:

- `ollama-tags` — model listing
- `ollama-show` — model info
- `ollama-version` — version check

---

## Differences from Other BYOK Providers

| Aspect | Ollama | OpenAI / Anthropic / etc. |
|--------|--------|----------------------------|
| Auth | None | API key required |
| Model discovery | `/api/tags` + `/api/show` | `/models` or similar |
| Chat endpoint | `/v1/chat/completions` | Varies (OpenAI, Anthropic SDK, etc.) |
| Known models | Fetched from server | CDN or static list |
| Network | Local (typically) | Cloud |

### Comparison with MLX Provider

The implementation plan cites Ollama as a blueprint for the MLX provider:

- Both use `BYOKAuthType.None`.
- Both use `OpenAIEndpoint` with empty API key.
- MLX uses a Python server and dynamic port; Ollama uses a fixed default port.
- MLX can run in `github.copilot.localOnly` mode without a Copilot token; Ollama always requires BYOK (and thus a token).

---

## File Reference

| File | Role |
|------|------|
| `src/extension/byok/vscode-node/ollamaProvider.ts` | Ollama provider implementation |
| `src/extension/byok/vscode-node/byokContribution.ts` | Registers Ollama and other BYOK providers |
| `src/extension/byok/vscode-node/abstractLanguageModelChatProvider.ts` | Base class for OpenAI-compatible providers |
| `src/extension/byok/node/openAIEndpoint.ts` | HTTP client for OpenAI-compatible endpoints |
| `src/extension/byok/common/byokProvider.ts` | `BYOKAuthType`, `resolveModelInfo`, `isBYOKEnabled` |
| `src/extension/conversation/vscode-node/languageModelAccess.ts` | `CopilotLanguageModelWrapper` for chat requests |
| `src/platform/configuration/common/configurationService.ts` | `ConfigKey.Deprecated.OllamaEndpoint` |
| `package.json` | `languageModelChatProviders` vendor config |
| `docs/monitoring/agent_monitoring_arch.md` | Telemetry/instrumentation notes |

---

## Quick Reference: Adding or Modifying Ollama Support

1. **Change default URL**: Edit `getModelsBaseUrl()` and `package.json` default.
2. **Support new Ollama API**: Update `_fetchOllamaModelInformation()` or `getAllModels()`.
3. **Adjust minimum version**: Change `MINIMUM_OLLAMA_VERSION` in `ollamaProvider.ts`.
4. **Enable without Copilot token**: Would require changes to `BYOKContrib` and `isBYOKEnabled` (currently not supported for Ollama).
