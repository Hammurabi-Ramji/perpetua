// background.js — the only place network calls to Perpetua happen. Content
// scripts extract data and message this worker; they never fetch directly.

importScripts('lib/api.js');

const SITE_HOSTS = {
  appsumo: 'appsumo.com',
  producthunt: 'www.producthunt.com',
  stacksocial: 'www.stacksocial.com',
  humblebundle: 'www.humblebundle.com',
};

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(['apiBase', 'autoSync', 'notifyOnNewLicenses']);
  await chrome.storage.local.set({
    apiBase: existing.apiBase || 'http://127.0.0.1:18765',
    autoSync: existing.autoSync !== false,
    notifyOnNewLicenses: existing.notifyOnNewLicenses !== false,
  });
});

async function maybeNotify(message, type = 'success') {
  const { notifyOnNewLicenses } = await chrome.storage.local.get('notifyOnNewLicenses');
  if (notifyOnNewLicenses === false) return;
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Perpetua',
    message: type === 'error' ? `⚠️ ${message}` : message,
  });
}

// Normalizes a scraped license (which may come in with camelCase fields from
// older content-script code paths) into Perpetua's LicensePayload shape, and
// drops anything missing the two required fields — sending even one such row
// to /api/vault/import would fail the *entire* batch, since it's parsed and
// validated as one JSON document server-side, not row by row.
function normalizeLicense(raw, site) {
  const license_key = (raw.license_key ?? raw.licenseKey ?? '').trim();
  const product_name = (raw.product_name ?? raw.productName ?? '').trim();
  if (!license_key || !product_name) return null;

  return {
    product_name,
    license_key,
    purchase_date: raw.purchase_date ?? null,
    status: raw.status ?? 'active',
    source_site: site,
    product_url: raw.product_url ?? null,
    redemption_url: raw.redemption_url ?? null,
  };
}

async function handleScraped(site, rawLicenses) {
  const normalized = (rawLicenses || []).map((raw) => normalizeLicense(raw, site));
  const valid = normalized.filter(Boolean);
  const skippedInvalid = normalized.length - valid.length;

  if (valid.length === 0) {
    return { ok: true, imported: 0, skipped_duplicates: 0, skippedInvalid, total: rawLicenses.length };
  }

  try {
    const result = await importLicenses(valid);
    maybeNotify(`Synced ${result.imported} of ${result.total_rows} license(s) from ${site}.`);
    return { ok: true, ...result, skippedInvalid };
  } catch (error) {
    if (error.status === 402) {
      // The whole batch is rolled back atomically on a free-tier cap hit —
      // never claim a partial success here.
      maybeNotify('Sync blocked: free-tier license limit reached. Upgrade Perpetua to Pro to sync more. 0 licenses were saved this batch.', 'error');
      return { ok: false, error: 'free_limit_reached' };
    }
    maybeNotify(`Sync failed: ${error.message}`, 'error');
    return { ok: false, error: error.message };
  }
}

async function triggerManualSyncAllTabs() {
  try {
    for (const host of Object.values(SITE_HOSTS)) {
      const tabs = await chrome.tabs.query({ url: `*://${host}/*` });
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, { action: 'requestSync' }).catch(() => {});
      }
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  switch (request.action) {
    case 'licensesScraped':
      handleScraped(request.site, request.licenses).then(sendResponse);
      return true;

    case 'getLicenses':
      getLicenses()
        .then((licenses) => sendResponse({ ok: true, licenses }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;

    case 'manualSyncAll':
      triggerManualSyncAllTabs().then(sendResponse);
      return true;

    default:
      return false;
  }
});
