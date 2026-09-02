// lib/extractors.js - Shared across all content scripts

window.LicenseVaultExtractors = {
  // Generic patterns that work across most sites
  extractLicensePatterns(text) {
    const patterns = {
      // License key formats
      keyPatterns: [
        /[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/, // XXXX-XXXX-XXXX-XXXX
        /[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}/, // Steam-style
        /[A-Z0-9]{16,24}/, // Single block
        /[a-zA-Z0-9]{32}/, // API keys
      ],

      // Date patterns
      datePatterns: [
        /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/,
        /(\d{4})-(\d{2})-(\d{2})/,
        /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i
      ],

      // Product indicators
      productIndicators: [
        /(license|key|activation|redeem|code)/i,
        /(lifetime| LTD)/i,
        /(purchase|order|transaction)/i
      ]
    };

    const found = {
      keys: [],
      dates: [],
      isLicensePage: false
    };

    // Check if this is a license-related page
    found.isLicensePage = patterns.productIndicators.some(p => p.test(text));

    // Extract potential keys
    patterns.keyPatterns.forEach(p => {
      const matches = text.match(new RegExp(p, 'g'));
      if (matches) found.keys.push(...matches);
    });

    // Extract dates
    patterns.datePatterns.forEach(p => {
      const matches = text.match(p);
      if (matches) found.dates.push(matches[0]);
    });

    return found;
  },

  // Smart product name extraction
  extractProductName(element) {
    const selectors = [
      'h1', 'h2', '.product-title', '.deal-title',
      '[class*="product"]', '[class*="title"]',
      'img[alt]' // Often has product name in alt
    ];

    for (const selector of selectors) {
      const el = element.querySelector(selector);
      if (el) {
        const text = el.textContent?.trim() || el.alt?.trim();
        if (text && text.length > 2) return text;
      }
    }

    // Fallback: find largest text in container
    const text = element.innerText || '';
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5);
    return lines[0] || 'Unknown Product';
  }
};