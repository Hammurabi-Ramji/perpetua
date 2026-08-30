import * as vscode from 'vscode';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { License } from '../providers/LicenseItem';

export class LicenseVaultService {
  private readonly api: AxiosInstance;
  private jwtToken: string | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('licensevault');
    const baseURL = config.get('apiBaseUrl', 'http://localhost:3001');

    this.api = axios.create({
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

  private getErrorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
      return error.response?.data?.message || error.response?.data?.error || error.message;
    }
    return error instanceof Error ? error.message : 'Unknown error';
  }

  private normalizeLicense(raw: any): License {
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

  private saveToken(token: string) {
    this.jwtToken = token;
    this.context.globalState.update('licensevault.jwtToken', token);
  }

  private clearToken() {
    this.jwtToken = undefined;
    this.context.globalState.update('licensevault.jwtToken', undefined);
  }

  private loadToken() {
    this.jwtToken = this.context.globalState.get('licensevault.jwtToken');
  }

  async login(email: string, password: string): Promise<boolean> {
    try {
      const response = await this.api.post('/api/auth/login', { email, password });
      const { token } = response.data;

      this.saveToken(token);
      return true;
    } catch (error) {
      throw new Error('Login failed: ' + this.getErrorMessage(error));
    }
  }

  async logout(): Promise<void> {
    this.clearToken();
  }

  isLoggedIn(): boolean {
    return !!this.jwtToken;
  }

  async getLicenses(): Promise<License[]> {
    if (!this.isLoggedIn()) {
      throw new Error('Not logged in');
    }

    try {
      const response = await this.api.get('/api/licenses');
      const licenses = Array.isArray(response.data) ? response.data : response.data.licenses || [];
      return licenses.map((license: any) => this.normalizeLicense(license));
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        this.clearToken();
        throw new Error('Session expired. Please login again.');
      }
      throw new Error('Failed to fetch licenses: ' + this.getErrorMessage(error));
    }
  }

  async addLicense(license: Partial<License>): Promise<License> {
    if (!this.isLoggedIn()) {
      throw new Error('Not logged in');
    }

    try {
      const response = await this.api.post('/api/licenses', license);
      return this.normalizeLicense(response.data.license ?? response.data);
    } catch (error) {
      throw new Error('Failed to add license: ' + this.getErrorMessage(error));
    }
  }

  async updateLicense(id: string, updates: Partial<License>): Promise<License> {
    if (!this.isLoggedIn()) {
      throw new Error('Not logged in');
    }

    try {
      const response = await this.api.patch(`/api/licenses/${id}`, updates);
      return this.normalizeLicense(response.data.license ?? { id, ...updates });
    } catch (error) {
      throw new Error('Failed to update license: ' + this.getErrorMessage(error));
    }
  }

  async deleteLicense(id: string): Promise<void> {
    if (!this.isLoggedIn()) {
      throw new Error('Not logged in');
    }

    try {
      await this.api.delete(`/api/licenses/${id}`);
    } catch (error) {
      throw new Error('Failed to delete license: ' + this.getErrorMessage(error));
    }
  }

  async searchLicenses(query: string): Promise<License[]> {
    const licenses = await this.getLicenses();
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return licenses;
    }

    return licenses.filter((license) =>
      license.productName.toLowerCase().includes(normalizedQuery) ||
      license.source.toLowerCase().includes(normalizedQuery) ||
      license.licenseKey.toLowerCase().includes(normalizedQuery)
    );
  }

  async getLicenseStats(): Promise<{ active: number; expired: number; expiringSoon: number }> {
    const licenses = await this.getLicenses();

    return {
      active: licenses.filter(l => l.status === 'active').length,
      expired: licenses.filter(l => l.status === 'expired').length,
      expiringSoon: licenses.filter(l => l.status === 'expiringSoon').length
    };
  }
}
