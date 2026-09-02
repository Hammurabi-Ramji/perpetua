// options/options.js
document.addEventListener('DOMContentLoaded', async () => {
  // Load current settings
  const settings = await chrome.storage.sync.get([
    'apiBase',
    'autoSync',
    'notifyOnNewLicenses',
    'connectedSites'
  ]);

  // Populate form
  document.getElementById('apiBase').value = settings.apiBase || 'http://localhost:3001';
  document.getElementById('autoSync').checked = settings.autoSync !== false;
  document.getElementById('notifyOnNewLicenses').checked = settings.notifyOnNewLicenses !== false;

  // Load connected sites
  loadConnectedSites(settings.connectedSites || []);

  // Event listeners
  document.getElementById('settings-form').addEventListener('submit', saveSettings);
  document.getElementById('logout-button').addEventListener('click', logout);
  document.getElementById('test-connection').addEventListener('click', testConnection);
});

async function saveSettings(e) {
  e.preventDefault();

  const settings = {
    apiBase: document.getElementById('apiBase').value,
    autoSync: document.getElementById('autoSync').checked,
    notifyOnNewLicenses: document.getElementById('notifyOnNewLicenses').checked
  };

  try {
    await chrome.storage.sync.set(settings);
    showStatus('Settings saved successfully!', 'success');
  } catch (err) {
    showStatus('Failed to save settings: ' + err.message, 'error');
  }
}

async function logout() {
  await chrome.storage.sync.remove(['jwtToken', 'connectedSites']);
  showStatus('Signed out successfully!', 'success');

  // Redirect to login
  setTimeout(() => {
    chrome.tabs.create({ url: 'http://localhost:5173/auth/login' });
  }, 1000);
}

async function testConnection() {
  const apiBase = document.getElementById('apiBase').value;
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

function loadConnectedSites(sites) {
  const container = document.getElementById('connected-sites');

  if (sites.length === 0) {
    container.innerHTML = '<p>No sites configured yet. Visit a supported deal site to connect.</p>';
    return;
  }

  container.innerHTML = sites.map(site => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #2d2d2d; margin: 4px 0; border-radius: 4px;">
      <span>${site.name} (${site.domain})</span>
      <button class="disconnect-site" data-domain="${site.domain}" style="background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Disconnect</button>
    </div>
  `).join('');

  // Add disconnect handlers
  document.querySelectorAll('.disconnect-site').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const domain = e.target.dataset.domain;
      const updatedSites = sites.filter(s => s.domain !== domain);
      await chrome.storage.sync.set({ connectedSites: updatedSites });
      loadConnectedSites(updatedSites);
      showStatus('Site disconnected', 'success');
    });
  });
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