// options/options.js
document.addEventListener('DOMContentLoaded', async () => {
  // NOTE: chrome.storage.local, not .sync — the token is a real credential
  // and .sync would replicate it through the user's Chrome/Google account.
  const settings = await chrome.storage.local.get([
    'apiBase',
    'apiToken',
    'autoSync',
    'notifyOnNewLicenses'
  ]);

  document.getElementById('apiBase').value = normalizeLoopbackApiBase(settings.apiBase) || 'http://127.0.0.1:18765';
  document.getElementById('apiToken').value = settings.apiToken || '';
  document.getElementById('autoSync').checked = settings.autoSync !== false;
  document.getElementById('notifyOnNewLicenses').checked = settings.notifyOnNewLicenses !== false;

  document.getElementById('settings-form').addEventListener('submit', saveSettings);
  document.getElementById('clear-token-button').addEventListener('click', clearToken);
  document.getElementById('test-connection').addEventListener('click', testConnection);
});

// Only loopback http origins (http://127.0.0.1:<port> or http://localhost:<port>)
// may receive the bearer token. Returns the normalised origin, or null.
// Keep in sync with normalizeLoopbackApiBase in lib/api.js.
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

const API_BASE_ERROR =
  'The Perpetua API URL must point at this computer (a loopback http URL), e.g. http://127.0.0.1:18765 or http://localhost:18765. The token is never sent anywhere else.';

async function saveSettings(e) {
  e.preventDefault();

  const apiBase = normalizeLoopbackApiBase(document.getElementById('apiBase').value);
  if (!apiBase) {
    showStatus(API_BASE_ERROR, 'error');
    return;
  }

  const settings = {
    apiBase,
    apiToken: document.getElementById('apiToken').value.trim(),
    autoSync: document.getElementById('autoSync').checked,
    notifyOnNewLicenses: document.getElementById('notifyOnNewLicenses').checked
  };

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
  const apiBase = normalizeLoopbackApiBase(document.getElementById('apiBase').value);
  if (!apiBase) {
    showStatus(API_BASE_ERROR, 'error');
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
