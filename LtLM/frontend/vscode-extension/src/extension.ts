import * as vscode from 'vscode';
import { LicenseVaultProvider } from './providers/LicenseVaultProvider';
import { LicenseVaultService } from './services/LicenseVaultService';
import { CommandHandler } from './commands/CommandHandler';

let licenseVaultProvider: LicenseVaultProvider;
let licenseVaultService: LicenseVaultService;

export function activate(context: vscode.ExtensionContext) {
  console.log('LicenseVault extension is now active!');

  // Initialize service
  licenseVaultService = new LicenseVaultService(context);

  // Initialize provider
  licenseVaultProvider = new LicenseVaultProvider(licenseVaultService);

  // Register tree data provider
  vscode.window.registerTreeDataProvider('licensevault.explorer', licenseVaultProvider);

  // Register commands
  const commandHandler = new CommandHandler(licenseVaultService, licenseVaultProvider);
  commandHandler.registerCommands(context);

  // Auto-refresh on startup if enabled
  const config = vscode.workspace.getConfiguration('licensevault');
  if (config.get('autoRefresh', true)) {
    setTimeout(() => {
      licenseVaultProvider.refresh();
    }, 1000);
  }

  // Register configuration change listener
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('licensevault')) {
        licenseVaultProvider.refresh();
      }
    })
  );
}

export function deactivate() {
  console.log('LicenseVault extension is now deactivated!');
}