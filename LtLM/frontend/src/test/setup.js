import '@testing-library/jest-dom/vitest';

import { vi } from 'vitest';

vi.stubGlobal('alert', vi.fn());
vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn()
})));
