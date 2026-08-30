const fs = require('node:fs');
const path = require('node:path');

const optionsHtml = fs.readFileSync(path.join(__dirname, '..', 'options', 'options.html'), 'utf8');
const optionsScript = fs.readFileSync(path.join(__dirname, '..', 'options', 'options.js'), 'utf8');

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('browser extension options', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = optionsHtml;
    global.chrome = {
      storage: {
        sync: {
          get: vi.fn().mockResolvedValue({
            apiBase: 'http://localhost:3001',
            autoSync: true,
            notifyOnNewLicenses: true,
            connectedSites: [{ name: 'AppSumo', domain: 'appsumo.com' }]
          }),
          set: vi.fn().mockResolvedValue(undefined),
          remove: vi.fn().mockResolvedValue(undefined)
        }
      },
      tabs: {
        create: vi.fn()
      }
    };
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
    window.eval(optionsScript);
  });

  afterEach(() => {
    delete global.chrome;
    delete global.fetch;
  });

  it('loads the saved settings and persists updates', async () => {
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    expect(document.getElementById('apiBase').value).toBe('http://localhost:3001');
    expect(document.getElementById('connected-sites').textContent).toContain('AppSumo');

    document.getElementById('apiBase').value = 'http://localhost:4000';
    document.getElementById('settings-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    expect(chrome.storage.sync.set).toHaveBeenCalledWith({
      apiBase: 'http://localhost:4000',
      autoSync: true,
      notifyOnNewLicenses: true
    });
  });

  it('tests the backend connection from the options page', async () => {
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    document.getElementById('test-connection').click();
    await flush();

    expect(fetch).toHaveBeenCalledWith('http://localhost:3001/api/health');
    expect(document.getElementById('status').textContent).toContain('Connection successful');
  });
});
