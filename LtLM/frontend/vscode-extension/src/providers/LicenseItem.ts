import * as vscode from 'vscode';

export interface License {
  id: string;
  productName: string;
  licenseKey: string;
  expiryDate?: string;
  status: 'active' | 'expired' | 'expiringSoon';
  source: string;
  createdAt: string;
  updatedAt: string;
}

export class LicenseItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly tooltip?: string,
    public readonly collapsibleState?: vscode.TreeItemCollapsibleState,
    public readonly contextValue?: string,
    public readonly license?: License
  ) {
    super(label, collapsibleState);

    this.tooltip = tooltip;
    this.contextValue = contextValue;

    // Set icon based on context
    if (contextValue === 'activeLicenses' || contextValue === 'licenseItem') {
      this.iconPath = new vscode.ThemeIcon('key');
    } else if (contextValue === 'expiredLicenses') {
      this.iconPath = new vscode.ThemeIcon('warning');
    } else if (contextValue === 'expiringSoon') {
      this.iconPath = new vscode.ThemeIcon('clock');
    } else if (contextValue === 'loginRequired') {
      this.iconPath = new vscode.ThemeIcon('sign-in');
    }

    // Set command for license items
    if (contextValue === 'licenseItem' && license) {
      this.command = {
        command: 'licensevault.copyLicenseKey',
        title: 'Copy License Key',
        arguments: [license]
      };
    } else if (contextValue === 'loginRequired') {
      this.command = {
        command: 'licensevault.login',
        title: 'Login to LicenseVault'
      };
    }
  }
}