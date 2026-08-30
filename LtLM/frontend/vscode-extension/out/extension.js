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
exports.deactivate = exports.activate = void 0;
const vscode = __importStar(require("vscode"));
const LicenseVaultProvider_1 = require("./providers/LicenseVaultProvider");
const LicenseVaultService_1 = require("./services/LicenseVaultService");
const CommandHandler_1 = require("./commands/CommandHandler");
let licenseVaultProvider;
let licenseVaultService;
function activate(context) {
    console.log('LicenseVault extension is now active!');
    // Initialize service
    licenseVaultService = new LicenseVaultService_1.LicenseVaultService(context);
    // Initialize provider
    licenseVaultProvider = new LicenseVaultProvider_1.LicenseVaultProvider(licenseVaultService);
    // Register tree data provider
    vscode.window.registerTreeDataProvider('licensevault.explorer', licenseVaultProvider);
    // Register commands
    const commandHandler = new CommandHandler_1.CommandHandler(licenseVaultService, licenseVaultProvider);
    commandHandler.registerCommands(context);
    // Auto-refresh on startup if enabled
    const config = vscode.workspace.getConfiguration('licensevault');
    if (config.get('autoRefresh', true)) {
        setTimeout(() => {
            licenseVaultProvider.refresh();
        }, 1000);
    }
    // Register configuration change listener
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('licensevault')) {
            licenseVaultProvider.refresh();
        }
    }));
}
exports.activate = activate;
function deactivate() {
    console.log('LicenseVault extension is now deactivated!');
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map