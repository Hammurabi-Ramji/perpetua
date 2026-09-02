// content-scripts/stacksocial.js

class StackSocialExtractor {
  constructor() {
    this.pending = [];
    this.syncTimeout = null;
    this.init();
  }

  init() {
    if (globalThis.location.hostname === 'www.stacksocial.com' && globalThis.location.pathname.includes('/account/')) {
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
            product_name: globalThis.LicenseVaultExtractors.extractProductName(node.closest('.deal-container') || node) || 'StackSocial Deal',
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
            product_name: globalThis.LicenseVaultExtractors.extractProductName(node.closest('.deal-container') || node) || 'StackSocial Deal',
            license_key: key,
          });
        });
      }
    });

    const licenseElements = node.querySelectorAll('.license-key, .serial-key, .activation-code, [data-license]');
    licenseElements.forEach(element => {
      const found = globalThis.LicenseVaultExtractors.extractLicensePatterns(element.textContent);
      if (found.keys.length > 0) {
        found.keys.forEach(key => {
          licenses.push({
            product_name: globalThis.LicenseVaultExtractors.extractProductName(element.closest('.deal-container') || element) || 'StackSocial Deal',
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
      const result = await chrome.runtime.sendMessage({ action: 'licensesScraped', site: 'stacksocial', licenses });
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
const extractor = new StackSocialExtractor();
