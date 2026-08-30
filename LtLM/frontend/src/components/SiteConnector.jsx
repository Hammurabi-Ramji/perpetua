import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Trash2, Plus, RefreshCw } from 'lucide-react';
import { api } from '../services/api';

const SUPPORTED_SITES = [
  {
    id: 'appsumo',
    name: 'AppSumo',
    url: 'https://appsumo.com',
    description: 'Connect to sync lifetime deals and licenses',
    logo: '🛍️'
  },
  {
    id: 'producthunt',
    name: 'Product Hunt',
    url: 'https://www.producthunt.com',
    description: 'Sync deals and lifetime licenses',
    logo: '🔍'
  },
  {
    id: 'stacksocial',
    name: 'StackSocial',
    url: 'https://www.stacksocial.com',
    description: 'Connect to access your purchased licenses',
    logo: '📚'
  },
  {
    id: 'humblebundle',
    name: 'Humble Bundle',
    url: 'https://www.humblebundle.com',
    description: 'Sync your library and lifetime purchases',
    logo: '🎮'
  }
];

function SiteConnector() {
  const [connectingSite, setConnectingSite] = useState(null);
  const queryClient = useQueryClient();

  // Fetch connected sites from API
  const { data: connectedSites = [], isLoading } = useQuery({
    queryKey: ['connected-sites'],
    queryFn: async () => {
      const response = await api.get('/sites/connections');
      return response.data;
    }
  });

  const connectSiteMutation = useMutation({
    mutationFn: async (siteId) => {
      // For now, simulate connection with test credentials
      // In production, this would redirect to OAuth or show a form
      const response = await api.post(`/sites/${siteId}/connect`, {
        email: 'test@example.com',
        password: 'testpass'
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connected-sites'] });
      setConnectingSite(null);
    }
  });

  const disconnectSiteMutation = useMutation({
    mutationFn: async (siteId) => {
      const response = await api.delete(`/sites/${siteId}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connected-sites'] });
    }
  });

  const syncSiteMutation = useMutation({
    mutationFn: async (siteId) => {
      const response = await api.post(`/sites/${siteId}/sync`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connected-sites'] });
      queryClient.invalidateQueries({ queryKey: ['licenses'] });
    }
  });

  const handleConnect = (siteId) => {
    setConnectingSite(siteId);
    connectSiteMutation.mutate(siteId);
  };

  const handleDisconnect = (siteId) => {
    disconnectSiteMutation.mutate(siteId);
  };

  const handleSync = (siteId) => {
    syncSiteMutation.mutate(siteId);
  };

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
        <div>
          <h1 className="text-3xl font-bold">Site Connections</h1>
          <p className="text-gray-400 mt-2">
            Connect to deal sites to automatically sync your lifetime licenses
          </p>
        </div>
      </div>

      {/* Connected Sites */}
      {connectedSites.length > 0 && (
        <div className="bg-gray-800 rounded-lg border border-gray-700">
          <div className="p-6 border-b border-gray-700">
            <h2 className="text-xl font-semibold">Connected Sites</h2>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {connectedSites.map(site => {
                const siteInfo = SUPPORTED_SITES.find(s => s.id === site.id);
                return (
                  <div key={site.id} className="flex items-center justify-between p-4 bg-gray-700 rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center text-xl">
                        {siteInfo?.logo || '🔗'}
                      </div>
                      <div>
                        <h3 className="font-medium">{siteInfo?.name || site.id}</h3>
                        <p className="text-sm text-gray-400">{siteInfo?.description}</p>
                        <p className="text-xs text-green-400 mt-1">Connected</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleSync(site.id)}
                        disabled={syncSiteMutation.isPending}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-sm flex items-center gap-1"
                      >
                        <RefreshCw className={`w-4 h-4 ${syncSiteMutation.isPending ? 'animate-spin' : ''}`} />
                        Sync
                      </button>
                      <button
                        onClick={() => window.open(siteInfo?.url, '_blank')}
                        className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-sm flex items-center gap-1"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Visit
                      </button>
                      <button
                        onClick={() => handleDisconnect(site.id)}
                        disabled={disconnectSiteMutation.isPending}
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded text-sm flex items-center gap-1"
                      >
                        <Trash2 className="w-4 h-4" />
                        Disconnect
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Available Sites */}
      <div className="bg-gray-800 rounded-lg border border-gray-700">
        <div className="p-6 border-b border-gray-700">
          <h2 className="text-xl font-semibold">Available Sites</h2>
          <p className="text-gray-400 text-sm mt-1">
            Connect to these sites to automatically sync your licenses
          </p>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {SUPPORTED_SITES.map(site => {
              const isConnected = connectedSites.some(s => s.id === site.id);
              const isConnecting = connectingSite === site.id;

              return (
                <div key={site.id} className="p-6 bg-gray-700 rounded-lg border border-gray-600">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center text-lg">
                        {site.logo}
                      </div>
                      <div>
                        <h3 className="font-medium">{site.name}</h3>
                        <a
                          href={site.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1"
                        >
                          {site.url.replace('https://', '')}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                    {isConnected && (
                      <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                    )}
                  </div>

                  <p className="text-gray-400 text-sm mb-4">{site.description}</p>

                  <div className="flex gap-2">
                    {isConnected ? (
                      <button
                        onClick={() => handleSync(site.id)}
                        disabled={syncSiteMutation.isPending}
                        className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                      >
                        <RefreshCw className={`w-4 h-4 ${syncSiteMutation.isPending ? 'animate-spin' : ''}`} />
                        Sync Now
                      </button>
                    ) : (
                      <button
                        onClick={() => handleConnect(site.id)}
                        disabled={isConnecting || connectSiteMutation.isPending}
                        className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                      >
                        {isConnecting ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Connecting...
                          </>
                        ) : (
                          <>
                            <Plus className="w-4 h-4" />
                            Connect
                          </>
                        )}
                      </button>
                    )}

                    <button
                      onClick={() => window.open(site.url, '_blank')}
                      className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg text-sm font-medium"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Connection Instructions */}
      <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-400 mb-2">How to Connect</h3>
        <div className="text-gray-300 text-sm space-y-2">
          <p>1. Click "Connect" on any site above</p>
          <p>2. You'll be redirected to the site to authorize LicenseVault</p>
          <p>3. Grant permission to access your purchase history</p>
          <p>4. LicenseVault will automatically sync your lifetime licenses</p>
        </div>
      </div>
    </div>
  );
}

export default SiteConnector;