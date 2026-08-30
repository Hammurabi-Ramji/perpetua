import React, { useState } from 'react';
import { useLicenses } from '../hooks/useLicenses';
import { Package, AlertTriangle, CheckCircle, Clock, TrendingUp } from 'lucide-react';

function getLicenseStatusColor(license) {
  if (!license.expiry_date) return 'text-green-400';
  return new Date(license.expiry_date) > new Date() ? 'text-green-400' : 'text-red-400';
}

function getLicenseStatusText(license) {
  if (!license.expiry_date) return 'Lifetime';
  return new Date(license.expiry_date) > new Date() ? 'Active' : 'Expired';
}

function Dashboard() {
  const { licenses, isLoading, addLicense, isAddingLicense } = useLicenses();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLicense, setNewLicense] = useState({
    product_name: '',
    license_key: '',
    purchase_date: '',
    product_url: ''
  });

  const handleAddLicense = (e) => {
    e.preventDefault();
    addLicense(newLicense);
    setNewLicense({
      product_name: '',
      license_key: '',
      purchase_date: '',
      product_url: ''
    });
    setShowAddModal(false);
  };

  const stats = React.useMemo(() => {
    if (!licenses) return { total: 0, active: 0, expiring: 0, expired: 0 };

    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    return {
      total: licenses.length,
      active: licenses.filter(l => !l.expiry_date || new Date(l.expiry_date) > now).length,
      expiring: licenses.filter(l =>
        l.expiry_date &&
        new Date(l.expiry_date) > now &&
        new Date(l.expiry_date) <= thirtyDaysFromNow
      ).length,
      expired: licenses.filter(l => l.expiry_date && new Date(l.expiry_date) <= now).length
    };
  }, [licenses]);

  const recentLicenses = licenses?.slice(0, 5) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-400"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="text-sm text-gray-400">
          Welcome to LicenseVault - Your lifetime license manager
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Total Licenses</p>
              <p className="text-3xl font-bold text-white">{stats.total}</p>
            </div>
            <Package className="w-8 h-8 text-blue-400" />
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Active Licenses</p>
              <p className="text-3xl font-bold text-green-400">{stats.active}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-400" />
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Expiring Soon</p>
              <p className="text-3xl font-bold text-yellow-400">{stats.expiring}</p>
            </div>
            <Clock className="w-8 h-8 text-yellow-400" />
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Expired</p>
              <p className="text-3xl font-bold text-red-400">{stats.expired}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
        </div>
      </div>

      {/* Recent Licenses */}
      <div className="bg-gray-800 rounded-lg border border-gray-700">
        <div className="p-6 border-b border-gray-700">
          <h2 className="text-xl font-semibold">Recent Licenses</h2>
        </div>
        <div className="p-6">
          {recentLicenses.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No licenses found</p>
              <p className="text-sm">Connect sites or add licenses manually to get started</p>
            </div>
          ) : (
            <div className="space-y-4">
              {recentLicenses.map(license => (
                <div key={license.id} className="flex items-center justify-between p-4 bg-gray-700 rounded-lg">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
                      <Package className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-medium">{license.product_name}</h3>
                      <p className="text-sm text-gray-400">
                        {license.license_key ? `${license.license_key.substring(0, 20)}...` : 'No key'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-medium ${getLicenseStatusColor(license)}`}>
                      {getLicenseStatusText(license)}
                    </div>
                    {license.expiry_date && (
                      <div className="text-xs text-gray-400">
                        {new Date(license.expiry_date).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button 
            onClick={() => setShowAddModal(true)}
            className="p-4 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <Package className="w-6 h-6" />
              <div>
                <div className="font-medium">Add License</div>
                <div className="text-sm text-purple-200">Manually add a new license</div>
              </div>
            </div>
          </button>

          <button className="p-4 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-left">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-6 h-6" />
              <div>
                <div className="font-medium">Connect Site</div>
                <div className="text-sm text-blue-200">Sync from deal sites</div>
              </div>
            </div>
          </button>

          <button className="p-4 bg-green-600 hover:bg-green-700 rounded-lg transition-colors text-left">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6" />
              <div>
                <div className="font-medium">View All</div>
                <div className="text-sm text-green-200">Browse all licenses</div>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Add License Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-xl font-semibold mb-4">Add New License</h3>
            <form onSubmit={handleAddLicense} className="space-y-4">
              <div>
                <label htmlFor="product_name" className="block text-sm font-medium mb-1">Product Name *</label>
                <input
                  id="product_name"
                  type="text"
                  required
                  value={newLicense.product_name}
                  onChange={(e) => setNewLicense({...newLicense, product_name: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>
              <div>
                <label htmlFor="license_key" className="block text-sm font-medium mb-1">License Key</label>
                <input
                  id="license_key"
                  type="text"
                  value={newLicense.license_key}
                  onChange={(e) => setNewLicense({...newLicense, license_key: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>
              <div>
                <label htmlFor="purchase_date" className="block text-sm font-medium mb-1">Purchase Date</label>
                <input
                  id="purchase_date"
                  type="date"
                  value={newLicense.purchase_date}
                  onChange={(e) => setNewLicense({...newLicense, purchase_date: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>
              <div>
                <label htmlFor="product_url" className="block text-sm font-medium mb-1">Product URL</label>
                <input
                  id="product_url"
                  type="url"
                  value={newLicense.product_url}
                  onChange={(e) => setNewLicense({...newLicense, product_url: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingLicense}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded disabled:opacity-50"
                >
                  {isAddingLicense ? 'Adding...' : 'Add License'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;