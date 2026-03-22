// SPDX-License-Identifier: Apache-2.0
/**
 * HuggingFace Client for oMLX
 * 
 * Provides access to oMLX's HuggingFace integration via admin API.
 */

import * as vscode from 'vscode';
import { HFModel, HFModelInfo, DownloadTask, DownloadStatus, HFSearchResponse, HFRecommendedResponse, HFModelInfoResponse, DownloadRequest } from './types';

/**
 * HuggingFace Client for oMLX
 * 
 * Handles:
 * - Search HuggingFace models
 * - Get model info
 * - Download models
 * - Manage download tasks
 */
export class HFClient {
  private readonly _serverUrl: string;
  private readonly _apiKey?: string;

  constructor(serverUrl: string, apiKey?: string) {
    this._serverUrl = serverUrl.replace(/\/+$/, '');
    this._apiKey = apiKey?.trim();
  }

  /**
   * Search HuggingFace models by query
   */
  async searchModels(query: string, sort: string = 'trending', limit: number = 100): Promise<HFModel[]> {
    try {
      const response = await fetch(
        `${this._serverUrl}/admin/api/hf/search?q=${encodeURIComponent(query)}&sort=${encodeURIComponent(sort)}&limit=${limit}`,
        {
          headers: this._getAuthHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as HFSearchResponse;
      return data.models;
    } catch (e) {
      console.error('Failed to search models:', e);
      return [];
    }
  }

  /**
   * Get recommended models
   */
  async getRecommendedModels(): Promise<{ trending: HFModel[]; popular: HFModel[] }> {
    try {
      const response = await fetch(
        `${this._serverUrl}/admin/api/hf/recommended`,
        {
          headers: this._getAuthHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as { trending: HFModel[]; popular: HFModel[] };
      return data;
    } catch (e) {
      console.error('Failed to get recommended models:', e);
      return { trending: [], popular: [] };
    }
  }

  /**
   * Get detailed model info from HuggingFace
   */
  async getModelInfo(repoId: string): Promise<HFModelInfo | null> {
    try {
      const response = await fetch(
        `${this._serverUrl}/admin/api/hf/model-info?repo_id=${encodeURIComponent(repoId)}`,
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

      const data = await response.json() as HFModelInfo;
      return data;
    } catch (e) {
      console.error(`Failed to get model info for ${repoId}:`, e);
      return null;
    }
  }

  /**
   * Start downloading a model from HuggingFace
   */
  async downloadModel(repoId: string, hfToken?: string): Promise<DownloadTask | null> {
    try {
      const response = await fetch(
        `${this._serverUrl}/admin/api/hf/download`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this._getAuthHeaders(),
          },
          body: JSON.stringify({ repo_id: repoId, hf_token: hfToken || '' }),
        }
      );

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as { task: DownloadTask };
      return data.task;
    } catch (e) {
      console.error(`Failed to download model ${repoId}:`, e);
      return null;
    }
  }

  /**
   * Cancel a download task
   */
  async cancelDownload(taskId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this._serverUrl}/admin/api/hf/cancel/${encodeURIComponent(taskId)}`,
        {
          method: 'POST',
          headers: this._getAuthHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      return true;
    } catch (e) {
      console.error(`Failed to cancel download ${taskId}:`, e);
      return false;
    }
  }

  /**
   * Remove a download task (completed, failed, or cancelled)
   */
  async removeDownload(taskId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this._serverUrl}/admin/api/hf/task/${encodeURIComponent(taskId)}`,
        {
          method: 'DELETE',
          headers: this._getAuthHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      return true;
    } catch (e) {
      console.error(`Failed to remove download ${taskId}:`, e);
      return false;
    }
  }

  /**
   * Get all download tasks
   */
  async getDownloadTasks(): Promise<DownloadTask[]> {
    try {
      const response = await fetch(
        `${this._serverUrl}/admin/api/hf/tasks`,
        {
          headers: this._getAuthHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as { tasks: DownloadTask[] };
      return data.tasks;
    } catch (e) {
      console.error('Failed to get download tasks:', e);
      return [];
    }
  }

  /**
   * Get download task by ID
   */
  async getDownloadTask(taskId: string): Promise<DownloadTask | null> {
    const tasks = await this.getDownloadTasks();
    return tasks.find(t => t.task_id === taskId) || null;
  }

  /**
   * Get authentication headers
   */
  private _getAuthHeaders(): Record<string, string> {
    if (this._apiKey) {
      return { 'Authorization': `Bearer ${this._apiKey}` };
    }
    return {};
  }
}