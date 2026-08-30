import React, { useState, useEffect } from 'react';
import axios from 'axios';

const Twidget = () => {
  const [apis, setApis] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingApi, setEditingApi] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    method: 'GET',
    path: '',
    type: 'license_query',
    filters: {},
    transformations: {}
  });

  useEffect(() => {
    loadApis();
  }, []);

  const loadApis = async () => {
    try {
      const response = await axios.get('/api/twidget/apis', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setApis(response.data);
    } catch (error) {
      console.error('Failed to load APIs:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const config = {
        type: formData.type,
        filters: formData.filters,
        transformations: formData.transformations
      };

      const apiData = {
        name: formData.name,
        description: formData.description,
        method: formData.method,
        path: formData.path,
        config
      };

      if (editingApi) {
        await axios.put(`/api/twidget/apis/${editingApi.id}`, apiData, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
      } else {
        await axios.post('/api/twidget/apis', apiData, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
      }

      setShowCreateForm(false);
      setEditingApi(null);
      resetForm();
      loadApis();
    } catch (error) {
      console.error('Failed to save API:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      method: 'GET',
      path: '',
      type: 'license_query',
      filters: {},
      transformations: {}
    });
  };

  const editApi = (api) => {
    setFormData({
      name: api.name,
      description: api.description || '',
      method: api.method,
      path: api.path,
      type: api.config.type,
      filters: api.config.filters || {},
      transformations: api.config.transformations || {}
    });
    setEditingApi(api);
    setShowCreateForm(true);
  };

  const deleteApi = async (apiId) => {
    if (window.confirm('Are you sure you want to delete this API?')) {
      try {
        await axios.delete(`/api/twidget/apis/${apiId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        loadApis();
      } catch (error) {
        console.error('Failed to delete API:', error);
      }
    }
  };

  const testApi = async (api) => {
    try {
      const response = await axios.post(`/api/twidget/execute/${api.id}`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      alert(`API Response: ${JSON.stringify(response.data, null, 2)}`);
    } catch (error) {
      alert(`API Error: ${error.response?.data?.error || error.message}`);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Twidget.io API Builder</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Visually design and deploy REST APIs for your license data
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          Create New API
        </button>
      </div>

      {showCreateForm && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">
            {editingApi ? 'Edit API' : 'Create New API'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Method</label>
                <select
                  value={formData.method}
                  onChange={(e) => setFormData({...formData, method: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Path</label>
              <input
                type="text"
                value={formData.path}
                onChange={(e) => setFormData({...formData, path: e.target.value})}
                placeholder="/api/my-endpoint"
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                rows="3"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">API Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({...formData, type: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
              >
                <option value="license_query">License Query</option>
                <option value="license_stats">License Statistics</option>
                <option value="custom_logic">Custom Logic</option>
              </select>
            </div>

            <div className="flex space-x-4">
              <button
                type="submit"
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
              >
                {editingApi ? 'Update API' : 'Create API'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setEditingApi(null);
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {apis.map(api => (
          <div key={api.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-semibold">{api.name}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{api.description}</p>
              </div>
              <span className={`px-2 py-1 text-xs rounded ${
                api.method === 'GET' ? 'bg-green-100 text-green-800' :
                api.method === 'POST' ? 'bg-blue-100 text-blue-800' :
                api.method === 'PUT' ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }`}>
                {api.method}
              </span>
            </div>

            <div className="mb-4">
              <code className="text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                {api.path}
              </code>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => testApi(api)}
                className="flex-1 px-3 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
              >
                Test
              </button>
              <button
                onClick={() => editApi(api)}
                className="px-3 py-2 bg-yellow-500 text-white text-sm rounded hover:bg-yellow-600"
              >
                Edit
              </button>
              <button
                onClick={() => deleteApi(api.id)}
                className="px-3 py-2 bg-red-500 text-white text-sm rounded hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {apis.length === 0 && !showCreateForm && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🔧</div>
          <h3 className="text-xl font-semibold mb-2">No APIs Created Yet</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Create your first API to expose your license data programmatically
          </p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Create Your First API
          </button>
        </div>
      )}
    </div>
  );
};

export default Twidget;