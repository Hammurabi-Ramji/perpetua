// content-scripts/humblebundle.js

class HumbleBundleExtractor {
  constructor() {
    this.pending = [];
    this.syncTimeout = null;
    this.init();
  }

  init() {
    // NOTE: manifest.json injects this script on /library* and
    // /home/library* URLs — the pathname check below matches that, not the
    // old /downloads path this extractor never actually saw in practice.
    if (globalThis.location.hostname === 'www.humblebundle.com' && globalThis.location.pathname.includes('/library')) {
      this.setupObserver();
      this.extractInitialLicenses();
    }

    chrome.runtime.onMessage.addListener((request) => {
      if (request.action === 'requestSync') this.extractLicensesFromNode(document.body);
    });
  }

  setupObserver() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          this.extractLicensesFromNode(mutation.target);
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  extractInitialLicenses() {
    this.extractLicensesFromNode(document.body);
  }

  extractLicensesFromNode(node) {
    const licenses = [];

    const textNodes = this.getTextNodes(node);
    textNodes.forEach(textNode => {
      const found = globalThis.LicenseVaultExtractors.extractLicensePatterns(textNode.textContent);
      if (found.keys.length > 0) {
        found.keys.forEach(key => {
          licenses.push({
            product_name: globalThis.LicenseVaultExtractors.extractProductName(node.closest('.game-download') || node) || 'Humble Bundle Game',
            license_key: key,
          });
        });
      }
    });

    const inputs = node.querySelectorAll('input[type="text"], input[type="password"], textarea, code, pre');
    inputs.forEach(input => {
      const found = globalThis.LicenseVaultExtractors.extractLicensePatterns(input.value || input.textContent);
      if (found.keys.length > 0) {
        found.keys.forEach(key => {
          licenses.push({
            product_name: globalThis.LicenseVaultExtractors.extractProductName(node.closest('.game-download') || node) || 'Humble Bundle Game',
            license_key: key,
          });
        });
      }
    });

    const licenseElements = node.querySelectorAll('.keyfield, .redeem-code, .serial-number, [data-key]');
    licenseElements.forEach(element => {
      const found = globalThis.LicenseVaultExtractors.extractLicensePatterns(element.textContent);
      if (found.keys.length > 0) {
        found.keys.forEach(key => {
          licenses.push({
            product_name: globalThis.LicenseVaultExtractors.extractProductName(element.closest('.game-download') || element) || 'Humble Bundle Game',
            license_key: key,
          });
        });
      }
    });

    const downloadSections = node.querySelectorAll('.download-section, .game-download, .software-download');
    downloadSections.forEach(section => {
      const found = globalThis.LicenseVaultExtractors.extractLicensePatterns(section.textContent);
      if (found.keys.length > 0) {
        found.keys.forEach(key => {
          licenses.push({
            product_name: globalThis.LicenseVaultExtractors.extractProductName(section) || 'Humble Bundle Game',
            license_key: key,
          });
        });
      }
    });

    if (licenses.length > 0) this.queueSync(licenses);
  }

  queueSync(licenses) {
    this.pending.push(...licenses);
    clearTimeout(this.syncTimeout);
    this.syncTimeout = setTimeout(() => this.flush(), 1500);
  }

  async flush() {
    if (this.pending.length === 0) return;
    const licenses = this.pending;
    this.pending = [];

    try {
      const result = await chrome.runtime.sendMessage({ action: 'licensesScraped', site: 'humblebundle', licenses });
      if (!result || !result.ok) {
        console.error('Perpetua: sync failed', result && result.error);
      }
    } catch (err) {
      console.error('Perpetua: sync failed', err);
    }
  }

  getTextNodes(node) {
    const textNodes = [];
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);

    let currentNode;
    while (currentNode = walker.nextNode()) {
      if (currentNode.textContent.trim()) {
        textNodes.push(currentNode);
      }
    }

    return textNodes;
  }
}

// Initialize extractor
const extractor = new HumbleBundleExtractor();
