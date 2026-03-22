// SPDX-License-Identifier: Apache-2.0
/**
 * Model Manager for oMLX
 * 
 * Manages downloaded models: load, unload, configure, delete.
 */

import * as vscode from 'vscode';
import { ServerManager } from './serverManager';
import { HFClient } from './hfClient';
import { OMLXAdminModel, UpdateModelSettingsRequest, DownloadTask } from './types';

/**
 * Model Manager for oMLX
 * 
 * Handles:
 * - Get downloaded models
 * - Load/unload models
 * - Configure model settings
 * - Delete models
 * - Download models from HuggingFace
 */
export class ModelManager {
  private readonly _serverManager: ServerManager;
  private readonly _hfClient: HFClient;

  constructor(serverManager: ServerManager, hfClient: HFClient) {
    this._serverManager = serverManager;
    this._hfClient = hfClient;
  }

  /**
   * Get list of downloaded models
   */
  async getDownloadedModels(): Promise<OMLXAdminModel[]> {
    const result = await this._serverManager.getDownloadedModels();
    return result?.models ?? [];
  }

  /**
   * Get model status
   */
  async getModelStatus(modelId: string): Promise<OMLXAdminModel | null> {
    const models = await this.getDownloadedModels();
    return models.find(m => m.id === modelId) || null;
  }

  /**
   * Load a model into memory
   */
  async loadModel(modelId: string): Promise<void> {
    await this._serverManager.loadModel(modelId);
  }

  /**
   * Unload a model from memory
   */
  async unloadModel(modelId: string): Promise<void> {
    await this._serverManager.unloadModel(modelId);
  }

  /**
   * Toggle model load state
   */
  async toggleModelLoad(modelId: string, load: boolean): Promise<void> {
    if (load) {
      await this.loadModel(modelId);
    } else {
      await this.unloadModel(modelId);
    }
  }

  /**
   * Configure model settings
   */
  async configureModel(
    modelId: string,
    settings: UpdateModelSettingsRequest
  ): Promise<boolean> {
    const result = await this._serverManager.updateModelSettings(modelId, settings);
    return result?.success || false;
  }

  /**
   * Delete a model from disk
   */
  async deleteModel(modelId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this._serverManager.getConfig().serverUrl}/admin/api/hf/models/${encodeURIComponent(modelId)}`,
        {
          method: 'DELETE',
          headers: this._serverManager['_getAuthHeaders'](),
        }
      );

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as { success: boolean };
      return data.success || false;
    } catch (e) {
      console.error(`Failed to delete model ${modelId}:`, e);
      return false;
    }
  }

  /**
   * Download a model from HuggingFace
   */
  async downloadModel(repoId: string, hfToken?: string): Promise<DownloadTask | null> {
    return await this._hfClient.downloadModel(repoId, hfToken);
  }

  /**
   * Cancel a download task
   */
  async cancelDownload(taskId: string): Promise<boolean> {
    return await this._hfClient.cancelDownload(taskId);
  }

  /**
   * Remove a download task
   */
  async removeDownload(taskId: string): Promise<boolean> {
    return await this._hfClient.removeDownload(taskId);
  }

  /**
   * Get all download tasks
   */
  async getDownloadTasks(): Promise<DownloadTask[]> {
    return await this._hfClient.getDownloadTasks();
  }

  /**
   * Get recommended models
   */
  async getRecommendedModels(): Promise<{ trending: any[]; popular: any[] }> {
    return await this._hfClient.getRecommendedModels();
  }

  /**
   * Search HuggingFace models
   */
  async searchModels(query: string, sort: string = 'trending', limit: number = 100): Promise<any[]> {
    return await this._hfClient.searchModels(query, sort, limit);
  }

  /**
   * Get model info from HuggingFace
   */
  async getModelInfo(repoId: string): Promise<any | null> {
    return await this._hfClient.getModelInfo(repoId);
  }
}