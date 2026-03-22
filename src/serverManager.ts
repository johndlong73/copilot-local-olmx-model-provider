// SPDX-License-Identifier: Apache-2.0
/**
 * oMLX Server Manager
 * 
 * Manages oMLX server connection and model discovery.
 */

import * as vscode from 'vscode';
import { OMLXConfig, ServerHealth, ModelsResponse, AdminModelsResponse, UpdateModelSettingsRequest, ModelSettingsResponse, ModelSettings } from './types';

/**
 * oMLX Server Manager
 * 
 * Handles:
 * - Server health checks
 * - Model discovery
 * - Model load/unload
 * - Model settings management
 */
export class ServerManager {
  private readonly _config: OMLXConfig;
  private readonly _context: vscode.ExtensionContext;
  private _healthStatus: 'healthy' | 'unhealthy' | 'unknown' = 'unknown';
  private _models: vscode.EventEmitter<vscode.LanguageModelChatInformation[]> = new vscode.EventEmitter();
  private _healthChanged: vscode.EventEmitter<'healthy' | 'unhealthy' | 'unknown'> = new vscode.EventEmitter();

  constructor(context: vscode.ExtensionContext) {
    this._context = context;
    // Initialize config synchronously with default values
    this._config = {
      serverUrl: 'http://localhost:8000',
      apiKey: undefined,
    };
  }

  /**
   * Initialize configuration from VS Code settings
   */
  async initialize(): Promise<void> {
    const config = vscode.workspace.getConfiguration('omlx');
    const serverUrl = config.get<string>('serverUrl', 'http://localhost:8000');
    const apiKey = config.get<string>('apiKey', '');
    
    this._config.serverUrl = serverUrl.replace(/\/+$/, '');
    this._config.apiKey = apiKey.trim() || undefined;
    
    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration('omlx.serverUrl') || e.affectsConfiguration('omlx.apiKey')) {
        const newConfig = vscode.workspace.getConfiguration('omlx');
        this._config.serverUrl = newConfig.get<string>('serverUrl', 'http://localhost:8000').replace(/\/+$/, '');
        this._config.apiKey = newConfig.get<string>('apiKey', '').trim() || undefined;
      }
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): OMLXConfig {
    return this._config;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<OMLXConfig>): void {
    if (config.serverUrl) {
      this._config.serverUrl = config.serverUrl.replace(/\/+$/, '');
    }
    if (config.apiKey !== undefined) {
      this._config.apiKey = config.apiKey?.trim() || undefined;
    }
  }

  /**
   * Check server health
   * 
   * GET /v1/models (may require auth)
   */
  async checkHealth(): Promise<ServerHealth> {
    try {
      const response = await fetch(`${this._config.serverUrl}/v1/models`, {
        headers: this._getAuthHeaders(),
      });
      
      if (!response.ok) {
        let errorMessage = `Server returned ${response.status}: ${response.statusText}`;
        
        // Try to parse the error response for more details
        try {
          const data = await response.json() as { detail?: string };
          if (data.detail) {
            errorMessage = data.detail;
          }
        } catch (e) {
          // Ignore JSON parsing errors
        }
        
        this._healthStatus = 'unhealthy';
        this._healthChanged.fire(this._healthStatus);
        return {
          status: 'unhealthy',
          error: errorMessage,
        };
      }

      const data = await response.json() as ModelsResponse;
      
      this._healthStatus = 'healthy';
      this._healthChanged.fire(this._healthStatus);
      
      return {
        status: 'healthy',
        default_model: data.data[0]?.id,
        engine_pool: {
          model_count: data.data.length,
          loaded_count: 0, // Not available from /v1/models
          max_model_memory: null,
          current_model_memory: 0,
        },
      };
    } catch (e) {
      this._healthStatus = 'unhealthy';
      this._healthChanged.fire(this._healthStatus);
      
      return {
        status: 'unhealthy',
        error: `Failed to connect to server: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  /**
   * Determine model capabilities based on model_type and engine_type
   */
  private _determineCapabilities(modelType: string | undefined, engineType: string | undefined): {
    toolCalling: boolean;
    imageInput: boolean;
  } {
    // Default to no capabilities
    let toolCalling = false;
    let imageInput = false;

    // Check for tool calling capabilities
    const modelTypeLower = (modelType || '').toLowerCase();
    const engineTypeLower = (engineType || '').toLowerCase();

    // Known tool-capable model types
    const toolCapableModels = [
      'llama', 'mistral', 'qwen', 'gemma', 'phi', 'yi',
      'chat', 'instruct', 'tool', 'function'
    ];

    // Known vision/image-capable model types
    const imageCapableModels = [
      'vision', 'visual', 'llava', 'gpt-4v', 'gpt-4o', 'gemini',
      'image', 'img', 'dalle', 'stable-diffusion'
    ];

    // Check model_type for tool capabilities
    if (modelType) {
      // Check for tool-related keywords
      if (toolCapableModels.some(keyword => modelTypeLower.includes(keyword))) {
        toolCalling = true;
      }
      // Check for vision-related keywords
      if (imageCapableModels.some(keyword => modelTypeLower.includes(keyword))) {
        imageInput = true;
      }
    }

    // Check engine_type for additional clues
    if (engineType) {
      if (toolCapableModels.some(keyword => engineTypeLower.includes(keyword))) {
        toolCalling = true;
      }
      if (imageCapableModels.some(keyword => engineTypeLower.includes(keyword))) {
        imageInput = true;
      }
    }

    return { toolCalling, imageInput };
  }

  /**
   * Get token limits from model settings. Uses 240k/32k defaults for models that support large context.
   */
  private _getTokenLimits(settings: ModelSettings | undefined): { maxInputTokens: number; maxOutputTokens: number } {
    const maxContext = settings?.max_context_window ?? 245760; // 240k default for Qwen and similar models
    const maxTokens = settings?.max_tokens ?? 32768;
    // maxInputTokens is typically context window minus output tokens; cap output at 32k
    const maxOutputTokens = Math.min(maxTokens, 32768);
    const maxInputTokens = Math.max(maxContext - maxOutputTokens, 8192);
    return { maxInputTokens, maxOutputTokens };
  }

  /**
   * Infer capabilities from model ID when settings API is unavailable.
   * Many oMLX models (Qwen, Llama, etc.) support tool calling.
   */
  private _inferCapabilitiesFromModelId(modelId: string): { toolCalling: boolean; imageInput: boolean } {
    const idLower = modelId.toLowerCase();
    const toolCapablePatterns = ['qwen', 'llama', 'mistral', 'gemma', 'phi', 'yi', 'coder', 'instruct'];
    const visionPatterns = ['vision', 'llava', 'gpt-4v', 'gpt-4o'];
    return {
      toolCalling: toolCapablePatterns.some(p => idLower.includes(p)),
      imageInput: visionPatterns.some(p => idLower.includes(p)),
    };
  }

  /**
   * Map admin model to LanguageModelChatInformation
   */
  private _mapAdminModelToChatInfo(model: { id: string; model_type?: string; engine_type?: string; settings?: ModelSettings }): vscode.LanguageModelChatInformation {
    const capabilities = this._determineCapabilities(model.model_type, model.engine_type);
    const { maxInputTokens, maxOutputTokens } = this._getTokenLimits(model.settings);
    return {
      id: model.id,
      name: model.id,
      family: 'omlx',
      version: '1.0.0',
      maxInputTokens,
      maxOutputTokens,
      capabilities,
      isUserSelectable: true,
      category: { label: 'oMLX', order: 100 },
    };
  }

  /**
   * Get list of available models with capabilities
   *
   * Uses GET /admin/api/models which returns models with settings embedded.
   * Falls back to GET /v1/models with default token limits when admin API is unavailable.
   */
  async getModels(): Promise<vscode.LanguageModelChatInformation[]> {
    try {
      // Prefer admin API - returns models with settings in one call (GET /admin/api/models/{id}/settings does not exist)
      const adminResponse = await fetch(`${this._config.serverUrl}/admin/api/models`, {
        headers: this._getAuthHeaders(),
      });

      if (adminResponse.ok) {
        const adminData = await adminResponse.json() as AdminModelsResponse;
        return adminData.models.map((m) => this._mapAdminModelToChatInfo(m));
      }

      // Fallback: use /v1/models when admin API unavailable (e.g. 401, 503)
      const response = await fetch(`${this._config.serverUrl}/v1/models`, {
        headers: this._getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as ModelsResponse;
      return data.data.map((model) => {
        const fallbackCapabilities = this._inferCapabilitiesFromModelId(model.id);
        const { maxInputTokens, maxOutputTokens } = this._getTokenLimits(undefined);
        return {
          id: model.id,
          name: model.id,
          family: 'omlx',
          version: '1.0.0',
          maxInputTokens,
          maxOutputTokens,
          capabilities: fallbackCapabilities,
          isUserSelectable: true,
          category: { label: 'oMLX', order: 100 },
        };
      });
    } catch (e) {
      console.error('Failed to get models:', e);
      return [];
    }
  }

  /**
   * Get model details with capabilities
   *
   * Uses GET /admin/api/models to find the model with settings (GET /admin/api/models/{id}/settings does not exist).
   * Falls back to GET /v1/models/{id} with default token limits when admin API is unavailable.
   */
  async getModelDetails(modelId: string): Promise<vscode.LanguageModelChatInformation | null> {
    try {
      // Prefer admin API - returns models with settings
      const adminResponse = await fetch(`${this._config.serverUrl}/admin/api/models`, {
        headers: this._getAuthHeaders(),
      });

      if (adminResponse.ok) {
        const adminData = await adminResponse.json() as AdminModelsResponse;
        const adminModel = adminData.models.find((m) => m.id === modelId);
        if (adminModel) {
          return this._mapAdminModelToChatInfo(adminModel);
        }
        return null;
      }

      // Fallback: use /v1/models/{id} when admin API unavailable
      const response = await fetch(`${this._config.serverUrl}/v1/models/${encodeURIComponent(modelId)}`, {
        headers: this._getAuthHeaders(),
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as { id: string };
      const fallbackCapabilities = this._inferCapabilitiesFromModelId(data.id);
      const { maxInputTokens, maxOutputTokens } = this._getTokenLimits(undefined);
      return {
        id: data.id,
        name: data.id,
        family: 'omlx',
        version: '1.0.0',
        maxInputTokens,
        maxOutputTokens,
        capabilities: fallbackCapabilities,
        isUserSelectable: true,
        category: { label: 'oMLX', order: 100 },
      };
    } catch (e) {
      console.error(`Failed to get model details for ${modelId}:`, e);
      return null;
    }
  }

  /**
   * Load a model into memory
   */
  async loadModel(modelId: string): Promise<void> {
    try {
      const response = await fetch(
        `${this._config.serverUrl}/admin/api/models/${encodeURIComponent(modelId)}/load`,
        {
          method: 'POST',
          headers: this._getAuthHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }
    } catch (e) {
      console.error(`Failed to load model ${modelId}:`, e);
      throw e;
    }
  }

  /**
   * Unload a model from memory
   */
  async unloadModel(modelId: string): Promise<void> {
    try {
      const response = await fetch(
        `${this._config.serverUrl}/admin/api/models/${encodeURIComponent(modelId)}/unload`,
        {
          method: 'POST',
          headers: this._getAuthHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }
    } catch (e) {
      console.error(`Failed to unload model ${modelId}:`, e);
      throw e;
    }
  }

  /**
   * Get model settings
   */
  async getModelSettings(modelId: string): Promise<ModelSettingsResponse | null> {
    try {
      const response = await fetch(
        `${this._config.serverUrl}/admin/api/models/${encodeURIComponent(modelId)}/settings`,
        {
          headers: this._getAuthHeaders(),
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as ModelSettingsResponse;
      return data;
    } catch (e) {
      console.error(`Failed to get model settings for ${modelId}:`, e);
      return null;
    }
  }

  /**
   * Update model settings
   */
  async updateModelSettings(
    modelId: string,
    settings: UpdateModelSettingsRequest
  ): Promise<ModelSettingsResponse | null> {
    try {
      const response = await fetch(
        `${this._config.serverUrl}/admin/api/models/${encodeURIComponent(modelId)}/settings`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...this._getAuthHeaders(),
          },
          body: JSON.stringify(settings),
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as ModelSettingsResponse;
      return data;
    } catch (e) {
      console.error(`Failed to update model settings for ${modelId}:`, e);
      return null;
    }
  }

  /**
   * Get list of downloaded models with status
   */
  async getDownloadedModels(): Promise<AdminModelsResponse | null> {
    try {
      const response = await fetch(
        `${this._config.serverUrl}/admin/api/models`,
        {
          headers: this._getAuthHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as AdminModelsResponse;
      return data;
    } catch (e) {
      console.error('Failed to get downloaded models:', e);
      return null;
    }
  }

  /**
   * Get authentication headers
   */
  private _getAuthHeaders(): Record<string, string> {
    if (this._config.apiKey) {
      return { 'Authorization': `Bearer ${this._config.apiKey}` };
    }
    return {};
  }

  /**
   * Get health status event
   */
  get onHealthChanged(): vscode.Event<'healthy' | 'unhealthy' | 'unknown'> {
    return this._healthChanged.event;
  }

  /**
   * Get models event
   */
  get onModelsChanged(): vscode.Event<vscode.LanguageModelChatInformation[]> {
    return this._models.event;
  }

  /**
   * Check if server is healthy
   */
  isHealthy(): boolean {
    return this._healthStatus === 'healthy';
  }

  /**
   * Get health status
   */
  getHealthStatus(): 'healthy' | 'unhealthy' | 'unknown' {
    return this._healthStatus;
  }
}