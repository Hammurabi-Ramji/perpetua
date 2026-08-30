import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Dashboard from './Dashboard';

const useLicensesMock = vi.fn();

vi.mock('../hooks/useLicenses', () => ({
  useLicenses: () => useLicensesMock()
}));

describe('Dashboard', () => {
  const licenses = [
    {
      id: 1,
      product_name: 'Suite Active',
      license_key: 'AAAA-BBBB-CCCC-DDDD',
      purchase_date: '2026-01-01',
      expiry_date: '2099-01-01'
    },
    {
      id: 2,
      product_name: 'Suite Expiring',
      license_key: 'EEEE-FFFF-GGGG-HHHH',
      purchase_date: '2026-01-02',
      expiry_date: '2026-05-20'
    },
    {
      id: 3,
      product_name: 'Suite Expired',
      license_key: 'IIII-JJJJ-KKKK-LLLL',
      purchase_date: '2024-01-01',
      expiry_date: '2024-02-01'
    }
  ];

  beforeEach(() => {
    useLicensesMock.mockReturnValue({
      licenses,
      isLoading: false,
      addLicense: vi.fn(),
      isAddingLicense: false
    });
  });

  it('shows computed dashboard stats from the license list', () => {
    render(<Dashboard />);

    expect(screen.getByText('Total Licenses')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getAllByText('1')).toHaveLength(2);
    expect(screen.getByText('Suite Active')).toBeInTheDocument();
  });

  it('opens the add-license modal and submits a new license', async () => {
    const user = userEvent.setup();
    const addLicense = vi.fn();

    useLicensesMock.mockReturnValue({
      licenses: [],
      isLoading: false,
      addLicense,
      isAddingLicense: false
    });

    render(<Dashboard />);

    await user.click(screen.getByRole('button', { name: /Add License/i }));
    await user.type(screen.getByLabelText('Product Name *'), 'Playwright Suite');
    await user.type(screen.getByLabelText('License Key'), 'MMMM-NNNN-OOOO-PPPP');
    await user.type(screen.getByLabelText('Product URL'), 'https://example.com/suite');
    await user.click(screen.getByRole('button', { name: 'Add License' }));

    await waitFor(() => {
      expect(addLicense).toHaveBeenCalledWith({
        product_name: 'Playwright Suite',
        license_key: 'MMMM-NNNN-OOOO-PPPP',
        purchase_date: '',
        product_url: 'https://example.com/suite'
      });
    });
  });
});
