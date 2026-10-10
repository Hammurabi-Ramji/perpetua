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

  it('refuses to save a non-loopback API URL (the token would be sent there)', async () => {
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    for (const bad of ['https://evil.example', 'http://10.0.0.5:18765', 'ftp://127.0.0.1', 'not a url']) {
      chrome.storage.local.set.mockClear();
      document.getElementById('apiBase').value = bad;
      document.getElementById('settings-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flush();
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
      expect(document.getElementById('status').textContent).toContain('point at this computer');
    }
  });

  it('normalises an accepted loopback URL to its origin', async () => {
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    document.getElementById('apiBase').value = 'http://localhost:18765/';
    document.getElementById('settings-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ apiBase: 'http://localhost:18765' }),
    );
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

  it('renders the token field as a password input', () => {
    expect(document.getElementById('apiToken').type).toBe('password');
  });

  it.each([
    'http://localhost:18765',
    'http://127.0.0.1:9000',
    'http://127.0.0.1:18765/'
  ])('accepts loopback apiBase %s on save', async (value) => {
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    document.getElementById('apiBase').value = value;
    document.getElementById('settings-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    expect(chrome.storage.local.set).toHaveBeenCalled();
    expect(chrome.storage.local.set.mock.calls[0][0].apiBase).toBe(new URL(value).origin);
  });

  it.each([
    'https://127.0.0.1:18765',
    'http://evil.example.com:18765',
    'http://127.0.0.1',
    'http://127.0.0.1.evil.com:18765',
    'http://user@127.0.0.1:18765',
    'http://127.0.0.1:18765/api',
    'ftp://localhost:21',
    'not a url',
    ''
  ])('rejects non-loopback apiBase %j on save and shows an error', async (value) => {
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    document.getElementById('apiBase').value = value;
    document.getElementById('settings-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    const status = document.getElementById('status');
    expect(status.className).toContain('error');
    expect(status.textContent).toContain('loopback');
  });

  it('refuses to test the connection against a non-loopback URL', async () => {
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    document.getElementById('apiBase').value = 'http://evil.example.com:80';
    document.getElementById('test-connection').click();
    await flush();

    expect(fetch).not.toHaveBeenCalled();
    expect(document.getElementById('status').className).toContain('error');
  });
});
