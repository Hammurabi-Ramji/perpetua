import { describe, expect, it, vi } from 'vitest';

describe('LicenseVaultProvider', () => {
  it('builds root categories from normalized license data', async () => {
    const { LicenseVaultProvider } = await import('../src/providers/LicenseVaultProvider');

    const provider = new LicenseVaultProvider({
      getLicenses: vi.fn().mockResolvedValue([
        { id: '1', productName: 'A', licenseKey: 'AAAA', status: 'active', source: 'appsumo', createdAt: '', updatedAt: '' },
        { id: '2', productName: 'B', licenseKey: 'BBBB', status: 'expired', source: 'appsumo', createdAt: '', updatedAt: '' },
        { id: '3', productName: 'C', licenseKey: 'CCCC', status: 'expiringSoon', source: 'appsumo', createdAt: '', updatedAt: '' }
      ])
    } as any);

    const items = await provider.getChildren();

    expect(items.map((item) => item.label)).toEqual([
      'Active Licenses',
      'Expiring Soon',
      'Expired Licenses'
    ]);
  });

  it('shows a login prompt when the service fails', async () => {
    const { LicenseVaultProvider } = await import('../src/providers/LicenseVaultProvider');

    const provider = new LicenseVaultProvider({
      getLicenses: vi.fn().mockRejectedValue(new Error('Not logged in'))
    } as any);

    const items = await provider.getChildren();

    expect(items[0].label).toBe('Not logged in');
    expect(items[0].contextValue).toBe('loginRequired');
  });
});
