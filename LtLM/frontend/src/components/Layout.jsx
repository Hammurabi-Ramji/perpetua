import React from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { 
  Home, Package, Link as LinkIcon, 
  Bell, LogOut, Shield, Bot, Wrench, Hammer, Cloud, Code 
} from 'lucide-react';

function Layout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/', icon: Home, label: 'Dashboard' },
    { path: '/licenses', icon: Package, label: 'Licenses' },
    { path: '/sites', icon: LinkIcon, label: 'Sites' },
    { path: '/reminders', icon: Bell, label: 'Reminders' },
    { path: '/greta', icon: Bot, label: 'Greta AI' },
    { path: '/twidget', icon: Wrench, label: 'Twidget.io' },
    { path: '/pickaxe', icon: Hammer, label: 'Pickaxe AI' },
    { path: '/storage', icon: Cloud, label: 'Cloud Storage' },
    { path: '/eduba', icon: Code, label: 'Eduba Code Vault' }
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-purple-400" />
            <h1 className="text-2xl font-bold">LicenseVault</h1>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <nav className="w-64 bg-gray-800 border-r border-gray-700 p-6">
          <ul className="space-y-2">
            {navItems.map(item => (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className="flex items-center gap-3 px-4 py-3 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Main Content */}
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default Layout;