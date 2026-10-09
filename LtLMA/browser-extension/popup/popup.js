// popup/popup.js
document.addEventListener('DOMContentLoaded', async () => {
  const authStatus = document.getElementById('auth-status');
  const authenticatedContent = document.getElementById('authenticated-content');
  const loginPrompt = document.getElementById('login-prompt');

  const { apiToken } = await chrome.storage.local.get('apiToken');

  if (apiToken) {
    authStatus.textContent = 'Authenticated';
    authenticatedContent.classList.remove('hidden');
    loadRecentLicenses();
  } else {
    authStatus.textContent = 'Not authenticated';
    loginPrompt.classList.remove('hidden');
  }

  document.getElementById('sync-button').addEventListener('click', syncAllLicenses);
  document.getElementById('settings').addEventListener('click', openSettings);
  document.getElementById('login-button').addEventListener('click', openSettings);
});

function renderMessage(container, text) {
  const p = document.createElement('p');
  p.textContent = text;
  container.replaceChildren(p);
}

// API/scraped strings are untrusted: build the DOM with textContent only.
function renderLicenseItem(license) {
  const item = document.createElement('div');
  item.className = 'license-item';

  const name = document.createElement('div');
  name.className = 'license-name';
  name.textContent = String(license.product_name ?? '');

  const meta = document.createElement('div');
  meta.className = 'license-meta';
  meta.textContent = `${license.source_site || '—'} • ${license.status ?? ''}`;

  item.append(name, meta);
  return item;
}

async function loadRecentLicenses() {
  const licensesList = document.getElementById('licenses-list');
  try {
    const result = await chrome.runtime.sendMessage({ action: 'getLicenses' });

    if (!result || !result.ok) {
      renderMessage(licensesList, (result && result.error) || 'Failed to load licenses');
      return;
    }

    const licenses = result.licenses || [];
    if (licenses.length === 0) {
      renderMessage(licensesList, 'No licenses found. Try syncing first.');
      return;
    }

    const recent = licenses.slice(-5).reverse();
    licensesList.replaceChildren(...recent.map(renderLicenseItem));
  } catch (err) {
    console.error('Failed to load licenses:', err);
    renderMessage(licensesList, 'Failed to load licenses');
  }
}

async function syncAllLicenses() {
  const button = document.getElementById('sync-button');
  const originalText = button.textContent;
  button.textContent = '🔄 Syncing...';
  button.disabled = true;

  try {
    await chrome.runtime.sendMessage({ action: 'manualSyncAll' });

    button.textContent = '✅ Synced!';
    setTimeout(() => {
      button.textContent = originalText;
      button.disabled = false;
      loadRecentLicenses();
    }, 2000);
  } catch (err) {
    console.error('Sync failed:', err);
    button.textContent = '❌ Sync Failed';
    setTimeout(() => {
      button.textContent = originalText;
      button.disabled = false;
    }, 2000);
  }
}

function openSettings() {
  chrome.runtime.openOptionsPage();
  window.close();
}
