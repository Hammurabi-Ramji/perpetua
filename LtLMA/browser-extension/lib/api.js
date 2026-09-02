// lib/api.js
class LicenseVaultAPI {
  constructor() {
    this.baseURL = null;
    this.token = null;
    this.initialized = false;
  }

  async init() {
    const stored = await chrome.storage.sync.get(['apiBase', 'jwtToken']);
    this.baseURL = stored.apiBase || 'http://localhost:3001';
    this.token = stored.jwtToken;
    this.initialized = true;
  }

  async authenticatedFetch(endpoint, options = {}) {
    if (!this.initialized) await this.init();

    const url = `${this.baseURL}/api${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include'
    });

    if (response.status === 401) {
      // Token expired, refresh or notify
      await this.handleAuthError();
      throw new Error('Authentication required');
    }

    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }

    return response.json();
  }

  async syncLicenses(site, licenses) {
    return this.authenticatedFetch(`/licenses/sync`, {
      method: 'POST',
      body: JSON.stringify({
        site,
        licenses: licenses.map(l => ({
          ...l,
          scraped_at: new Date().toISOString(),
          source_url: window.location.href
        }))
      })
    });
  }

  async getLicenses() {
    return this.authenticatedFetch('/licenses');
  }

  async handleAuthError() {
    await chrome.storage.sync.remove(['jwtToken']);
    // Open login page
    chrome.tabs.create({ url: `${this.baseURL}/auth/login` });
  }
}

const api = new LicenseVaultAPI();