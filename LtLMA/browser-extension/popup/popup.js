// popup/popup.js
document.addEventListener('DOMContentLoaded', async () => {
  const authStatus = document.getElementById('auth-status');
  const authenticatedContent = document.getElementById('authenticated-content');
  const loginPrompt = document.getElementById('login-prompt');

  // Check authentication status
  const { jwtToken } = await chrome.storage.sync.get('jwtToken');

  if (jwtToken) {
    authStatus.textContent = 'Authenticated';
    authenticatedContent.classList.remove('hidden');
    loadRecentLicenses();
  } else {
    authStatus.textContent = 'Not authenticated';
    loginPrompt.classList.remove('hidden');
  }

  // Event listeners
  document.getElementById('sync-button').addEventListener('click', syncAllLicenses);
  document.getElementById('open-app').addEventListener('click', openApp);
  document.getElementById('settings').addEventListener('click', openSettings);
  document.getElementById('login-button').addEventListener('click', openLogin);
});

async function loadRecentLicenses() {
  try {
    const licenses = await chrome.runtime.sendMessage({ action: 'getLicenses' });
    const licensesList = document.getElementById('licenses-list');

    if (!licenses || licenses.length === 0) {
      licensesList.innerHTML = '<p>No licenses found. Try syncing first.</p>';
      return;
    }

    // Show last 5 licenses
    const recent = licenses.slice(-5).reverse();
    licensesList.innerHTML = recent.map(license => `
      <div class="license-item ${license.action_required ? 'action-required' : ''}" data-id="${license.id}">
        <div class="license-name">${license.product_name}</div>
        <div class="license-meta">${license.vendor} • ${license.status}</div>
      </div>
    `).join('');

    // Add click handlers
    document.querySelectorAll('.license-item').forEach(item => {
      item.addEventListener('click', () => {
        const licenseId = item.dataset.id;
        openLicenseDetails(licenseId);
      });
    });

  } catch (err) {
    console.error('Failed to load licenses:', err);
    document.getElementById('licenses-list').innerHTML = '<p>Failed to load licenses</p>';
  }
}

async function syncAllLicenses() {
  const button = document.getElementById('sync-button');
  const originalText = button.textContent;
  button.textContent = '🔄 Syncing...';
  button.disabled = true;

  try {
    // Trigger sync for all supported sites
    const sites = ['appsumo', 'producthunt', 'stacksocial', 'humblebundle'];

    for (const site of sites) {
      await chrome.runtime.sendMessage({ action: 'manualSync', site });
    }

    button.textContent = '✅ Synced!';
    setTimeout(() => {
      button.textContent = originalText;
      button.disabled = false;
      loadRecentLicenses(); // Refresh the list
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

function openApp() {
  chrome.runtime.sendMessage({ action: 'openHomePage' });
  window.close();
}

function openSettings() {
  chrome.runtime.openOptionsPage();
  window.close();
}

function openLogin() {
  chrome.runtime.sendMessage({ action: 'openHomePage' });
  window.close();
}

function openLicenseDetails(licenseId) {
  // For now, just open the main app
  chrome.runtime.sendMessage({ action: 'openHomePage' });
  window.close();
}