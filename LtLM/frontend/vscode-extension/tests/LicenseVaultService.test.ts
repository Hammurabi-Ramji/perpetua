import { beforeEach, describe, expect, it, vi } from 'vitest';
import { workspace } from 'vscode';

const apiMock = {
  interceptors: {
    request: { use: vi.fn() }
  },
  post: vi.fn(),
  get: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn()
};

const workspaceGetConfiguration = vi.fn(() => ({
  get: vi.fn((_key: string, fallback: string) => fallback)
}));

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => apiMock),
    isAxiosError: (error: any) => Boolean(error?.isAxiosError)
  },
  isAxiosError: (error: any) => Boolean(error?.isAxiosError)
}));

describe('LicenseVaultService', () => {
  const update = vi.fn();
  const get = vi.fn();
  const context = {
    globalState: {
      update,
      get
    }
  } as any;

  beforeEach(() => {
    apiMock.post.mockReset();
    apiMock.get.mockReset();
    apiMock.patch.mockReset();
    apiMock.delete.mockReset();
    apiMock.interceptors.request.use.mockClear();
    workspace.getConfiguration = workspaceGetConfiguration as any;
    workspaceGetConfiguration.mockClear();
    update.mockReset();
    get.mockReset();
  });

  it('stores the token on login and normalizes backend license payloads', async () => {
    const { LicenseVaultService } = await import('../src/services/LicenseVaultService');

    apiMock.post.mockResolvedValueOnce({ data: { token: 'jwt-token' } });
    apiMock.get.mockResolvedValueOnce({
      data: [
        {
          id: 1,
          product_name: 'Suite Active',
          license_key: 'AAAA-BBBB-CCCC-DDDD',
          expiry_date: '2099-01-01',
          source_site: 'appsumo',
          status: 'active',
          created_at: '2026-01-01',
          updated_at: '2026-01-02'
        }
      ]
    });

    const service = new LicenseVaultService(context);
    await expect(service.login('suite@example.com', 'Secret123!')).resolves.toBe(true);
    await expect(service.getLicenses()).resolves.toEqual([
      {
        id: '1',
        productName: 'Suite Active',
        licenseKey: 'AAAA-BBBB-CCCC-DDDD',
        expiryDate: '2099-01-01',
        source: 'appsumo',
        status: 'active',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-02'
      }
    ]);

    expect(update).toHaveBeenCalledWith('licensevault.jwtToken', 'jwt-token');
  });

  it('uses PATCH for updates and searches licenses client-side', async () => {
    const { LicenseVaultService } = await import('../src/services/LicenseVaultService');

    get.mockReturnValue('stored-token');
    apiMock.patch.mockResolvedValueOnce({ data: { success: true } });
    apiMock.get.mockResolvedValueOnce({
      data: [
        {
          id: 2,
          product_name: 'Searchable License',
          license_key: 'EEEE-FFFF-GGGG-HHHH',
          source_site: 'producthunt',
          status: 'active'
        }
      ]
    });

    const service = new LicenseVaultService(context);
    await service.updateLicense('2', { status: 'expired' });
    const matches = await service.searchLicenses('searchable');

    expect(apiMock.patch).toHaveBeenCalledWith('/api/licenses/2', { status: 'expired' });
    expect(matches).toHaveLength(1);
    expect(matches[0].productName).toBe('Searchable License');
  });
});
