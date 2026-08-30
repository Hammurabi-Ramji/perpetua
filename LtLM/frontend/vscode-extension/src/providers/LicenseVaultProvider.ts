import * as vscode from 'vscode';
import { LicenseVaultService } from '../services/LicenseVaultService';
import { LicenseItem } from './LicenseItem';

export class LicenseVaultProvider implements vscode.TreeDataProvider<LicenseItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<LicenseItem | undefined | null | void> = new vscode.EventEmitter<LicenseItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<LicenseItem | undefined | null | void> = this._onDidChangeTreeData.event;

  constructor(private licenseVaultService: LicenseVaultService) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: LicenseItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: LicenseItem): Promise<LicenseItem[]> {
    if (!element) {
      // Root level - show license categories
      return this.getRootItems();
    }

    // Child items based on parent
    switch (element.contextValue) {
      case 'activeLicenses':
        return this.getLicensesByStatus('active');
      case 'expiredLicenses':
        return this.getLicensesByStatus('expired');
      case 'expiringSoon':
        return this.getLicensesByStatus('expiringSoon');
      default:
        return [];
    }
  }

  private async getRootItems(): Promise<LicenseItem[]> {
    const items: LicenseItem[] = [];

    try {
      const licenses = await this.licenseVaultService.getLicenses();

      // Count licenses by status
      const activeCount = licenses.filter(l => l.status === 'active').length;
      const expiredCount = licenses.filter(l => l.status === 'expired').length;
      const expiringSoonCount = licenses.filter(l => l.status === 'expiringSoon').length;

      items.push(
        new LicenseItem('Active Licenses', `(${activeCount})`, vscode.TreeItemCollapsibleState.Collapsed, 'activeLicenses'),
        new LicenseItem('Expiring Soon', `(${expiringSoonCount})`, vscode.TreeItemCollapsibleState.Collapsed, 'expiringSoon'),
        new LicenseItem('Expired Licenses', `(${expiredCount})`, vscode.TreeItemCollapsibleState.Collapsed, 'expiredLicenses')
      );
    } catch (error) {
      items.push(new LicenseItem('Not logged in', 'Click to login', vscode.TreeItemCollapsibleState.None, 'loginRequired'));
    }

    return items;
  }

  private async getLicensesByStatus(status: string): Promise<LicenseItem[]> {
    try {
      const licenses = await this.licenseVaultService.getLicenses();
      const filteredLicenses = licenses.filter(l => l.status === status);

      return filteredLicenses.map(license =>
        new LicenseItem(
          `${license.productName} (${license.licenseKey.substring(0, 8)}...)`,
          `Expires: ${license.expiryDate ? new Date(license.expiryDate).toLocaleDateString() : 'Never'}`,
          vscode.TreeItemCollapsibleState.None,
          'licenseItem',
          license
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return [new LicenseItem('Error loading licenses', message, vscode.TreeItemCollapsibleState.None, 'error')];
    }
  }
}