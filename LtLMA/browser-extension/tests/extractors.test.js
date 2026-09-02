const fs = require('node:fs');
const path = require('node:path');

const extractorsScript = fs.readFileSync(path.join(__dirname, '..', 'lib', 'extractors.js'), 'utf8');

describe('LicenseVault extractors', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main></main>';
    window.eval(extractorsScript);
  });

  it('detects license pages, keys, and dates from page text', () => {
    const result = window.LicenseVaultExtractors.extractLicensePatterns(
      'Lifetime deal purchase on 2026-05-14 with key AAAA-BBBB-CCCC-DDDD ready to redeem.'
    );

    expect(result.isLicensePage).toBe(true);
    expect(result.keys).toContain('AAAA-BBBB-CCCC-DDDD');
    expect(result.dates).toContain('2026-05-14');
  });

  it('extracts a product name from the nearest heading', () => {
    document.body.innerHTML = `
      <section>
        <h1>Playwright License Suite</h1>
        <p>Activation code: AAAA-BBBB-CCCC-DDDD</p>
      </section>
    `;

    const productName = window.LicenseVaultExtractors.extractProductName(document.body);

    expect(productName).toBe('Playwright License Suite');
  });
});
