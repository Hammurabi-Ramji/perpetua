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

async function loadRecentLicenses() {
  const licensesList = document.getElementById('licenses-list');
  try {
    const result = await chrome.runtime.sendMessage({ action: 'getLicenses' });

    if (!result || !result.ok) {
      licensesList.innerHTML = `<p>${(result && result.error) || 'Failed to load licenses'}</p>`;
      return;
    }

    const licenses = result.licenses || [];
    if (licenses.length === 0) {
      licensesList.innerHTML = '<p>No licenses found. Try syncing first.</p>';
      return;
    }

    const recent = licenses.slice(-5).reverse();
    licensesList.innerHTML = recent.map(license => `
      <div class="license-item">
        <div class="license-name">${license.product_name}</div>
        <div class="license-meta">${license.source_site || '—'} • ${license.status}</div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load licenses:', err);
    licensesList.innerHTML = '<p>Failed to load licenses</p>';
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
