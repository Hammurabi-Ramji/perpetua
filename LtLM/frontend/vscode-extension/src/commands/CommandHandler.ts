import * as vscode from 'vscode';
import { LicenseVaultService } from '../services/LicenseVaultService';
import { LicenseVaultProvider } from '../providers/LicenseVaultProvider';
import { License } from '../providers/LicenseItem';
import { DashboardWebview } from '../webviews/DashboardWebview';

export class CommandHandler {
  constructor(
    private licenseVaultService: LicenseVaultService,
    private licenseVaultProvider: LicenseVaultProvider
  ) {}

  registerCommands(context: vscode.ExtensionContext) {
    // Login command
    const loginCmd = vscode.commands.registerCommand('licensevault.login', async () => {
      await this.handleLogin();
    });

    // Logout command
    const logoutCmd = vscode.commands.registerCommand('licensevault.logout', async () => {
      await this.licenseVaultService.logout();
      this.licenseVaultProvider.refresh();
      vscode.window.showInformationMessage('Logged out from LicenseVault');
    });

    // Refresh command
    const refreshCmd = vscode.commands.registerCommand('licensevault.refresh', () => {
      this.licenseVaultProvider.refresh();
    });

    // Open dashboard command
    const dashboardCmd = vscode.commands.registerCommand('licensevault.openDashboard', () => {
      DashboardWebview.createOrShow(context.extensionUri, this.licenseVaultService);
    });

    // Add license command
    const addLicenseCmd = vscode.commands.registerCommand('licensevault.addLicense', async () => {
      await this.handleAddLicense();
    });

    // Search licenses command
    const searchCmd = vscode.commands.registerCommand('licensevault.searchLicenses', async () => {
      await this.handleSearchLicenses();
    });

    // Copy license key command
    const copyKeyCmd = vscode.commands.registerCommand('licensevault.copyLicenseKey', async (license: License) => {
      await vscode.env.clipboard.writeText(license.licenseKey);
      vscode.window.showInformationMessage('License key copied to clipboard');
    });

    // Edit license command
    const editCmd = vscode.commands.registerCommand('licensevault.editLicense', async (license: License) => {
      await this.handleEditLicense(license);
    });

    // Delete license command
    const deleteCmd = vscode.commands.registerCommand('licensevault.deleteLicense', async (license: License) => {
      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to delete the license for "${license.productName}"?`,
        'Delete',
        'Cancel'
      );

      if (confirm === 'Delete') {
        try {
          await this.licenseVaultService.deleteLicense(license.id);
          this.licenseVaultProvider.refresh();
          vscode.window.showInformationMessage('License deleted successfully');
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage('Failed to delete license: ' + message);
        }
      }
    });

    // Register all commands
    context.subscriptions.push(
      loginCmd,
      logoutCmd,
      refreshCmd,
      dashboardCmd,
      addLicenseCmd,
      searchCmd,
      copyKeyCmd,
      editCmd,
      deleteCmd
    );
  }

  private async handleLogin(): Promise<void> {
    const email = await vscode.window.showInputBox({
      prompt: 'Enter your LicenseVault email',
      placeHolder: 'email@example.com'
    });

    if (!email) return;

    const password = await vscode.window.showInputBox({
      prompt: 'Enter your LicenseVault password',
      password: true
    });

    if (!password) return;

    try {
      const success = await this.licenseVaultService.login(email, password);
      if (success) {
        this.licenseVaultProvider.refresh();
        vscode.window.showInformationMessage('Successfully logged in to LicenseVault');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(message);
    }
  }

  private async handleAddLicense(): Promise<void> {
    const productName = await vscode.window.showInputBox({
      prompt: 'Enter product name',
      placeHolder: 'Product Name'
    });

    if (!productName) return;

    const licenseKey = await vscode.window.showInputBox({
      prompt: 'Enter license key',
      placeHolder: 'XXXX-XXXX-XXXX-XXXX'
    });

    if (!licenseKey) return;

    const expiryDate = await vscode.window.showInputBox({
      prompt: 'Enter expiry date (optional)',
      placeHolder: 'YYYY-MM-DD'
    });

    try {
      await this.licenseVaultService.addLicense({
        productName,
        licenseKey,
        expiryDate: expiryDate || undefined,
        source: 'manual'
      });

      this.licenseVaultProvider.refresh();
      vscode.window.showInformationMessage('License added successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage('Failed to add license: ' + message);
    }
  }

  private async handleEditLicense(license: License): Promise<void> {
    const productName = await vscode.window.showInputBox({
      prompt: 'Edit product name',
      value: license.productName
    });

    if (!productName) return;

    const licenseKey = await vscode.window.showInputBox({
      prompt: 'Edit license key',
      value: license.licenseKey
    });

    if (!licenseKey) return;

    const expiryDate = await vscode.window.showInputBox({
      prompt: 'Edit expiry date (optional)',
      value: license.expiryDate
    });

    try {
      await this.licenseVaultService.updateLicense(license.id, {
        productName,
        licenseKey,
        expiryDate: expiryDate || undefined
      });

      this.licenseVaultProvider.refresh();
      vscode.window.showInformationMessage('License updated successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage('Failed to update license: ' + message);
    }
  }

  private async handleSearchLicenses(): Promise<void> {
    const query = await vscode.window.showInputBox({
      prompt: 'Search licenses',
      placeHolder: 'Enter search term...'
    });

    if (!query) return;

    try {
      const results = await this.licenseVaultService.searchLicenses(query);

      if (results.length === 0) {
        vscode.window.showInformationMessage('No licenses found matching your search');
        return;
      }

      const items = results.map(license => ({
        label: license.productName,
        detail: `Key: ${license.licenseKey.substring(0, 16)}...`,
        license
      }));

      const selected = await vscode.window.showQuickPick(items, {
        matchOnDetail: true,
        placeHolder: `Found ${results.length} license(s)`
      });

      if (selected) {
        await vscode.env.clipboard.writeText(selected.license.licenseKey);
        vscode.window.showInformationMessage('License key copied to clipboard');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage('Search failed: ' + message);
    }
  }
}