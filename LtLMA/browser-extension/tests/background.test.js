const fs = require('node:fs');
const path = require('node:path');

const apiScript = fs.readFileSync(path.join(__dirname, '..', 'lib', 'api.js'), 'utf8');
const backgroundScript = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

// A macrotask flush (not a fixed number of microtask ticks) — the chain
// under test here nests several async functions deep (getConfig -> fetch ->
// response.json() -> importLicenses -> handleScraped -> sendResponse), and a
// setTimeout callback only runs after the *entire* microtask queue has
// drained, regardless of how deep that chain is.
async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

let messageListener;

describe('background service worker', () => {
  beforeEach(() => {
    global.chrome = {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            apiBase: 'http://127.0.0.1:18765',
            apiToken: 'test-token',
            notifyOnNewLicenses: true,
          }),
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
      runtime: {
        onInstalled: { addListener: vi.fn() },
        onMessage: {
          addListener: vi.fn((fn) => {
            messageListener = fn;
          }),
        },
      },
      notifications: { create: vi.fn() },
      tabs: { query: vi.fn().mockResolvedValue([]), sendMessage: vi.fn() },
    };
    global.fetch = vi.fn();
    // background.js is a classic (non-module) service worker script that
    // pulls lib/api.js in via importScripts — stub it as a no-op since we
    // eval both scripts into the same global scope below instead.
    global.importScripts = vi.fn();

    window.eval(apiScript);
    window.eval(backgroundScript);
  });

  afterEach(() => {
    delete global.chrome;
    delete global.fetch;
    delete global.importScripts;
    messageListener = undefined;
  });

  it('POSTs a correctly-shaped /api/vault/import body for a licensesScraped message', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse(200, { success: true, data: { total_rows: 1, imported: 1, skipped_duplicates: 0 } }),
    );

    const sendResponse = vi.fn();
    const keepChannelOpen = messageListener(
      { action: 'licensesScraped', site: 'appsumo', licenses: [{ product_name: 'Suite Pro', license_key: 'ABCD-1234' }] },
      {},
      sendResponse,
    );
    expect(keepChannelOpen).toBe(true);
    await flush();

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:18765/api/vault/import');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-token');

    const requestBody = JSON.parse(init.body);
    expect(requestBody.format).toBe('json');
    const content = JSON.parse(requestBody.content);
    expect(content.licenses).toEqual([
      {
        product_name: 'Suite Pro',
        license_key: 'ABCD-1234',
        purchase_date: null,
        status: 'active',
        source_site: 'appsumo',
        product_url: null,
        redemption_url: null,
      },
    ]);

    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, imported: 1, total_rows: 1 }),
    );
  });

  it('filters out entries missing license_key or product_name before syncing, without calling fetch for an empty valid set', async () => {
    const sendResponse = vi.fn();
    messageListener(
      {
        action: 'licensesScraped',
        site: 'appsumo',
        licenses: [{ product_name: 'No Key Here' }, { license_key: 'NO-NAME-1234' }],
      },
      {},
      sendResponse,
    );
    await flush();

    expect(fetch).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, imported: 0, skippedInvalid: 2 }),
    );
  });

  it('reports zero synced (never partial) on a 402 free-tier cap response', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse(402, { success: false, message: 'Free plan stores up to 3 licenses. Unlock Pro to add more.' }),
    );

    const sendResponse = vi.fn();
    messageListener(
      { action: 'licensesScraped', site: 'appsumo', licenses: [{ product_name: 'X', license_key: 'Y' }] },
      {},
      sendResponse,
    );
    await flush();

    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'free_limit_reached' });
    expect(chrome.notifications.create).toHaveBeenCalled();
  });

  it('surfaces a re-paste-token message on a 401 rather than throwing unhandled', async () => {
    global.fetch.mockResolvedValue(jsonResponse(401, { success: false, message: 'Invalid or expired token' }));

    const sendResponse = vi.fn();
    messageListener(
      { action: 'licensesScraped', site: 'appsumo', licenses: [{ product_name: 'X', license_key: 'Y' }] },
      {},
      sendResponse,
    );
    await flush();

    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, error: expect.stringContaining('fresh one') }),
    );
  });

  it('calls GET /api/licenses for a getLicenses message', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse(200, { success: true, data: [{ id: 1, product_name: 'Suite Pro' }] }),
    );

    const sendResponse = vi.fn();
    messageListener({ action: 'getLicenses' }, {}, sendResponse);
    await flush();

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:18765/api/licenses');
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(sendResponse).toHaveBeenCalledWith({ ok: true, licenses: [{ id: 1, product_name: 'Suite Pro' }] });
  });
});
