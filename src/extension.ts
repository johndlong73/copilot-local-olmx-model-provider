// SPDX-License-Identifier: Apache-2.0
/**
 * oMLX Copilot Chat Extension
 * 
 * Activates the extension and registers the oMLX chat model provider.
 */

import * as vscode from 'vscode';
import { OMLXChatModelProvider } from './provider';
import { ServerManager } from './serverManager';

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log('Activating oMLX Copilot Chat Extension...');

  // Create server manager
  const serverManager = new ServerManager(context);
  await serverManager.initialize();

  // Create chat model provider
  const provider = new OMLXChatModelProvider(serverManager);

  // Register the language model chat provider
  const providerDisposable = vscode.lm.registerLanguageModelChatProvider(
    'omlx',
    provider
  );

  // Register commands
  const manageCommand = vscode.commands.registerCommand('omlx.manage', async () => {
    // Open Copilot Chat view to show the model picker with all available providers
    // This allows users to select from all providers (Copilot, oMLX, etc.)
    try {
      await vscode.commands.executeCommand('copilot.chat.open');
      console.log('Copilot Chat opened');
    } catch (e) {
      console.error('Failed to open Copilot Chat:', e);
      // Fallback: show oMLX-specific picker if copilot.chat.open fails
      const models = await provider.provideLanguageModelChatInformation({ silent: false }, new vscode.CancellationTokenSource().token);
      
      if (models.length === 0) {
        const health = await serverManager.checkHealth();
        if (health.status !== 'healthy') {
          vscode.window.showErrorMessage(
            'oMLX server is not running. Please start oMLX first.',
            'Open Documentation'
          ).then(selection => {
            if (selection === 'Open Documentation') {
              vscode.env.openExternal(vscode.Uri.parse('https://github.com/jundot/omlx'));
            }
          });
        } else {
          vscode.window.showInformationMessage('No models available from oMLX server.');
        }
      } else {
        const modelIds = models.map(m => m.id);
        const selectedModel = await vscode.window.showQuickPick(modelIds, {
          placeHolder: 'Select a model from oMLX',
        });
        
        if (selectedModel) {
          vscode.window.showInformationMessage(`Selected model: ${selectedModel}`);
        }
      }
    }
  });

  const checkHealthCommand = vscode.commands.registerCommand('omlx.checkHealth', async () => {
    const health = await serverManager.checkHealth();
    
    if (health.status === 'healthy') {
      vscode.window.showInformationMessage(
        `oMLX server is running. Models available: ${health.engine_pool?.model_count || 0}`
      );
    } else {
      let errorMessage = health.error ? `oMLX server is not running: ${health.error}` : 'oMLX server is not running.';
      let actionLabel = 'Open Documentation';
      
      // Provide specific guidance for API key errors
      if (health.error && (health.error.toLowerCase().includes('api key') || health.error.toLowerCase().includes('invalid'))) {
        errorMessage = `oMLX API key is invalid. Please configure a valid API key in the extension settings, or start oMLX without API key authentication.`;
        actionLabel = 'Open Settings';
      }
      
      vscode.window.showErrorMessage(
        errorMessage,
        actionLabel
      ).then(selection => {
        if (selection === actionLabel) {
          if (actionLabel === 'Open Settings') {
            vscode.commands.executeCommand('workbench.action.openSettings', 'omlx');
          } else {
            vscode.env.openExternal(vscode.Uri.parse('https://github.com/jundot/omlx'));
          }
        }
      });
    }
  });

  // Add disposables to context
  context.subscriptions.push(providerDisposable);
  context.subscriptions.push(manageCommand);
  context.subscriptions.push(checkHealthCommand);

  console.log('oMLX Copilot Chat Extension activated successfully.');
}

/**
 * Extension deactivation
 */
export function deactivate() {
  console.log('Deactivating oMLX Copilot Chat Extension...');
}