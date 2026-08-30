import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { ArrowLeft, Save, Trash2, ExternalLink, Calendar, Package } from 'lucide-react';

function LicenseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    product_name: '',
    license_key: '',
    purchase_date: '',
    expiry_date: '',
    product_url: '',
    notes: '',
    status: 'active'
  });

  const { data: license, isLoading } = useQuery({
    queryKey: ['license', id],
    queryFn: () => api.get(`/licenses/${id}`).then(r => r.data)
  });

  useEffect(() => {
    if (license) {
      setFormData({
        product_name: license.product_name || '',
        license_key: license.license_key || '',
        purchase_date: license.purchase_date ? license.purchase_date.split('T')[0] : '',
        expiry_date: license.expiry_date ? license.expiry_date.split('T')[0] : '',
        product_url: license.product_url || '',
        notes: license.notes || '',
        status: license.status || 'active'
      });
    }
  }, [license]);

  const updateMutation = useMutation({
    mutationFn: (data) => api.patch(`/licenses/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['licenses'] });
      queryClient.invalidateQueries({ queryKey: ['license', id] });
      setIsEditing(false);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/licenses/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['licenses'] });
      navigate('/licenses');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this license?')) {
      deleteMutation.mutate();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-400"></div>
      </div>
    );
  }

  if (!license) {
    return (
      <div className="text-center py-12">
        <Package className="w-16 h-16 text-gray-600 mx-auto mb-4" />
        <p className="text-gray-400">License not found</p>
        <button
          onClick={() => navigate('/licenses')}
          className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg"
        >
          Back to Licenses
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/licenses')}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Licenses
        </button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{license.product_name}</h1>
          <p className="text-gray-400">License Details</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            {isEditing ? 'Cancel' : 'Edit'}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* License Card */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        {isEditing ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-white font-medium mb-2">Product Name *</label>
                <input
                  type="text"
                  required
                  value={formData.product_name}
                  onChange={(e) => setFormData({...formData, product_name: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-white font-medium mb-2">License Key</label>
                <input
                  type="text"
                  value={formData.license_key}
                  onChange={(e) => setFormData({...formData, license_key: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-white font-medium mb-2">Purchase Date</label>
                <input
                  type="date"
                  value={formData.purchase_date}
                  onChange={(e) => setFormData({...formData, purchase_date: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-white font-medium mb-2">Expiry Date</label>
                <input
                  type="date"
                  value={formData.expiry_date}
                  onChange={(e) => setFormData({...formData, expiry_date: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-white font-medium mb-2">Product URL</label>
                <input
                  type="url"
                  value={formData.product_url}
                  onChange={(e) => setFormData({...formData, product_url: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-white font-medium mb-2">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({...formData, status: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                >
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-white font-medium mb-2">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                rows={4}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                placeholder="Additional notes about this license..."
              />
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="flex items-center gap-2 px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg"
              >
                <Save className="w-4 h-4" />
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-6 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">License Information</h3>
                <div className="space-y-3">
                  <div>
                    <span className="text-gray-400">Product:</span>
                    <p className="text-white font-medium">{license.product_name}</p>
                  </div>
                  {license.license_key && (
                    <div>
                      <span className="text-gray-400">License Key:</span>
                      <p className="text-white font-mono text-sm bg-gray-700 px-2 py-1 rounded mt-1">
                        {license.license_key}
                      </p>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-400">Status:</span>
                    <span className={`ml-2 px-2 py-1 rounded text-xs font-medium ${
                      license.status === 'active' ? 'bg-green-500/20 text-green-400' :
                      license.status === 'expired' ? 'bg-red-500/20 text-red-400' :
                      'bg-amber-500/20 text-amber-400'
                    }`}>
                      {license.status}
                    </span>
                  </div>
                  {license.source_site && (
                    <div>
                      <span className="text-gray-400">Source:</span>
                      <p className="text-white">{license.source_site}</p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4">Dates</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-400">Purchased:</span>
                    <span className="text-white">
                      {new Date(license.purchase_date).toLocaleDateString()}
                    </span>
                  </div>
                  {license.expiry_date && (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-400">Expires:</span>
                      <span className={`${
                        new Date(license.expiry_date) > new Date() ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {new Date(license.expiry_date).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* URLs */}
            {(license.product_url || license.redemption_url || license.download_url) && (
              <div>
                <h3 className="text-lg font-semibold mb-4">Links</h3>
                <div className="flex gap-3 flex-wrap">
                  {license.product_url && (
                    <a
                      href={license.product_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Product Page
                    </a>
                  )}
                  {license.redemption_url && (
                    <a
                      href={license.redemption_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Redeem License
                    </a>
                  )}
                  {license.download_url && (
                    <a
                      href={license.download_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Download
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Notes */}
            {license.notes && (
              <div>
                <h3 className="text-lg font-semibold mb-4">Notes</h3>
                <p className="text-gray-300 bg-gray-700 p-4 rounded-lg">{license.notes}</p>
              </div>
            )}

            {/* Action Required */}
            {license.action_required && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-amber-400 mb-2">Action Required</h3>
                <p className="text-amber-200">{license.action_description}</p>
                {license.action_deadline && (
                  <p className="text-amber-300 text-sm mt-2">
                    Deadline: {new Date(license.action_deadline).toLocaleDateString()}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default LicenseDetail;