const fs = require('node:fs');
const path = require('node:path');

const apiScript = fs.readFileSync(path.join(__dirname, '..', 'lib', 'api.js'), 'utf8');
const backgroundScript = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
const appsumoScript = fs.readFileSync(path.join(__dirname, '..', 'content-scripts', 'appsumo.js'), 'utf8');

describe('EXT-02 purchase_date is YYYY-MM-DD', () => {
  describe('background normalizeLicense', () => {
    let listener;
    beforeEach(() => {
      global.chrome = {
        storage: { local: { get: vi.fn().mockResolvedValue({ apiBase: 'http://127.0.0.1:18765', apiToken: 't' }), set: vi.fn() } },
        runtime: { onInstalled: { addListener: vi.fn() }, onMessage: { addListener: vi.fn((fn) => { listener = fn; }) } },
        notifications: { create: vi.fn() },
        tabs: { query: vi.fn().mockResolvedValue([]), sendMessage: vi.fn() },
      };
      global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data: { imported: 1 } }) });
      global.importScripts = vi.fn();
      window.eval(apiScript);
      window.eval(backgroundScript);
    });
    afterEach(() => {
      delete global.chrome;
      delete global.fetch;
      delete global.importScripts;
    });

    async function sentDate(purchase_date) {
      fetch.mockClear();
      listener({ action: 'licensesScraped', site: 'appsumo', licenses: [{ product_name: 'P', license_key: 'K', purchase_date }] }, {}, vi.fn());
      await new Promise((r) => setTimeout(r, 0));
      const body = JSON.parse(JSON.parse(fetch.mock.calls[0][1].body).content);
      return body.licenses[0].purchase_date;
    }

    it('truncates a full ISO timestamp', async () => {
      expect(await sentDate('2024-03-15T10:20:30.000Z')).toBe('2024-03-15');
    });
    it('sends null for a bad date', async () => {
      expect(await sentDate('not a date')).toBeNull();
      expect(await sentDate('2024-02-31')).toBeNull();
    });
    it('keeps null as null', async () => {
      expect(await sentDate(null)).toBeNull();
    });
  });

  describe('appsumo content script', () => {
    async function scrape(dateText) {
      vi.useFakeTimers();
      document.body.innerHTML = `<div class="purchase-item"><h3>Tool</h3><span>Lifetime</span>
        <span class="purchase-date">${dateText}</span><code>KEY-1</code></div>`;
      delete window.__perpetuaInjected;
      const sendMessage = vi.fn().mockResolvedValue({ ok: true, imported: 0 });
      global.chrome = {
        runtime: { sendMessage, onMessage: { addListener: vi.fn() } },
        storage: { local: { set: vi.fn().mockResolvedValue(undefined) } },
      };
      window.eval(`(function (location) {\n${appsumoScript}\n})(window.location);`);
      await vi.advanceTimersByTimeAsync(3000);
      vi.useRealTimers();
      delete global.chrome;
      return sendMessage.mock.calls[0][0].licenses[0].purchase_date;
    }

    it('emits YYYY-MM-DD for a timestamp', async () => {
      expect(await scrape('2024-03-15T10:20:30.000Z')).toBe('2024-03-15');
    });
    it('emits null for a bad date', async () => {
      expect(await scrape('garbage')).toBeNull();
    });
    it('emits null when no date text is present', async () => {
      expect(await scrape('')).toBeNull();
    });
  });
});
