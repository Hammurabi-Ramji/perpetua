import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ProtectedRoute from './ProtectedRoute';

const authState = {
  isAuthenticated: true,
  loading: false
};

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => authState
}));

vi.mock('../MasterPasswordUnlock', () => ({
  default: () => <div>Unlock Station Screen</div>
}));

describe('ProtectedRoute', () => {
  beforeEach(() => {
    localStorage.clear();
    authState.isAuthenticated = true;
    authState.loading = false;
  });

  it('shows the unlock screen before checking auth when the station is locked', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<div>Secret Dashboard</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Unlock Station Screen')).toBeInTheDocument();
    expect(localStorage.getItem('intended_path')).toBe('/');
  });

  it('renders the protected content when unlocked and authenticated', () => {
    localStorage.setItem('station_unlocked', 'true');

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<div>Secret Dashboard</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Secret Dashboard')).toBeInTheDocument();
  });

  it('redirects unauthenticated users to login after unlock', () => {
    localStorage.setItem('station_unlocked', 'true');
    authState.isAuthenticated = false;

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<div>Secret Dashboard</div>} />
          </Route>
          <Route path="/login" element={<div>Login Screen</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Login Screen')).toBeInTheDocument();
  });
});
