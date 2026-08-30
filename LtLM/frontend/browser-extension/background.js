// background.js
chrome.runtime.onInstalled.addListener(() => {
  console.log('LicenseVault Extension Installed');

  // Set up periodic sync alarm
  chrome.alarms.create('sync-licenses', { periodInMinutes: 60 });

  // Initialize storage defaults
  chrome.storage.sync.set({
    apiBase: 'http://localhost:3001',
    autoSync: true,
    notifyOnNewLicenses: true
  });
});

// Handle alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'sync-licenses') {
    // Check all connected sites for updates
    const { connectedSites } = await chrome.storage.sync.get('connectedSites');
    if (connectedSites) {
      for (const site of connectedSites) {
        // Trigger sync by messaging content script
        const tabs = await chrome.tabs.query({ url: `*://${site.domain}/*` });
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, { action: 'requestSync' });
        }
      }
    }
  }
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'getLicenses':
      getStoredLicenses().then(sendResponse);
      return true; // Async response

    case 'manualSync':
      triggerManualSync(request.site).then(sendResponse);
      return true;

    case 'openHomePage':
      chrome.tabs.create({ url: 'http://localhost:5173' });
      break;

    case 'captureScreenshot':
      chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' })
        .then(sendResponse);
      return true;
  }
});

// Context menu for right-click "Add to LicenseVault"
chrome.contextMenus.create({
  id: 'add-to-vault',
  title: 'Add License to LicenseVault',
  contexts: ['selection']
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const selectedText = info.selectionText;

  // Parse selected text as license data
  const license = parseSelectedText(selectedText);

  // Send to API
  await fetch('http://localhost:3001/api/licenses/manual', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${await getStoredToken()}`
    },
    body: JSON.stringify(license)
  });

  // Show confirmation
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'LicenseVault',
    message: 'License added successfully'
  });
});

async function getStoredLicenses() {
  const { licenses } = await chrome.storage.local.get('licenses');
  return licenses || [];
}

async function getStoredToken() {
  const { jwtToken } = await chrome.storage.sync.get('jwtToken');
  return jwtToken;
}

async function triggerManualSync(site) {
  try {
    // Find tabs for this site
    const tabs = await chrome.tabs.query({ url: `*://${site}.com/*` });

    for (const tab of tabs) {
      // Send message to content script
      chrome.tabs.sendMessage(tab.id, { action: 'requestSync' });
    }

    return { success: true };
  } catch (err) {
    console.error('Manual sync failed:', err);
    return { success: false, error: err.message };
  }
}

function parseSelectedText(text) {
  // Simple parsing for manually selected license text
  const lines = text.split('\n');
  const license = {
    product_name: lines[0] || 'Unknown Product',
    license_key: '',
    purchase_date: new Date().toISOString().split('T')[0],
    status: 'active'
  };

  // Look for license key patterns
  const keyPatterns = [
    /[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/,
    /[A-Z0-9]{16,24}/
  ];

  for (const line of lines) {
    for (const pattern of keyPatterns) {
      const match = line.match(pattern);
      if (match) {
        license.license_key = match[0];
        break;
      }
    }
    if (license.license_key) break;
  }

  return license;
}

// Handle OAuth callback
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url && changeInfo.url.includes('/auth/callback')) {
    // Extract token from URL
    const url = new URL(changeInfo.url);
    const token = url.searchParams.get('token');

    if (token) {
      // Store token
      await chrome.storage.sync.set({ jwtToken: token });

      // Close tab and show success
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'LicenseVault',
        message: 'Successfully signed in!'
      });

      // Close the auth tab
      chrome.tabs.remove(tabId);
    }
  }
});