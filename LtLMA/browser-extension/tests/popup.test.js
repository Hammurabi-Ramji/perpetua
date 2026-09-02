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
        sync: {
          get: vi.fn().mockResolvedValue({ jwtToken: 'popup-token' })
        }
      },
      runtime: {
        sendMessage: vi.fn(async (message) => {
          if (message.action === 'getLicenses') {
            return [
              { id: 1, product_name: 'Suite Active', vendor: 'AppSumo', status: 'active', action_required: false }
            ];
          }
          return undefined;
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
  });

  it('opens settings from the popup action button', async () => {
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    document.getElementById('settings').click();

    expect(chrome.runtime.openOptionsPage).toHaveBeenCalled();
  });
});
