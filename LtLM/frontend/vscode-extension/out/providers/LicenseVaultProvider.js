"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LicenseVaultProvider = void 0;
const vscode = __importStar(require("vscode"));
const LicenseItem_1 = require("./LicenseItem");
class LicenseVaultProvider {
    constructor(licenseVaultService) {
        this.licenseVaultService = licenseVaultService;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
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
    async getRootItems() {
        const items = [];
        try {
            const licenses = await this.licenseVaultService.getLicenses();
            // Count licenses by status
            const activeCount = licenses.filter(l => l.status === 'active').length;
            const expiredCount = licenses.filter(l => l.status === 'expired').length;
            const expiringSoonCount = licenses.filter(l => l.status === 'expiringSoon').length;
            items.push(new LicenseItem_1.LicenseItem('Active Licenses', `(${activeCount})`, vscode.TreeItemCollapsibleState.Collapsed, 'activeLicenses'), new LicenseItem_1.LicenseItem('Expiring Soon', `(${expiringSoonCount})`, vscode.TreeItemCollapsibleState.Collapsed, 'expiringSoon'), new LicenseItem_1.LicenseItem('Expired Licenses', `(${expiredCount})`, vscode.TreeItemCollapsibleState.Collapsed, 'expiredLicenses'));
        }
        catch (error) {
            items.push(new LicenseItem_1.LicenseItem('Not logged in', 'Click to login', vscode.TreeItemCollapsibleState.None, 'loginRequired'));
        }
        return items;
    }
    async getLicensesByStatus(status) {
        try {
            const licenses = await this.licenseVaultService.getLicenses();
            const filteredLicenses = licenses.filter(l => l.status === status);
            return filteredLicenses.map(license => new LicenseItem_1.LicenseItem(`${license.productName} (${license.licenseKey.substring(0, 8)}...)`, `Expires: ${license.expiryDate ? new Date(license.expiryDate).toLocaleDateString() : 'Never'}`, vscode.TreeItemCollapsibleState.None, 'licenseItem', license));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return [new LicenseItem_1.LicenseItem('Error loading licenses', message, vscode.TreeItemCollapsibleState.None, 'error')];
        }
    }
}
exports.LicenseVaultProvider = LicenseVaultProvider;
//# sourceMappingURL=LicenseVaultProvider.js.map