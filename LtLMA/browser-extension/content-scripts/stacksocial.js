// content-scripts/stacksocial.js

class StackSocialExtractor {
  constructor() {
    this.init();
  }

  init() {
    // Check if we're on a StackSocial product page
    if (globalThis.location.hostname === 'stacksocial.com' && globalThis.location.pathname.includes('/deals/')) {
      this.setupObserver();
      this.extractInitialLicenses();
    }
  }

  setupObserver() {
    // Watch for dynamic content changes
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
    // Extract licenses from initial page load
    this.extractLicensesFromNode(document.body);
  }

  extractLicensesFromNode(node) {
    const licenses = [];

    // Look for license keys in text content
    const textNodes = this.getTextNodes(node);
    textNodes.forEach(textNode => {
      const found = globalThis.LicenseVaultExtractors.extractLicensePatterns(textNode.textContent);
      if (found.keys.length > 0) {
        found.keys.forEach(key => {
          licenses.push({
            productName: globalThis.LicenseVaultExtractors.extractProductName(node.closest('.deal-container') || node) || 'StackSocial Deal',
            licenseKey: key,
            source: 'stacksocial',
            extractedAt: new Date().toISOString()
          });
        });
      }
    });

    // Look for license keys in input fields and code blocks
    const inputs = node.querySelectorAll('input[type="text"], input[type="password"], textarea, code, pre');
    inputs.forEach(input => {
      const found = globalThis.LicenseVaultExtractors.extractLicensePatterns(input.value || input.textContent);
      if (found.keys.length > 0) {
        found.keys.forEach(key => {
          licenses.push({
            productName: globalThis.LicenseVaultExtractors.extractProductName(node.closest('.deal-container') || node) || 'StackSocial Deal',
            licenseKey: key,
            source: 'stacksocial',
            extractedAt: new Date().toISOString()
          });
        });
      }
    });

    // Look for license keys in StackSocial-specific elements
    const licenseElements = node.querySelectorAll('.license-key, .serial-key, .activation-code, [data-license]');
    licenseElements.forEach(element => {
      const found = globalThis.LicenseVaultExtractors.extractLicensePatterns(element.textContent);
      if (found.keys.length > 0) {
        found.keys.forEach(key => {
          licenses.push({
            productName: globalThis.LicenseVaultExtractors.extractProductName(element.closest('.deal-container') || element) || 'StackSocial Deal',
            licenseKey: key,
            source: 'stacksocial',
            extractedAt: new Date().toISOString()
          });
        });
      }
    });

    // Send found licenses to background script
    if (licenses.length > 0) {
      chrome.runtime.sendMessage({
        action: 'licensesFound',
        licenses: licenses,
        source: 'stacksocial'
      });
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