// options/options.js
document.addEventListener('DOMContentLoaded', async () => {
  // NOTE: chrome.storage.local, not .sync — the token is a real credential
  // and .sync would replicate it through the user's Chrome/Google account.
  const settings = await chrome.storage.local.get([
    'apiBase',
    'apiToken',
    'autoSync',
    'notifyOnNewLicenses',
    'activityInference'
  ]);

  document.getElementById('apiBase').value = settings.apiBase || 'http://127.0.0.1:18765';
  document.getElementById('apiToken').value = settings.apiToken || '';
  document.getElementById('autoSync').checked = settings.autoSync !== false;
  document.getElementById('notifyOnNewLicenses').checked = settings.notifyOnNewLicenses !== false;
  document.getElementById('activityInference').checked = settings.activityInference === true;

  document.getElementById('settings-form').addEventListener('submit', saveSettings);
  document.getElementById('clear-token-button').addEventListener('click', clearToken);
  document.getElementById('test-connection').addEventListener('click', testConnection);
});

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:18765';

// The API base is where the bearer token gets sent. Perpetua only ever
// listens on loopback, so any other host is either a typo or an attempt to
// exfiltrate the token — refuse both. Returns the normalised origin
// (scheme + host + port, no trailing slash) or null.
function validateApiBase(raw) {
  const text = (raw || '').trim() || DEFAULT_API_BASE_URL;
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  const loopback = host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || host === '::1';
  if (!loopback) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== '/' && url.pathname !== '') return null;
  return url.origin;
}

async function saveSettings(e) {
  e.preventDefault();

  const apiBase = validateApiBase(document.getElementById('apiBase').value);
  if (!apiBase) {
    showStatus(
      'The Perpetua API URL must point at this computer, e.g. http://127.0.0.1:18765. The token is never sent anywhere else.',
      'error',
    );
    return;
  }

  const settings = {
    apiBase,
    apiToken: document.getElementById('apiToken').value.trim(),
    autoSync: document.getElementById('autoSync').checked,
    notifyOnNewLicenses: document.getElementById('notifyOnNewLicenses').checked,
    activityInference: document.getElementById('activityInference').checked
  };

  if (settings.activityInference && !settings.apiToken) {
    showStatus('Paste a Perpetua token before turning on visit-based keep-alive.', 'error');
    return;
  }
  if (settings.apiToken) {
    const response = await fetch(`${apiBase}/api/activity/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiToken}`,
      },
      body: JSON.stringify({ enabled: settings.activityInference }),
    });
    if (settings.activityInference && !response.ok) {
      showStatus('Perpetua did not turn on activity inference, so this box was not saved.', 'error');
      return;
    }
  }

  try {
    await chrome.storage.local.set(settings);
    document.getElementById('apiBase').value = apiBase;
    showStatus('Settings saved successfully!', 'success');
  } catch (err) {
    showStatus('Failed to save settings: ' + err.message, 'error');
  }
}

async function clearToken() {
  document.getElementById('apiToken').value = '';
  await chrome.storage.local.remove('apiToken');
  showStatus('Token cleared.', 'success');
}

async function testConnection() {
  const apiBase = validateApiBase(document.getElementById('apiBase').value);
  if (!apiBase) {
    showStatus('The Perpetua API URL must point at this computer, e.g. http://127.0.0.1:18765.', 'error');
    return;
  }
  const button = document.getElementById('test-connection');
  const originalText = button.textContent;

  button.textContent = 'Testing...';
  button.disabled = true;

  try {
    const response = await fetch(`${apiBase}/api/health`);
    if (response.ok) {
      showStatus('Connection successful!', 'success');
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (err) {
    showStatus('Connection failed: ' + err.message, 'error');
  } finally {
    button.textContent = originalText;
    button.disabled = false;
  }
}

function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = `status ${type}`;
  status.style.display = 'block';

  setTimeout(() => {
    status.style.display = 'none';
  }, 3000);
}
