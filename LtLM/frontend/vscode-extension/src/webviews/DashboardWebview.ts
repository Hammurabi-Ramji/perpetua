import * as vscode from 'vscode';
import { LicenseVaultService } from '../services/LicenseVaultService';
import { License } from '../providers/LicenseItem';

export class DashboardWebview {
  public static currentPanel: DashboardWebview | undefined;
  public static readonly viewType = 'licensevault.dashboard';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, private licenseVaultService: LicenseVaultService) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case 'refresh':
            await this.refresh();
            break;
          case 'addLicense':
            await this.handleAddLicense(message.data);
            break;
          case 'editLicense':
            await this.handleEditLicense(message.data);
            break;
          case 'deleteLicense':
            await this.handleDeleteLicense(message.id);
            break;
          case 'copyLicenseKey':
            await vscode.env.clipboard.writeText(message.key);
            vscode.window.showInformationMessage('License key copied to clipboard');
            break;
        }
      },
      null,
      this._disposables
    );

    this.refresh();
  }

  public static createOrShow(extensionUri: vscode.Uri, licenseVaultService: LicenseVaultService) {
    const column = vscode.window.activeTextEditor
      ? vscode.ViewColumn.Beside
      : undefined;

    if (DashboardWebview.currentPanel) {
      DashboardWebview.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      DashboardWebview.viewType,
      'LicenseVault Dashboard',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
      }
    );

    DashboardWebview.currentPanel = new DashboardWebview(panel, extensionUri, licenseVaultService);
  }

  private async refresh() {
    try {
      const licenses = await this.licenseVaultService.getLicenses();
      const stats = await this.licenseVaultService.getLicenseStats();

      this._panel.webview.html = this._getHtmlForWebview({
        licenses,
        stats,
        isLoggedIn: this.licenseVaultService.isLoggedIn()
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this._panel.webview.html = this._getHtmlForWebview({
        licenses: [],
        stats: { active: 0, expired: 0, expiringSoon: 0 },
        isLoggedIn: false,
        error: message
      });
    }
  }

  private async handleAddLicense(data: any) {
    try {
      await this.licenseVaultService.addLicense(data);
      await this.refresh();
      this._panel.webview.postMessage({ type: 'success', message: 'License added successfully' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this._panel.webview.postMessage({ type: 'error', message });
    }
  }

  private async handleEditLicense(data: any) {
    try {
      await this.licenseVaultService.updateLicense(data.id, data);
      await this.refresh();
      this._panel.webview.postMessage({ type: 'success', message: 'License updated successfully' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this._panel.webview.postMessage({ type: 'error', message });
    }
  }

  private async handleDeleteLicense(id: string) {
    try {
      await this.licenseVaultService.deleteLicense(id);
      await this.refresh();
      this._panel.webview.postMessage({ type: 'success', message: 'License deleted successfully' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this._panel.webview.postMessage({ type: 'error', message });
    }
  }

  private _getHtmlForWebview(data: any): string {
    const nonce = getNonce();

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this._panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
        <title>LicenseVault Dashboard</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            margin: 0;
            padding: 20px;
          }

          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
          }

          .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
          }

          .stat-card {
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 16px;
            text-align: center;
          }

          .stat-number {
            font-size: 2em;
            font-weight: bold;
            color: var(--vscode-charts-green);
          }

          .stat-label {
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
          }

          .license-list {
            margin-bottom: 24px;
          }

          .license-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            margin-bottom: 8px;
          }

          .license-info h4 {
            margin: 0 0 4px 0;
            color: var(--vscode-editor-foreground);
          }

          .license-meta {
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
          }

          .license-actions {
            display: flex;
            gap: 8px;
          }

          .btn {
            padding: 6px 12px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.9em;
          }

          .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
          }

          .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
          }

          .btn-danger {
            background: var(--vscode-errorForeground);
            color: var(--vscode-editor-background);
          }

          .add-form {
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 16px;
            margin-bottom: 24px;
          }

          .form-row {
            display: flex;
            gap: 12px;
            margin-bottom: 12px;
          }

          .form-group {
            flex: 1;
          }

          .form-group label {
            display: block;
            margin-bottom: 4px;
            font-weight: 500;
          }

          .form-group input {
            width: 100%;
            padding: 6px 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
          }

          .message {
            padding: 8px 12px;
            border-radius: 4px;
            margin-bottom: 12px;
          }

          .message.success {
            background: var(--vscode-notificationsInfoIcon-foreground);
            color: var(--vscode-editor-background);
          }

          .message.error {
            background: var(--vscode-errorForeground);
            color: var(--vscode-editor-background);
          }

          .login-prompt {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>LicenseVault Dashboard</h2>
          <button class="btn btn-primary" onclick="refresh()">Refresh</button>
        </div>

        ${!data.isLoggedIn ? `
          <div class="login-prompt">
            <h3>Not logged in</h3>
            <p>Please use the LicenseVault: Login command to authenticate</p>
          </div>
        ` : `
          <div id="message"></div>

          <div class="stats">
            <div class="stat-card">
              <div class="stat-number">${data.stats.active}</div>
              <div class="stat-label">Active Licenses</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${data.stats.expiringSoon}</div>
              <div class="stat-label">Expiring Soon</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${data.stats.expired}</div>
              <div class="stat-label">Expired Licenses</div>
            </div>
          </div>

          <div class="add-form">
            <h3>Add New License</h3>
            <div class="form-row">
              <div class="form-group">
                <label for="productName">Product Name</label>
                <input type="text" id="productName" placeholder="Product Name">
              </div>
              <div class="form-group">
                <label for="licenseKey">License Key</label>
                <input type="text" id="licenseKey" placeholder="XXXX-XXXX-XXXX-XXXX">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="expiryDate">Expiry Date (optional)</label>
                <input type="date" id="expiryDate">
              </div>
              <div class="form-group">
                <label>&nbsp;</label>
                <button class="btn btn-primary" onclick="addLicense()">Add License</button>
              </div>
            </div>
          </div>

          <div class="license-list">
            <h3>Your Licenses (${data.licenses.length})</h3>
            ${data.licenses.map((license: License) => `
              <div class="license-item">
                <div class="license-info">
                  <h4>${license.productName}</h4>
                  <div class="license-meta">
                    Key: ${license.licenseKey.substring(0, 16)}... |
                    Expires: ${license.expiryDate ? new Date(license.expiryDate).toLocaleDateString() : 'Never'} |
                    Source: ${license.source}
                  </div>
                </div>
                <div class="license-actions">
                  <button class="btn btn-secondary" onclick="copyKey('${license.licenseKey}')">Copy</button>
                  <button class="btn btn-secondary" onclick="editLicense('${license.id}', '${license.productName}', '${license.licenseKey}', '${license.expiryDate || ''}')">Edit</button>
                  <button class="btn btn-danger" onclick="deleteLicense('${license.id}')">Delete</button>
                </div>
              </div>
            `).join('')}
          </div>
        `}

        <script nonce="${nonce}">
          const vscode = acquireVsCodeApi();

          function refresh() {
            vscode.postMessage({ type: 'refresh' });
          }

          function addLicense() {
            const data = {
              productName: document.getElementById('productName').value,
              licenseKey: document.getElementById('licenseKey').value,
              expiryDate: document.getElementById('expiryDate').value || undefined,
              source: 'manual'
            };

            if (!data.productName || !data.licenseKey) {
              showMessage('Please fill in product name and license key', 'error');
              return;
            }

            vscode.postMessage({ type: 'addLicense', data });
          }

          function editLicense(id, productName, licenseKey, expiryDate) {
            const newProductName = prompt('Edit product name:', productName);
            if (!newProductName) return;

            const newLicenseKey = prompt('Edit license key:', licenseKey);
            if (!newLicenseKey) return;

            const newExpiryDate = prompt('Edit expiry date (YYYY-MM-DD):', expiryDate);

            vscode.postMessage({
              type: 'editLicense',
              data: {
                id,
                productName: newProductName,
                licenseKey: newLicenseKey,
                expiryDate: newExpiryDate || undefined
              }
            });
          }

          function deleteLicense(id) {
            if (confirm('Are you sure you want to delete this license?')) {
              vscode.postMessage({ type: 'deleteLicense', id });
            }
          }

          function copyKey(key) {
            vscode.postMessage({ type: 'copyLicenseKey', key });
          }

          function showMessage(text, type) {
            const messageEl = document.getElementById('message');
            messageEl.innerHTML = \`<div class="message \${type}">\${text}</div>\`;
            setTimeout(() => messageEl.innerHTML = '', 3000);
          }

          window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'success' || message.type === 'error') {
              showMessage(message.message, message.type);
            }
          });
        </script>
      </body>
      </html>`;
  }

  public dispose() {
    DashboardWebview.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}