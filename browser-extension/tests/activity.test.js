const fs = require('node:fs');
const path = require('node:path');

const activityScript = fs.readFileSync(path.join(__dirname, '..', 'lib', 'activity.js'), 'utf8');

describe('activity inference host matching', () => {
  beforeEach(() => {
    window.eval(activityScript);
  });

  it('stays silent unless the user opted in', () => {
    expect(globalThis.visitShouldReset(false, 'https://vendor.test/app', ['vendor.test'])).toBeNull();
    expect(globalThis.visitShouldReset(undefined, 'https://vendor.test/app', ['vendor.test'])).toBeNull();
  });

  it('returns only the hostname for a matching visit', () => {
    expect(
      globalThis.visitShouldReset(true, 'https://app.vendor.test/secret-path?q=1', ['https://www.vendor.test/login']),
    ).toBe('app.vendor.test');
  });

  it('ignores unrelated hosts', () => {
    expect(globalThis.visitShouldReset(true, 'https://notvendor.test/login', ['vendor.test'])).toBeNull();
    expect(globalThis.visitShouldReset(true, 'https://example.com/', ['vendor.test'])).toBeNull();
  });
});
