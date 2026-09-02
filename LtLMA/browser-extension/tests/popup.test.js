const fs = require('node:fs');
const path = require('node:path');

const popupHtml = fs.readFileSync(path.join(__dirname, '..', 'popup', 'popup.html'), 'utf8');
const popupScript = fs.readFileSync(path.join(__dirname, '..', 'popup', 'popup.js'), 'utf8');

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('browser extension popup', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = popupHtml;
    global.chrome = {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({ apiToken: 'popup-token' })
        }
      },
      runtime: {
        sendMessage: vi.fn(async (message) => {
          if (message.action === 'getLicenses') {
            return {
              ok: true,
              licenses: [
                { id: 1, product_name: 'Suite Active', source_site: 'appsumo', status: 'active' }
              ]
            };
          }
          return { ok: true };
        }),
        openOptionsPage: vi.fn()
      }
    };
    vi.stubGlobal('close', vi.fn());
    window.eval(popupScript);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete global.chrome;
  });

  it('shows authenticated content and recent licenses', async () => {
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    expect(document.getElementById('auth-status').textContent).toBe('Authenticated');
    expect(document.getElementById('authenticated-content').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('licenses-list').textContent).toContain('Suite Active');
    expect(document.getElementById('licenses-list').textContent).toContain('appsumo');
  });

  it('opens settings from the popup action button', async () => {
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    document.getElementById('settings').click();

    expect(chrome.runtime.openOptionsPage).toHaveBeenCalled();
  });

  it('shows the login prompt with no token stored', async () => {
    chrome.storage.local.get = vi.fn().mockResolvedValue({});
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    expect(document.getElementById('auth-status').textContent).toBe('Not authenticated');
    expect(document.getElementById('login-prompt').classList.contains('hidden')).toBe(false);
  });
});
