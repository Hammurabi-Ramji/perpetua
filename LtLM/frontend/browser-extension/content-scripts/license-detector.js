// content-scripts/license-detector.js
// Runs on all pages, detects when user is viewing software requiring license

let detectedSoftware = null;

function detectSoftware() {
  const hostname = location.hostname;

  // Software-specific detection
  const softwareMap = {
    'adobe.com': { name: 'Adobe Creative Cloud', checkUrl: /account\/licenses/ },
    'github.com': { name: 'GitHub', checkUrl: /settings\/billing/ },
    'jetbrains.com': { name: 'JetBrains', checkUrl: /account/ },
    'figma.com': { name: 'Figma', checkUrl: /settings/ },
    'linear.app': { name: 'Linear', checkUrl: /settings/ },
    'notion.so': { name: 'Notion', checkUrl: /settings/ }
  };

  const software = softwareMap[hostname];
  if (software && software.checkUrl.test(location.pathname)) {
    detectedSoftware = software;
    maybeSuggestLicense(software);
  }
}

async function maybeSuggestLicense(software) {
  // Check if user has a license for this in their vault
  const response = await fetch('http://localhost:3001/api/licenses/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: software.name })
  });

  const licenses = await response.json();

  if (licenses.length > 0) {
    // Show suggestion: "You have a license for this!"
    showLicenseSuggestion(licenses[0]);
  } else {
    // Check if there's a current deal for similar software
    checkForAlternativeDeals(software);
  }
}

function showLicenseSuggestion(license) {
  const div = document.createElement('div');
  div.innerHTML = `
    <div style="
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #8b5cf6;
      color: white;
      padding: 16px;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
      font-family: system-ui, sans-serif;
      z-index: 10000;
      max-width: 300px;
      cursor: pointer;
    ">
      <div style="font-weight: 600; margin-bottom: 8px;">
        🎉 License Found in Vault
      </div>
      <div style="font-size: 14px; opacity: 0.9;">
        ${license.product_name}
      </div>
      <button id="lv-autofill" style="
        margin-top: 12px;
        background: white;
        color: #8b5cf6;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        font-weight: 500;
        cursor: pointer;
      ">
        Auto-fill License
      </button>
    </div>
  `;

  document.body.appendChild(div);

  div.querySelector('#lv-autofill').addEventListener('click', () => {
    // Find license key input on page and fill it
    const inputs = document.querySelectorAll('input[type="text"], input[type="password"]');
    for (const input of inputs) {
      if (input.placeholder?.toLowerCase().includes('license') ||
          input.name?.toLowerCase().includes('key') ||
          input.id?.toLowerCase().includes('license')) {
        input.value = license.license_key;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        break;
      }
    }
    div.remove();
  });
}

async function checkForAlternativeDeals(software) {
  // Check for current deals on supported sites
  const response = await fetch('http://localhost:3001/api/deals/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ software: software.name })
  });

  const deals = await response.json();

  if (deals.length > 0) {
    showDealSuggestion(deals[0], software);
  }
}

function showDealSuggestion(deal, software) {
  const div = document.createElement('div');
  div.innerHTML = `
    <div style="
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #10b981;
      color: white;
      padding: 16px;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
      font-family: system-ui, sans-serif;
      z-index: 10000;
      max-width: 300px;
    ">
      <div style="font-weight: 600; margin-bottom: 8px;">
        💰 Deal Available!
      </div>
      <div style="font-size: 14px; opacity: 0.9; margin-bottom: 12px;">
        Similar to ${software.name}: ${deal.product_name}
      </div>
      <div style="display: flex; gap: 8px;">
        <button id="lv-view-deal" style="
          background: white;
          color: #10b981;
          border: none;
          padding: 6px 12px;
          border-radius: 4px;
          font-weight: 500;
          cursor: pointer;
        ">
          View Deal
        </button>
        <button id="lv-dismiss" style="
          background: transparent;
          color: white;
          border: 1px solid white;
          padding: 6px 12px;
          border-radius: 4px;
          cursor: pointer;
        ">
          Dismiss
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(div);

  div.querySelector('#lv-view-deal').addEventListener('click', () => {
    window.open(deal.url, '_blank');
    div.remove();
  });

  div.querySelector('#lv-dismiss').addEventListener('click', () => {
    div.remove();
  });

  // Auto-hide after 15 seconds
  setTimeout(() => {
    if (div.parentNode) div.remove();
  }, 15000);
}

detectSoftware();