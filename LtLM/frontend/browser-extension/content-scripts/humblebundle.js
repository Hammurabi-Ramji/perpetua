// content-scripts/humblebundle.js

class HumbleBundleExtractor {
  constructor() {
    this.init();
  }

  init() {
    // Check if we're on a Humble Bundle product page
    if (globalThis.location.hostname === 'www.humblebundle.com' && globalThis.location.pathname.includes('/downloads')) {
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
            productName: globalThis.LicenseVaultExtractors.extractProductName(node.closest('.game-download') || node) || 'Humble Bundle Game',
            licenseKey: key,
            source: 'humblebundle',
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
            productName: globalThis.LicenseVaultExtractors.extractProductName(node.closest('.game-download') || node) || 'Humble Bundle Game',
            licenseKey: key,
            source: 'humblebundle',
            extractedAt: new Date().toISOString()
          });
        });
      }
    });

    // Look for Humble Bundle specific license elements
    const licenseElements = node.querySelectorAll('.keyfield, .redeem-code, .serial-number, [data-key]');
    licenseElements.forEach(element => {
      const found = globalThis.LicenseVaultExtractors.extractLicensePatterns(element.textContent);
      if (found.keys.length > 0) {
        found.keys.forEach(key => {
          licenses.push({
            productName: globalThis.LicenseVaultExtractors.extractProductName(element.closest('.game-download') || element) || 'Humble Bundle Game',
            licenseKey: key,
            source: 'humblebundle',
            extractedAt: new Date().toISOString()
          });
        });
      }
    });

    // Look for license keys in download sections
    const downloadSections = node.querySelectorAll('.download-section, .game-download, .software-download');
    downloadSections.forEach(section => {
      const found = globalThis.LicenseVaultExtractors.extractLicensePatterns(section.textContent);
      if (found.keys.length > 0) {
        found.keys.forEach(key => {
          licenses.push({
            productName: globalThis.LicenseVaultExtractors.extractProductName(section) || 'Humble Bundle Game',
            licenseKey: key,
            source: 'humblebundle',
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
        source: 'humblebundle'
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
const extractor = new HumbleBundleExtractor();