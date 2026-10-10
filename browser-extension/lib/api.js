// lib/api.js — runs only inside the background service worker. Never inject
// this into a scraped page's own context: that would put the auth token
// within reach of that page's own scripts.

const DEFAULT_API_BASE = 'http://127.0.0.1:18765';

// Only loopback http origins (http://127.0.0.1:<port> or http://localhost:<port>)
// may receive the bearer token. Returns the normalised origin, or null.
// Keep in sync with normalizeLoopbackApiBase in options/options.js.
function normalizeLoopbackApiBase(value) {
  if (typeof value !== 'string') return null;
  let url;
  try {
    url = new URL(value.trim());
  } catch (_) {
    return null;
  }
  if (url.protocol !== 'http:') return null;
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return null;
  if (!url.port) return null;
  if (url.username || url.password) return null;
  if (url.pathname !== '/' || url.search || url.hash) return null;
  return url.origin;
}

async function getConfig() {
  const { apiBase, apiToken } = await chrome.storage.local.get(['apiBase', 'apiToken']);
  return { apiBase: normalizeLoopbackApiBase(apiBase) || DEFAULT_API_BASE, apiToken };
}

async function authenticatedFetch(endpoint, options = {}) {
  const { apiBase, apiToken } = await getConfig();
  if (!apiToken) {
    throw new Error('No Perpetua token configured. Open extension settings and paste one from Perpetua > Vault Tools.');
  }

  const response = await fetch(`${apiBase}/api${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiToken}`,
      ...options.headers,
    },
  });

  const body = await response.json().catch(() => null);

  if (response.status === 401) {
    throw new Error('Token expired or invalid. Paste a fresh one in extension settings.');
  }
  if (!response.ok || (body && body.success === false)) {
    const message = (body && body.message) || `API error (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return body ? body.data : null;
}

async function importLicenses(licenses) {
  const content = JSON.stringify({
    exported_at: new Date().toISOString(),
    licenses,
  });
  return authenticatedFetch('/vault/import', {
    method: 'POST',
    body: JSON.stringify({ format: 'json', content }),
  });
}

async function getLicenses() {
  return authenticatedFetch('/licenses');
}

async function checkHealth(apiBase) {
  const response = await fetch(`${normalizeLoopbackApiBase(apiBase) || DEFAULT_API_BASE}/api/health`);
  return response.ok;
}
