// SPDX-License-Identifier: Apache-2.0
/**
 * oMLX Chat Model Provider
 * 
 * Implements VS Code's LanguageModelChatProvider API for oMLX.
 */

import * as vscode from 'vscode';
import { ServerManager } from './serverManager';

/**
 * oMLX Chat Model Provider
 * 
 * Implements VS Code's LanguageModelChatProvider API to integrate
 * oMLX models into Copilot Chat.
 */
export class OMLXChatModelProvider implements vscode.LanguageModelChatProvider {
  private readonly _serverManager: ServerManager;
  private readonly _onDidChangeLanguageModelInformation = new vscode.EventEmitter<void>();
  private _models: vscode.LanguageModelChatInformation[] = [];

  readonly onDidChangeLanguageModelInformation = this._onDidChangeLanguageModelInformation.event;

  constructor(serverManager: ServerManager) {
    this._serverManager = serverManager;
    // Notify when server health changes so the model picker refreshes
    serverManager.onHealthChanged(() => {
      this._onDidChangeLanguageModelInformation.fire();
    });
  }

  /**
   * Prepare and provide available models for the model picker
   * This is called when the model picker opens to get the list of available models
   */
  public async prepareLanguageModelChatInformation(
    options: vscode.PrepareLanguageModelChatModelOptions,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelChatInformation[]> {
    // Apply configuration from Manage Models when provided
    const config = options?.configuration as { url?: string; apiKey?: string } | undefined;
    if (config) {
      if (config.url) {
        this._serverManager.updateConfig({ serverUrl: config.url });
      }
      if (config.apiKey !== undefined) {
        this._serverManager.updateConfig({ apiKey: config.apiKey || undefined });
      }
    }

    // Check server health first
    const health = await this._serverManager.checkHealth();
    
    console.log('[oMLX] Server health:', health.status);
    if (health.error) {
      console.log('[oMLX] Health error:', health.error);
    }
    
    if (health.status !== 'healthy') {
      console.warn('[oMLX] oMLX server is not healthy:', health.error);
      if (!options.silent) {
        let errorMessage = health.error 
          ? `oMLX server is not running or not healthy: ${health.error}`
          : 'oMLX server is not running or not healthy.';
        
        // Provide specific guidance for API key errors
        if (health.error && (health.error.toLowerCase().includes('api key') || health.error.toLowerCase().includes('invalid'))) {
          errorMessage = `oMLX API key is invalid or missing. Please configure a valid API key in the extension settings.`;
        }
        
        vscode.window.showErrorMessage(
          errorMessage,
          'Open Documentation'
        ).then(selection => {
          if (selection === 'Open Documentation') {
            vscode.env.openExternal(vscode.Uri.parse('https://github.com/jundot/omlx'));
          }
        });
      }
      return [];
    }

    // Get models from oMLX
    this._models = await this._serverManager.getModels();
    
    console.log('[oMLX] Models fetched:', this._models.length);
    this._models.forEach(m => console.log('[oMLX] Model:', m.id, 'capabilities:', m.capabilities));
    
    if (this._models.length === 0 && !options.silent) {
      vscode.window.showInformationMessage('No models available from oMLX server. The server might be running but no models are loaded.');
    }
    
    return this._models;
  }

  /**
   * Provide available models for the model picker (alias for prepareLanguageModelChatInformation)
   */
  public async provideLanguageModelChatInformation(
    options: vscode.PrepareLanguageModelChatModelOptions,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelChatInformation[]> {
    return this.prepareLanguageModelChatInformation(options, token);
  }

  /**
   * Handle chat requests
   */
  public async provideLanguageModelChatResponse(
    model: vscode.LanguageModelChatInformation,
    messages: Array<vscode.LanguageModelChatMessage>,
    options: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken
  ): Promise<void> {
    const serverUrl = this._serverManager.getConfig().serverUrl;
    
    // Convert VS Code messages to OpenAI format
    const openaiMessages = this._convertMessages(messages);
    
    // Build request body
    const requestBody: {
      model: string;
      messages: typeof openaiMessages;
      stream: boolean;
      temperature?: number;
      max_tokens?: number;
      tools?: Array<{
        type: string;
        function: {
          name: string;
          description?: string;
          parameters: unknown;
        };
      }>;
    } = {
      model: model.id,
      messages: openaiMessages,
      stream: true,
    };

    // Add temperature if specified
    if (options.modelOptions?.temperature !== undefined) {
      requestBody.temperature = options.modelOptions.temperature;
    }

    // Add max_tokens if specified
    if (options.modelOptions?.maxTokens !== undefined) {
      requestBody.max_tokens = options.modelOptions.maxTokens;
    }

    // Add tools if specified
    if (options.tools && options.tools.length > 0) {
      requestBody.tools = this._convertTools(options.tools);
    }

    try {
      const response = await fetch(`${serverUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this._serverManager.getConfig().apiKey 
            ? { 'Authorization': `Bearer ${this._serverManager.getConfig().apiKey}` } 
            : {}),
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      // Parse SSE stream
      await this._parseSSE(response, progress, token);
    } catch (e) {
      console.error('Failed to chat with oMLX:', e);
      throw e;
    }
  }

  /**
   * Provide token count
   */
  public async provideTokenCount(
    model: vscode.LanguageModelChatInformation,
    text: string | vscode.LanguageModelChatMessage,
    token: vscode.CancellationToken
  ): Promise<number> {
    // oMLX doesn't have a dedicated token counting endpoint
    // Use a simple heuristic: count tokens based on text length
    // A more accurate implementation would use the model's tokenizer
    
    if (typeof text === 'string') {
      // Rough estimate: ~4 characters per token for English text
      return Math.ceil(text.length / 4);
    }

    // For message objects, extract text content
    let textContent = '';
    if (typeof text.content === 'string') {
      textContent = text.content;
    } else if (Array.isArray(text.content)) {
      textContent = text.content
        .map((part: any) => typeof part === 'string' ? part : '')
        .join(' ');
    }

    return Math.ceil(textContent.length / 4);
  }

  /**
   * Convert VS Code messages to OpenAI format.
   * Properly handles tool calls and tool results to avoid '[object Object]' in responses.
   */
  private _convertMessages(
    messages: Array<vscode.LanguageModelChatMessage>
  ): Array<{ role: string; content?: string; tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>; tool_call_id?: string }> {
    const out: Array<{ role: string; content?: string; tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>; tool_call_id?: string }> = [];

    for (const msg of messages) {
      const role = msg.role === vscode.LanguageModelChatMessageRole.User ? 'user' : 'assistant';
      const content = msg.content ?? [];
      const contentArray = typeof content === 'string' ? [content] : content;

      const textParts: string[] = [];
      const toolCalls: Array<{ id: string; type: string; function: { name: string; arguments: string } }> = [];
      const toolResults: Array<{ callId: string; content: string }> = [];

      for (const part of contentArray) {
        if (typeof part === 'string') {
          textParts.push(part);
        } else if (part instanceof vscode.LanguageModelTextPart) {
          textParts.push(part.value);
        } else if (this._isToolCallPart(part)) {
          const id = (part as { callId?: string }).callId ?? `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const name = (part as { name: string }).name;
          const input = (part as { input?: unknown }).input ?? {};
          toolCalls.push({
            id,
            type: 'function',
            function: { name, arguments: JSON.stringify(input) },
          });
        } else if (this._isToolResultPart(part)) {
          const callId = (part as { callId?: string }).callId ?? '';
          const textContent = this._collectToolResultText(part as { content?: ReadonlyArray<unknown> });
          toolResults.push({ callId, content: textContent });
        }
      }

      // Emit assistant message with tool calls if present
      if (toolCalls.length > 0) {
        out.push({
          role: 'assistant',
          content: textParts.join('') || undefined,
          tool_calls: toolCalls,
        });
      }

      // Emit tool result messages
      for (const tr of toolResults) {
        out.push({
          role: 'tool',
          content: tr.content,
          tool_call_id: tr.callId,
        });
      }

      // Emit regular text message (when no tool calls in this message - tool call content is already in assistant message)
      const text = textParts.join('');
      if (text && toolCalls.length === 0) {
        out.push({ role, content: text });
      }
    }

    return out;
  }

  private _isToolCallPart(part: unknown): boolean {
    if (!part || typeof part !== 'object') return false;
    const p = part as Record<string, unknown>;
    return typeof p.name === 'string' && 'input' in p;
  }

  private _isToolResultPart(part: unknown): boolean {
    if (!part || typeof part !== 'object') return false;
    const p = part as Record<string, unknown>;
    return typeof p.callId === 'string' && 'content' in p;
  }

  private _collectToolResultText(part: { content?: ReadonlyArray<unknown> }): string {
    let text = '';
    for (const c of part.content ?? []) {
      if (c instanceof vscode.LanguageModelTextPart) {
        text += c.value;
      } else if (typeof c === 'string') {
        text += c;
      } else if (c && typeof c === 'object') {
        try {
          text += JSON.stringify(c);
        } catch {
          // ignore
        }
      }
    }
    return text;
  }

  /**
   * Convert VS Code tools to OpenAI format
   */
  private _convertTools(
    tools: readonly vscode.LanguageModelChatTool[]
  ): Array<{
    type: string;
    function: {
      name: string;
      description?: string;
      parameters: unknown;
    };
  }> {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }

  /**
   * Parse SSE stream from oMLX
   */
  private async _parseSSE(
    response: Response,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken
  ): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (!token.isCancellationRequested) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (token.isCancellationRequested) {
          break;
        }

        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);
          
          if (data === '[DONE]') {
            return;
          }

          try {
            const chunk = JSON.parse(data);
            await this._processChunk(chunk, progress, token);
          } catch (e) {
            console.error('Failed to parse SSE chunk:', e);
          }
        }
      }
    }
  }

  /**
   * Process a single SSE chunk
   */
  private async _processChunk(
    chunk: unknown,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken
  ): Promise<void> {
    if (!chunk || typeof chunk !== 'object') {
      return;
    }

    const choices = (chunk as { choices?: unknown[] }).choices;
    if (!Array.isArray(choices) || choices.length === 0) {
      return;
    }

    for (const choice of choices) {
      if (!choice || typeof choice !== 'object') {
        continue;
      }

      const delta = (choice as { delta?: unknown }).delta;
      if (!delta || typeof delta !== 'object') {
        continue;
      }

      // Process content
      const content = (delta as { content?: string }).content;
      if (typeof content === 'string' && content.length > 0) {
        progress.report(new vscode.LanguageModelTextPart(content));
      }

      // Process tool calls
      const toolCalls = (delta as { tool_calls?: unknown[] }).tool_calls;
      if (Array.isArray(toolCalls)) {
        for (const toolCall of toolCalls) {
          if (!toolCall || typeof toolCall !== 'object') {
            continue;
          }

          const id = (toolCall as { id?: string }).id;
          const name = (toolCall as { function?: { name?: string } }).function?.name;
          const argumentsStr = (toolCall as { function?: { arguments?: string } }).function?.arguments;

          if (id && name && typeof argumentsStr === 'string') {
            progress.report(new vscode.LanguageModelToolCallPart(id, name, JSON.parse(argumentsStr)));
          }
        }
      }
    }
  }
}