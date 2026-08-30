// content-scripts/appsumo.js
(function() {
  'use strict';

  // Prevent duplicate injection
  if (window.__licenseVaultInjected) return;
  window.__licenseVaultInjected = true;

  const SITE = 'appsumo';
  let syncInProgress = false;

  async function extractLicenses() {
    const licenses = [];

    // Wait for the purchases to load
    await new Promise(resolve => {
      const check = () => {
        if (document.querySelector('.purchase-item, .order-item, [data-testid*="purchase"]')) {
          resolve();
        } else {
          setTimeout(check, 500);
        }
      };
      check();
    });

    const purchaseElements = document.querySelectorAll('.purchase-item, .order-item, .deal-card, [class*="purchase"]');

    for (const element of purchaseElements) {
      try {
        const productName =
          element.querySelector('.product-title, h3, [class*="title"]')?.textContent?.trim() ||
          element.querySelector('img')?.alt ||
          'Unknown Product';

        const isLifetime =
          element.textContent.toLowerCase().includes('lifetime') ||
          element.textContent.includes('LTD') ||
          element.querySelector('[class*="badge"], [class*="lifetime"]');

        if (!isLifetime) continue;

        const purchaseDate =
          element.querySelector('.purchase-date, [class*="date"]')?.textContent?.trim() ||
          element.querySelector('time')?.dateTime;

        const redemptionUrl =
          element.querySelector('a[href*="redeem"], a[href*="activate"]')?.href;

        const licenseKey =
          element.querySelector('.license-key, code, [class*="key"]')?.textContent?.trim();

        const status = element.textContent.toLowerCase().includes('redeemed') ? 'redeemed' : 'pending';

        const productUrl =
          element.querySelector('a[href*="/products/"]')?.href ||
          element.querySelector('a')?.href;

        licenses.push({
          product_name: productName,
          purchase_date: purchaseDate ? new Date(purchaseDate).toISOString() : null,
          redemption_url: redemptionUrl,
          license_key: licenseKey || null,
          status: status,
          product_url: productUrl,
          raw_data: element.outerHTML.substring(0, 1000) // For debugging
        });
      } catch (err) {
        console.error('LicenseVault: Error extracting license', err);
      }
    }

    return licenses;
  }

  // Auto-sync on page load with debounce
  let autoSyncTimeout;
  async function autoSync() {
    if (syncInProgress) return;

    clearTimeout(autoSyncTimeout);
    autoSyncTimeout = setTimeout(async () => {
      syncInProgress = true;

      try {
        const licenses = await extractLicenses();
        if (licenses.length > 0) {
          const response = await window.LicenseVaultAPI.syncLicenses(SITE, licenses);

          // Show success indicator
          showNotification(`Synced ${licenses.length} licenses from AppSumo`);

          // Store sync timestamp
          await chrome.storage.local.set({
            [`lastSync_${SITE}`]: new Date().toISOString()
          });
        }
      } catch (err) {
        console.error('LicenseVault: Sync failed', err);
        showNotification('Sync failed: ' + err.message, 'error');
      } finally {
        syncInProgress = false;
      }
    }, 2000); // Wait 2s for page to fully render
  }

  function showNotification(message, type = 'success') {
    const div = document.createElement('div');
    div.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'error' ? '#ef4444' : '#8b5cf6'};
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      z-index: 10000;
      font-family: system-ui, sans-serif;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      animation: slideIn 0.3s ease;
    `;
    div.textContent = message;
    document.body.appendChild(div);

    setTimeout(() => div.remove(), 4000);
  }

  // Inject API client into page context
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('lib/api.js');
  (document.head || document.documentElement).appendChild(script);
  script.onload = () => script.remove();

  // Listen for page changes (SPA navigation)
  const observer = new MutationObserver(() => {
    if (location.href.includes('/my-account') || location.href.includes('/account')) {
      autoSync();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Initial sync
  if (document.readyState === 'complete') {
    autoSync();
  } else {
    window.addEventListener('load', autoSync);
  }

  // Expose for manual trigger
  window.LicenseVaultExtract = extractLicenses;
})();