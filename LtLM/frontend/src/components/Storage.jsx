import React, { useState, useEffect } from 'react';
import axios from 'axios';

const Storage = () => {
  const [services, setServices] = useState([]);
  const [storageOverview, setStorageOverview] = useState(null);
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [syncLogs, setSyncLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    service_name: '',
    service_type: '',
    account_email: '',
    api_key: '',
    api_secret: '',
    access_token: '',
    refresh_token: '',
    base_url: '',
    webdav_url: '',
    enabled: true
  });

  useEffect(() => {
    loadServices();
    loadStorageOverview();
    loadSyncLogs();
  }, []);

  const loadServices = async () => {
    try {
      const response = await axios.get('/api/storage/services', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setServices(response.data);
    } catch (error) {
      console.error('Failed to load storage services:', error);
    }
  };

  const loadStorageOverview = async () => {
    try {
      const response = await axios.get('/api/storage/overview', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setStorageOverview(response.data);
    } catch (error) {
      console.error('Failed to load storage overview:', error);
    }
  };

  const loadSyncLogs = async () => {
    try {
      const response = await axios.get('/api/storage/logs?limit=20', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setSyncLogs(response.data);
    } catch (error) {
      console.error('Failed to load sync logs:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (editingService) {
        await axios.put(`/api/storage/services/${editingService.id}`, formData, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
      } else {
        await axios.post('/api/storage/services', formData, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
      }

      setShowConfigForm(false);
      setEditingService(null);
      resetForm();
      loadServices();
      loadStorageOverview();
    } catch (error) {
      console.error('Failed to save storage service:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      service_name: '',
      service_type: '',
      account_email: '',
      api_key: '',
      api_secret: '',
      access_token: '',
      refresh_token: '',
      base_url: '',
      webdav_url: '',
      enabled: true
    });
  };

  const editService = (service) => {
    setFormData({
      service_name: service.service_name,
      service_type: service.service_type,
      account_email: service.account_email || '',
      api_key: '',
      api_secret: '',
      access_token: '',
      refresh_token: '',
      base_url: service.base_url || '',
      webdav_url: service.webdav_url || '',
      enabled: service.enabled
    });
    setEditingService(service);
    setShowConfigForm(true);
  };

  const testConnection = async (serviceName) => {
    try {
      const response = await axios.post(`/api/storage/services/${serviceName}/test`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      alert(response.data.message || (response.data.success ? 'Connection successful!' : 'Connection failed'));
    } catch (error) {
      alert('Connection test failed: ' + error.response?.data?.error || error.message);
    }
  };

  const backupLicenses = async (serviceName, encrypted = false) => {
    try {
      const response = await axios.post('/api/storage/backup/licenses', {
        serviceName,
        encrypted
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      alert(`Backup created successfully on ${response.data.service}`);
      loadSyncLogs();
    } catch (error) {
      alert('Backup failed: ' + error.response?.data?.error || error.message);
    }
  };

  const getServiceIcon = (serviceName) => {
    switch (serviceName) {
      case 'koofr': return '🔗';
      case 'icedrive': return '🛡️';
      case 'degoo': return '📦';
      default: return '💾';
    }
  };

  const getServiceDescription = (serviceName) => {
    switch (serviceName) {
      case 'koofr': return 'Storage aggregator for multi-cloud coordination';
      case 'icedrive': return 'Encrypted vault for hardened archives';
      case 'degoo': return 'High-capacity storage for media and large files';
      default: return 'Cloud storage service';
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Cloud Storage</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Manage your multi-cloud storage ecosystem
          </p>
        </div>
        <button
          onClick={() => setShowConfigForm(true)}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          Add Storage Service
        </button>
      </div>

      {/* Storage Overview */}
      {storageOverview && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Storage Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {formatBytes(storageOverview.total.used)}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Used</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {formatBytes(storageOverview.total.available)}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Available</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-600">
                {storageOverview.total.limit > 0 ?
                  `${((storageOverview.total.used / storageOverview.total.limit) * 100).toFixed(1)}%` :
                  'Unlimited'
                }
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Usage</div>
            </div>
          </div>

          <div className="space-y-2">
            {storageOverview.services.map(service => (
              <div key={service.name} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded">
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">{getServiceIcon(service.name)}</span>
                  <div>
                    <div className="font-medium capitalize">{service.name}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {service.error ? `Error: ${service.error}` : `${formatBytes(service.used || 0)} used`}
                    </div>
                  </div>
                </div>
                <div className={`px-2 py-1 rounded text-xs ${
                  service.error ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                }`}>
                  {service.error ? 'Error' : 'Connected'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Configuration Form */}
      {showConfigForm && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">
            {editingService ? 'Edit Storage Service' : 'Add Storage Service'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Service</label>
                <select
                  value={formData.service_name}
                  onChange={(e) => {
                    const serviceName = e.target.value;
                    const serviceType = serviceName === 'koofr' ? 'aggregator' :
                                       serviceName === 'icedrive' ? 'encrypted_vault' : 'media_archive';
                    setFormData({
                      ...formData,
                      service_name: serviceName,
                      service_type: serviceType
                    });
                  }}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                  required
                >
                  <option value="">Select Service</option>
                  <option value="koofr">Koofr (Storage Aggregator)</option>
                  <option value="icedrive">IceDrive (Encrypted Vault)</option>
                  <option value="degoo">Degoo (Media Archive)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Account Email</label>
                <input
                  type="email"
                  value={formData.account_email}
                  onChange={(e) => setFormData({...formData, account_email: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
            </div>

            {formData.service_name === 'koofr' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">API Token</label>
                  <input
                    type="password"
                    value={formData.access_token}
                    onChange={(e) => setFormData({...formData, access_token: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                    placeholder="Koofr API token"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Base URL</label>
                    <input
                      type="url"
                      value={formData.base_url}
                      onChange={(e) => setFormData({...formData, base_url: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                      placeholder="https://app.koofr.net"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">WebDAV URL</label>
                    <input
                      type="url"
                      value={formData.webdav_url}
                      onChange={(e) => setFormData({...formData, webdav_url: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                      placeholder="https://webdav.koofr.net"
                    />
                  </div>
                </div>
              </div>
            )}

            {formData.service_name === 'icedrive' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">API Key</label>
                    <input
                      type="password"
                      value={formData.api_key}
                      onChange={(e) => setFormData({...formData, api_key: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                      placeholder="IceDrive API key"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">API Secret</label>
                    <input
                      type="password"
                      value={formData.api_secret}
                      onChange={(e) => setFormData({...formData, api_secret: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                      placeholder="IceDrive API secret"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Base URL</label>
                  <input
                    type="url"
                    value={formData.base_url}
                    onChange={(e) => setFormData({...formData, base_url: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                    placeholder="https://api.icerdrive.com/v1"
                  />
                </div>
              </div>
            )}

            {formData.service_name === 'degoo' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">API Key</label>
                    <input
                      type="password"
                      value={formData.api_key}
                      onChange={(e) => setFormData({...formData, api_key: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                      placeholder="Degoo API key"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">API Secret</label>
                    <input
                      type="password"
                      value={formData.api_secret}
                      onChange={(e) => setFormData({...formData, api_secret: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                      placeholder="Degoo API secret"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Base URL</label>
                  <input
                    type="url"
                    value={formData.base_url}
                    onChange={(e) => setFormData({...formData, base_url: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                    placeholder="https://api.degoo.com/v1"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={formData.enabled}
                onChange={(e) => setFormData({...formData, enabled: e.target.checked})}
                className="rounded"
              />
              <label className="text-sm">Enable this service</label>
            </div>

            <div className="flex space-x-4">
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
              >
                {loading ? 'Saving...' : (editingService ? 'Update Service' : 'Add Service')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfigForm(false);
                  setEditingService(null);
                  resetForm();
                }}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Services List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        {services.map(service => (
          <div key={service.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <div className="flex items-center space-x-3 mb-4">
              <span className="text-3xl">{getServiceIcon(service.service_name)}</span>
              <div>
                <h3 className="text-lg font-semibold capitalize">{service.service_name}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {getServiceDescription(service.service_name)}
                </p>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span>Status:</span>
                <span className={`px-2 py-1 rounded text-xs ${
                  service.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {service.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              {service.account_email && (
                <div className="flex justify-between text-sm">
                  <span>Email:</span>
                  <span className="truncate">{service.account_email}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span>Last Sync:</span>
                <span>{service.last_synced ? new Date(service.last_synced).toLocaleDateString() : 'Never'}</span>
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => testConnection(service.service_name)}
                className="flex-1 px-3 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
              >
                Test
              </button>
              <button
                onClick={() => editService(service)}
                className="px-3 py-2 bg-yellow-500 text-white text-sm rounded hover:bg-yellow-600"
              >
                Edit
              </button>
              <button
                onClick={() => backupLicenses(service.service_name)}
                className="px-3 py-2 bg-purple-500 text-white text-sm rounded hover:bg-purple-600"
                title="Backup licenses to this service"
              >
                Backup
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Sync Logs */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">Recent Sync Activity</h2>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {syncLogs.map(log => (
            <div key={log.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded">
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-1 rounded text-xs ${
                    log.status === 'success' ? 'bg-green-100 text-green-800' :
                    log.status === 'failed' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {log.status}
                  </span>
                  <span className="font-medium">{log.operation}</span>
                  <span className="text-sm text-gray-600 dark:text-gray-400 truncate">
                    {log.file_path}
                  </span>
                </div>
                {log.error_message && (
                  <div className="text-sm text-red-600 mt-1">{log.error_message}</div>
                )}
              </div>
              <div className="text-xs text-gray-500">
                {new Date(log.created_at).toLocaleString()}
              </div>
            </div>
          ))}
          {syncLogs.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No sync activity yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Storage;