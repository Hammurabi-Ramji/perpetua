import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Login from './Login';

const loginMock = vi.fn();
const registerMock = vi.fn();
const navigateMock = vi.fn();

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    login: loginMock,
    register: registerMock
  })
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock
  };
});

describe('Login', () => {
  beforeEach(() => {
    loginMock.mockReset();
    registerMock.mockReset();
    navigateMock.mockReset();
  });

  it('logs in and redirects to the dashboard', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Email'), 'suite@example.com');
    await user.type(screen.getByPlaceholderText('Your password'), 'Secret123!');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(loginMock).toHaveBeenCalledWith({
      email: 'suite@example.com',
      password: 'Secret123!',
      masterKey: ''
    });
    expect(navigateMock).toHaveBeenCalledWith('/');
  });

  it('switches to registration mode and submits the master key', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    await user.click(screen.getAllByRole('button', { name: 'Register' })[0]);
    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    await user.type(screen.getByPlaceholderText('Your password'), 'Secret123!');
    await user.type(screen.getByLabelText('Master Key'), 'vault-key');
    await user.click(screen.getByRole('button', { name: 'Create Account' }));

    expect(registerMock).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'Secret123!',
      masterKey: 'vault-key'
    });
  });
});
