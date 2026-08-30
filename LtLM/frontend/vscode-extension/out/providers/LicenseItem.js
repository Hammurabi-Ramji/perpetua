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
exports.LicenseItem = void 0;
const vscode = __importStar(require("vscode"));
class LicenseItem extends vscode.TreeItem {
    constructor(label, tooltip, collapsibleState, contextValue, license) {
        super(label, collapsibleState);
        this.label = label;
        this.tooltip = tooltip;
        this.collapsibleState = collapsibleState;
        this.contextValue = contextValue;
        this.license = license;
        this.tooltip = tooltip;
        this.contextValue = contextValue;
        // Set icon based on context
        if (contextValue === 'activeLicenses' || contextValue === 'licenseItem') {
            this.iconPath = new vscode.ThemeIcon('key');
        }
        else if (contextValue === 'expiredLicenses') {
            this.iconPath = new vscode.ThemeIcon('warning');
        }
        else if (contextValue === 'expiringSoon') {
            this.iconPath = new vscode.ThemeIcon('clock');
        }
        else if (contextValue === 'loginRequired') {
            this.iconPath = new vscode.ThemeIcon('sign-in');
        }
        // Set command for license items
        if (contextValue === 'licenseItem' && license) {
            this.command = {
                command: 'licensevault.copyLicenseKey',
                title: 'Copy License Key',
                arguments: [license]
            };
        }
        else if (contextValue === 'loginRequired') {
            this.command = {
                command: 'licensevault.login',
                title: 'Login to LicenseVault'
            };
        }
    }
}
exports.LicenseItem = LicenseItem;
//# sourceMappingURL=LicenseItem.js.map