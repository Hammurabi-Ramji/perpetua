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
        local: {
          get: vi.fn().mockResolvedValue({
            apiBase: 'http://127.0.0.1:18765',
            apiToken: 'stored-token',
            autoSync: true,
            notifyOnNewLicenses: true
          }),
          set: vi.fn().mockResolvedValue(undefined),
          remove: vi.fn().mockResolvedValue(undefined)
        }
      }
    };
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
    window.eval(optionsScript);
  });

  afterEach(() => {
    delete global.chrome;
    delete global.fetch;
  });

  it('loads saved settings from local (not sync) storage', async () => {
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    expect(chrome.storage.local.get).toHaveBeenCalled();
    expect(document.getElementById('apiBase').value).toBe('http://127.0.0.1:18765');
    expect(document.getElementById('apiToken').value).toBe('stored-token');
  });

  it('saves the pasted token to local storage on submit', async () => {
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    document.getElementById('apiBase').value = 'http://127.0.0.1:18765';
    document.getElementById('apiToken').value = 'new-token';
    document.getElementById('settings-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      apiBase: 'http://127.0.0.1:18765',
      apiToken: 'new-token',
      autoSync: true,
      notifyOnNewLicenses: true
    });
  });

  it('clears the token from local storage', async () => {
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    document.getElementById('clear-token-button').click();
    await flush();

    expect(chrome.storage.local.remove).toHaveBeenCalledWith('apiToken');
    expect(document.getElementById('apiToken').value).toBe('');
  });

  it('tests the backend connection from the options page', async () => {
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    document.getElementById('test-connection').click();
    await flush();

    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:18765/api/health');
    expect(document.getElementById('status').textContent).toContain('Connection successful');
  });
});
