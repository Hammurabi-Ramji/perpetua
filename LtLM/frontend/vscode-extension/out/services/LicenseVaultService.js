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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LicenseVaultService = void 0;
const vscode = __importStar(require("vscode"));
const axios_1 = __importDefault(require("axios"));
class LicenseVaultService {
    constructor(context) {
        this.context = context;
        const config = vscode.workspace.getConfiguration('licensevault');
        const baseURL = config.get('apiBaseUrl', 'http://localhost:3001');
        this.api = axios_1.default.create({
            baseURL,
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        // Add request interceptor for auth
        this.api.interceptors.request.use(config => {
            if (this.jwtToken) {
                config.headers.Authorization = `Bearer ${this.jwtToken}`;
            }
            return config;
        });
        this.loadToken();
    }
    getErrorMessage(error) {
        if (axios_1.default.isAxiosError(error)) {
            return error.response?.data?.message || error.response?.data?.error || error.message;
        }
        return error instanceof Error ? error.message : 'Unknown error';
    }
    normalizeLicense(raw) {
        const status = raw.status === 'pending' ? 'expiringSoon' : raw.status;
        return {
            id: String(raw.id),
            productName: raw.productName ?? raw.product_name ?? '',
            licenseKey: raw.licenseKey ?? raw.license_key ?? '',
            expiryDate: raw.expiryDate ?? raw.expiry_date,
            status: status ?? 'active',
            source: raw.source ?? raw.source_site ?? '',
            createdAt: raw.createdAt ?? raw.created_at ?? '',
            updatedAt: raw.updatedAt ?? raw.updated_at ?? ''
        };
    }
    saveToken(token) {
        this.jwtToken = token;
        this.context.globalState.update('licensevault.jwtToken', token);
    }
    clearToken() {
        this.jwtToken = undefined;
        this.context.globalState.update('licensevault.jwtToken', undefined);
    }
    loadToken() {
        this.jwtToken = this.context.globalState.get('licensevault.jwtToken');
    }
    async login(email, password) {
        try {
            const response = await this.api.post('/api/auth/login', { email, password });
            const { token } = response.data;
            this.saveToken(token);
            return true;
        }
        catch (error) {
            throw new Error('Login failed: ' + this.getErrorMessage(error));
        }
    }
    async logout() {
        this.clearToken();
    }
    isLoggedIn() {
        return !!this.jwtToken;
    }
    async getLicenses() {
        if (!this.isLoggedIn()) {
            throw new Error('Not logged in');
        }
        try {
            const response = await this.api.get('/api/licenses');
            const licenses = Array.isArray(response.data) ? response.data : response.data.licenses || [];
            return licenses.map((license) => this.normalizeLicense(license));
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error) && error.response?.status === 401) {
                this.clearToken();
                throw new Error('Session expired. Please login again.');
            }
            throw new Error('Failed to fetch licenses: ' + this.getErrorMessage(error));
        }
    }
    async addLicense(license) {
        if (!this.isLoggedIn()) {
            throw new Error('Not logged in');
        }
        try {
            const response = await this.api.post('/api/licenses', license);
            return this.normalizeLicense(response.data.license ?? response.data);
        }
        catch (error) {
            throw new Error('Failed to add license: ' + this.getErrorMessage(error));
        }
    }
    async updateLicense(id, updates) {
        if (!this.isLoggedIn()) {
            throw new Error('Not logged in');
        }
        try {
            const response = await this.api.patch(`/api/licenses/${id}`, updates);
            return this.normalizeLicense(response.data.license ?? { id, ...updates });
        }
        catch (error) {
            throw new Error('Failed to update license: ' + this.getErrorMessage(error));
        }
    }
    async deleteLicense(id) {
        if (!this.isLoggedIn()) {
            throw new Error('Not logged in');
        }
        try {
            await this.api.delete(`/api/licenses/${id}`);
        }
        catch (error) {
            throw new Error('Failed to delete license: ' + this.getErrorMessage(error));
        }
    }
    async searchLicenses(query) {
        const licenses = await this.getLicenses();
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) {
            return licenses;
        }
        return licenses.filter((license) => license.productName.toLowerCase().includes(normalizedQuery) ||
            license.source.toLowerCase().includes(normalizedQuery) ||
            license.licenseKey.toLowerCase().includes(normalizedQuery));
    }
    async getLicenseStats() {
        const licenses = await this.getLicenses();
        return {
            active: licenses.filter(l => l.status === 'active').length,
            expired: licenses.filter(l => l.status === 'expired').length,
            expiringSoon: licenses.filter(l => l.status === 'expiringSoon').length
        };
    }
}
exports.LicenseVaultService = LicenseVaultService;
//# sourceMappingURL=LicenseVaultService.js.map