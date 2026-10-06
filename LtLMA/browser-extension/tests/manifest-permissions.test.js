const fs = require('node:fs');
const path = require('node:path');

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
const background = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

// chrome.<api> -> permissions that satisfy it. chrome.tabs.query/sendMessage
// work without the "tabs" permission when activeTab or host permissions apply.
const API_PERMISSIONS = {
  notifications: ['notifications'],
  storage: ['storage'],
  tabs: ['tabs', 'activeTab'],
};

describe('manifest.json permissions vs background.js chrome.* usage', () => {
  const used = new Set([...background.matchAll(/chrome\.([a-zA-Z]+)/g)].map((m) => m[1]));

  it('uses the APIs this test knows about', () => {
    for (const api of Object.keys(API_PERMISSIONS)) {
      expect(used.has(api)).toBe(true);
    }
  });

  for (const [api, accepted] of Object.entries(API_PERMISSIONS)) {
    it(`covers chrome.${api}`, () => {
      expect(manifest.permissions.some((p) => accepted.includes(p))).toBe(true);
    });
  }

  it('declares notifications explicitly', () => {
    expect(manifest.permissions).toContain('notifications');
  });
});
