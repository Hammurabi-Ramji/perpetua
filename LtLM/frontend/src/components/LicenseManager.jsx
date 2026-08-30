import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { 
  Search, ExternalLink, 
  Calendar, AlertTriangle, Package,
  CheckSquare, Square, Trash2, Download, Tag
} from 'lucide-react';

function getStatusClasses(status) {
  switch (status) {
    case 'active':
      return 'bg-green-500/20 text-green-400';
    case 'expired':
      return 'bg-red-500/20 text-red-400';
    default:
      return 'bg-amber-500/20 text-amber-400';
  }
}

function LicenseManager() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedLicenses, setSelectedLicenses] = useState(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);

  const queryClient = useQueryClient();

  const { data: licenses } = useQuery({ 
    queryKey: ['licenses'], 
    queryFn: () => api.get('/licenses').then(r => r.data)
  });

  const deleteMutation = useMutation({
    mutationFn: (ids) => Promise.all(ids.map(id => api.delete(`/licenses/${id}`))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['licenses'] });
      setSelectedLicenses(new Set());
      setShowBulkActions(false);
    }
  });

  const filteredLicenses = licenses?.filter(license => {
    const matchesSearch = license.product_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || license.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleSelectLicense = (licenseId) => {
    const newSelected = new Set(selectedLicenses);
    if (newSelected.has(licenseId)) {
      newSelected.delete(licenseId);
    } else {
      newSelected.add(licenseId);
    }
    setSelectedLicenses(newSelected);
    setShowBulkActions(newSelected.size > 0);
  };

  const handleSelectAll = () => {
    if (selectedLicenses.size === filteredLicenses.length) {
      setSelectedLicenses(new Set());
      setShowBulkActions(false);
    } else {
      setSelectedLicenses(new Set(filteredLicenses.map(l => l.id)));
      setShowBulkActions(true);
    }
  };

  const handleBulkDelete = () => {
    if (window.confirm(`Delete ${selectedLicenses.size} selected licenses?`)) {
      deleteMutation.mutate(Array.from(selectedLicenses));
    }
  };

  const handleExport = () => {
    const selectedData = filteredLicenses.filter(l => selectedLicenses.has(l.id));
    const csvContent = [
      ['Product Name', 'License Key', 'Purchase Date', 'Expiry Date', 'Status', 'Source Site', 'Product URL', 'Notes'].join(','),
      ...selectedData.map(license => [
        `"${license.product_name}"`,
        `"${license.license_key || ''}"`,
        license.purchase_date ? new Date(license.purchase_date).toLocaleDateString() : '',
        license.expiry_date ? new Date(license.expiry_date).toLocaleDateString() : '',
        license.status,
        `"${license.source_site || ''}"`,
        `"${license.product_url || ''}"`,
        `"${license.notes || ''}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `licenses_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold text-white mb-2">License Manager</h1>
      <p className="text-gray-400 mb-6">Manage your lifetime licenses</p>

      {/* Bulk Actions */}
      {showBulkActions && (
        <div className="bg-purple-600/20 border border-purple-500/30 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-white font-medium">
                {selectedLicenses.size} license{selectedLicenses.size !== 1 ? 's' : ''} selected
              </span>
              <button
                onClick={handleSelectAll}
                className="text-purple-300 hover:text-purple-200 text-sm underline"
              >
                {selectedLicenses.size === filteredLicenses.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search licenses..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-10 pr-4 py-3 text-white focus:border-purple-500 focus:outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-purple-500 focus:outline-none"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {/* License Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredLicenses?.map(license => (
          <div
            key={license.id}
            className={`bg-gray-800/50 border border-gray-700 rounded-xl p-6 hover:bg-gray-800/70 transition-colors ${
              selectedLicenses.has(license.id) ? 'ring-2 ring-purple-500' : ''
            }`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-3 flex-1">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    handleSelectLicense(license.id);
                  }}
                  className="mt-1 text-gray-400 hover:text-white transition-colors"
                >
                  {selectedLicenses.has(license.id) ? (
                    <CheckSquare className="w-5 h-5" />
                  ) : (
                    <Square className="w-5 h-5" />
                  )}
                </button>
                <Link to={`/licenses/${license.id}`} className="flex-1 cursor-pointer">
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-1">{license.product_name}</h3>
                    <p className="text-gray-400 text-sm">{license.source_site}</p>
                  </div>
                </Link>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusClasses(license.status)}`}>
                {license.status}
              </span>
            </div>

            <div className="space-y-2 text-sm text-gray-400">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Purchased: {new Date(license.purchase_date).toLocaleDateString()}
              </div>
              
              {license.action_required && (
                <div className="flex items-center gap-2 text-amber-400">
                  <AlertTriangle className="w-4 h-4" />
                  {license.action_description}
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-4">
              <Link
                to={`/licenses/${license.id}`}
                className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                View Details
              </Link>
              {license.redemption_url && (
                <a
                  href={license.redemption_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="w-4 h-4" />
                  Redeem
                </a>
              )}
              
              {license.download_url && (
                <a
                  href={license.download_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  Download
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {filteredLicenses?.length === 0 && (
        <div className="text-center py-12">
          <Package className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">No licenses found</p>
        </div>
      )}
    </div>
  );
}

export default LicenseManager;