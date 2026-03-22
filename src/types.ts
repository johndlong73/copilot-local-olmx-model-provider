// SPDX-License-Identifier: Apache-2.0
/**
 * Shared TypeScript types for oMLX Copilot Chat Extension
 */

/**
 * oMLX server configuration
 */
export interface OMLXConfig {
  serverUrl: string;
  apiKey?: string;
}

/**
 * Model information from oMLX /v1/models endpoint
 */
export interface OMLXModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

/**
 * Model information from oMLX /admin/api/models endpoint
 */
export interface OMLXAdminModel {
  id: string;
  loaded: boolean;
  is_loading: boolean;
  estimated_size: number;
  estimated_size_formatted: string;
  pinned: boolean;
  is_default: boolean;
  engine_type: string;
  model_type: string;
  config_model_type: string;
  last_access: string | null;
  settings?: ModelSettings;
}

/**
 * Model settings from oMLX admin API
 */
export interface ModelSettings {
  model_alias?: string;
  model_type_override?: string;
  max_context_window?: number;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  repetition_penalty?: number;
  min_p?: number;
  presence_penalty?: number;
  force_sampling?: boolean;
  max_tool_result_tokens?: number;
  chat_template_kwargs?: Record<string, unknown>;
  forced_ct_kwargs?: string[];
  ttl_seconds?: number;
  is_pinned?: boolean;
  is_default?: boolean;
  display_name?: string;
  description?: string;
}

/**
 * Server health status
 */
export interface ServerHealth {
  status: 'healthy' | 'unhealthy' | 'unknown';
  default_model?: string;
  engine_pool?: {
    model_count: number;
    loaded_count: number;
    max_model_memory: number | null;
    current_model_memory: number;
  };
  error?: string;
}

/**
 * Response from oMLX /v1/models endpoint
 */
export interface ModelsResponse {
  object: string;
  data: OMLXModel[];
}

/**
 * Response from oMLX /admin/api/models endpoint
 */
export interface AdminModelsResponse {
  models: OMLXAdminModel[];
}

/**
 * Response from oMLX /admin/api/models/{model_id}/settings endpoint
 */
export interface ModelSettingsResponse {
  success: boolean;
  model_id: string;
  settings: ModelSettings;
  model_type: string;
  engine_type: string;
  requires_reload: boolean;
}

/**
 * Response from oMLX /admin/api/global-settings endpoint
 */
export interface GlobalSettingsResponse {
  base_path: string;
  server: {
    host: string;
    port: number;
    log_level: string;
  };
  model: {
    model_dirs: string[];
    model_dir: string;
    max_model_memory: string;
  };
  memory: {
    max_process_memory: string;
  };
  scheduler: {
    max_num_seqs: number;
    completion_batch_size: number;
  };
  cache: {
    enabled: boolean;
    ssd_cache_dir: string;
    ssd_cache_max_size: string;
    hot_cache_max_size: string;
    initial_cache_blocks: number;
  };
  mcp: {
    config_path: string | null;
  };
  huggingface: {
    endpoint: string | null;
  };
  sampling: {
    max_context_window: number;
    max_tokens: number;
    temperature: number;
    top_p: number;
    top_k: number;
    repetition_penalty: number;
  };
  auth: {
    api_key_set: boolean;
    api_key: string;
    skip_api_key_verification: boolean;
  };
  claude_code: {
    context_scaling_enabled: boolean;
    target_context_size: number;
    mode: string;
    opus_model: string;
    sonnet_model: string;
    haiku_model: string;
  };
  system: {
    total_memory_bytes: number;
    total_memory: string;
    auto_model_memory: string;
    ssd_total_bytes: number;
    ssd_total: string;
    ssd_free_bytes: number;
    ssd_free: string;
  };
  ui: {
    language: string;
  };
}

/**
 * Request body for updating model settings
 */
export interface UpdateModelSettingsRequest {
  model_alias?: string;
  model_type_override?: string;
  max_context_window?: number;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  repetition_penalty?: number;
  min_p?: number;
  presence_penalty?: number;
  force_sampling?: boolean;
  max_tool_result_tokens?: number;
  chat_template_kwargs?: Record<string, unknown>;
  forced_ct_kwargs?: string[];
  ttl_seconds?: number;
  is_pinned?: boolean;
  is_default?: boolean;
}

/**
 * Request body for updating global settings
 */
export interface UpdateGlobalSettingsRequest {
  server?: {
    host?: string;
    port?: number;
    log_level?: string;
  };
  model?: {
    model_dirs?: string[];
    model_dir?: string;
    max_model_memory?: string;
  };
  memory?: {
    max_process_memory?: string;
  };
  scheduler?: {
    max_num_seqs?: number;
    completion_batch_size?: number;
  };
  cache?: {
    enabled?: boolean;
    ssd_cache_dir?: string;
    ssd_cache_max_size?: string;
    hot_cache_max_size?: string;
    initial_cache_blocks?: number;
  };
  mcp?: {
    config_path?: string;
  };
  huggingface?: {
    endpoint?: string;
  };
  sampling?: {
    max_context_window?: number;
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
    top_k?: number;
    repetition_penalty?: number;
  };
  claude_code?: {
    context_scaling_enabled?: boolean;
    target_context_size?: number;
    mode?: string;
    opus_model?: string;
    sonnet_model?: string;
    haiku_model?: string;
  };
  ui?: {
    language?: string;
  };
  auth?: {
    api_key?: string;
    skip_api_key_verification?: boolean;
  };
}