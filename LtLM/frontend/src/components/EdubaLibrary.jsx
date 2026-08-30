import React, { useState, useEffect } from 'react';
import axios from 'axios';

const EdubaLibrary = () => {
  const [repositories, setRepositories] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [commits, setCommits] = useState([]);
  const [artifacts, setArtifacts] = useState([]);
  const [semanticIndex, setSemanticIndex] = useState([]);
  const [showCreateRepo, setShowCreateRepo] = useState(false);
  const [showSealArtifact, setShowSealArtifact] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  const [newRepo, setNewRepo] = useState({
    name: '',
    description: '',
    path: ''
  });

  const [sealForm, setSealForm] = useState({
    commitId: '',
    artifactName: '',
    artifactType: 'wasm',
    version: '1.0.0'
  });

  useEffect(() => {
    loadRepositories();
  }, []);

  const loadRepositories = async () => {
    try {
      const response = await axios.get('/api/eduba/repositories', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setRepositories(response.data);
    } catch (error) {
      console.error('Failed to load repositories:', error);
    }
  };

  const loadRepositoryDetails = async (repoId) => {
    try {
      setLoading(true);
      const [repoResponse, commitsResponse, artifactsResponse] = await Promise.all([
        axios.get(`/api/eduba/repositories/${repoId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }),
        axios.get(`/api/eduba/repositories/${repoId}/commits`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }),
        axios.get(`/api/eduba/repositories/${repoId}/artifacts`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        })
      ]);

      setSelectedRepo(repoResponse.data);
      setCommits(commitsResponse.data);
      setArtifacts(artifactsResponse.data);
    } catch (error) {
      console.error('Failed to load repository details:', error);
    } finally {
      setLoading(false);
    }
  };

  const createRepository = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      await axios.post('/api/eduba/repositories', newRepo, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      setShowCreateRepo(false);
      setNewRepo({ name: '', description: '', path: '' });
      loadRepositories();
    } catch (error) {
      console.error('Failed to create repository:', error);
    } finally {
      setLoading(false);
    }
  };

  const createCommit = async (repoId, message) => {
    try {
      setLoading(true);
      await axios.post(`/api/eduba/repositories/${repoId}/commits`, { message }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      loadRepositoryDetails(repoId);
    } catch (error) {
      console.error('Failed to create commit:', error);
    } finally {
      setLoading(false);
    }
  };

  const sealArtifact = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      await axios.post(`/api/eduba/repositories/${selectedRepo.id}/artifacts`, sealForm, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      setShowSealArtifact(false);
      setSealForm({ commitId: '', artifactName: '', artifactType: 'wasm', version: '1.0.0' });
      loadRepositoryDetails(selectedRepo.id);
    } catch (error) {
      console.error('Failed to seal artifact:', error);
    } finally {
      setLoading(false);
    }
  };

  const performSemanticSearch = async () => {
    if (!searchQuery.trim()) return;

    try {
      const response = await axios.get('/api/eduba/search', {
        params: { q: searchQuery },
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setSearchResults(response.data);
    } catch (error) {
      console.error('Failed to perform semantic search:', error);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const getArtifactIcon = (type) => {
    switch (type) {
      case 'wasm': return '🕸️';
      case 'binary': return '⚙️';
      case 'library': return '📚';
      case 'module': return '📦';
      default: return '🔒';
    }
  };

  const getCommitIcon = (status) => {
    return status === 'sealed' ? '🔒' : '📝';
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <span className="text-4xl">🏛️</span>
            Eduba Code Vault & Library
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Sovereign version control and artifact management system
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowCreateRepo(true)}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Create Repository
          </button>
          {selectedRepo && (
            <button
              onClick={() => setShowSealArtifact(true)}
              className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600"
            >
              Seal Artifact
            </button>
          )}
        </div>
      </div>

      {/* Semantic Search */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <span>🔍</span>
          Hyperdimensional Context Search
        </h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && performSemanticSearch()}
            placeholder="Search across all sovereign code..."
            className="flex-1 px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
          />
          <button
            onClick={performSemanticSearch}
            className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
          >
            Search
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className="mt-4 space-y-3">
            {searchResults.map(result => (
              <div key={result.id} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{result.context_name}</span>
                  <span className="text-sm text-gray-500">{result.context_type}</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  {result.context_description}
                </p>
                <code className="text-xs bg-gray-200 dark:bg-gray-600 p-2 rounded block">
                  {result.code_snippet}
                </code>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Repository List */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Code Vault</h2>
            <div className="space-y-3">
              {repositories.map(repo => (
                <div
                  key={repo.id}
                  onClick={() => loadRepositoryDetails(repo.id)}
                  className={`p-4 rounded-lg cursor-pointer transition-colors ${
                    selectedRepo?.id === repo.id
                      ? 'bg-blue-100 dark:bg-blue-900 border-2 border-blue-500'
                      : 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">{repo.name}</h3>
                    {repo.is_sealed && <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">Sealed</span>}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    {repo.description}
                  </p>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{repo.commit_count || 0} commits</span>
                    <span>{repo.artifact_count || 0} artifacts</span>
                  </div>
                </div>
              ))}
              {repositories.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No repositories yet. Create your first sovereign vault.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Repository Details */}
        <div className="lg:col-span-2">
          {selectedRepo ? (
            <div className="space-y-6">
              {/* Repository Header */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                      <span>📚</span>
                      {selectedRepo.name}
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                      {selectedRepo.description}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-500">Forge Manifest</div>
                    <code className="text-xs bg-gray-100 dark:bg-gray-700 p-2 rounded">
                      {selectedRepo.forge_manifest?.substring(0, 16)}...
                    </code>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-blue-600">{commits.length}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Commits</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">{artifacts.length}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Artifacts</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-purple-600">
                      {selectedRepo.is_sealed ? 'Sealed' : 'Active'}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Status</div>
                  </div>
                </div>
              </div>

              {/* Commits */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <span>📜</span>
                  The Scribe - Commit Ledger
                </h3>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {commits.map(commit => (
                    <div key={commit.id} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span>{getCommitIcon(commit.status)}</span>
                            <code className="text-sm font-mono bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded">
                              {commit.commit_hash?.substring(0, 12)}
                            </code>
                          </div>
                          <p className="font-medium">{commit.commit_message}</p>
                          <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {commit.file_count} files • {commit.commit_size_bytes} bytes
                          </div>
                        </div>
                        <div className="text-right text-sm text-gray-500">
                          <div>{formatDate(commit.commit_timestamp)}</div>
                          <div>{commit.author_name}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {commits.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      No commits yet. Make your first sovereign commit.
                    </div>
                  )}
                </div>
              </div>

              {/* Artifacts */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <span>🔒</span>
                  The Kiln - Sealed Artifacts
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {artifacts.map(artifact => (
                    <div key={artifact.id} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-2xl">{getArtifactIcon(artifact.artifact_type)}</span>
                        <div>
                          <h4 className="font-medium">{artifact.artifact_name}</h4>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            v{artifact.version} • {artifact.artifact_type}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 mb-2">
                        Genesis Seal: {artifact.forge_manifest?.substring(0, 16)}...
                      </div>
                      <div className="text-xs text-gray-500">
                        Sealed: {formatDate(artifact.sealed_at)}
                      </div>
                    </div>
                  ))}
                  {artifacts.length === 0 && (
                    <div className="col-span-full text-center py-8 text-gray-500">
                      No sealed artifacts yet. Seal your first sovereign artifact.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 text-center">
              <div className="text-6xl mb-4">🏛️</div>
              <h3 className="text-xl font-semibold mb-2">Select a Repository</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Choose a repository from the vault to view its sovereign history and artifacts.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Create Repository Modal */}
      {showCreateRepo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold mb-4">Create Sovereign Repository</h3>
            <form onSubmit={createRepository}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Repository Name</label>
                  <input
                    type="text"
                    value={newRepo.name}
                    onChange={(e) => setNewRepo({...newRepo, name: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea
                    value={newRepo.description}
                    onChange={(e) => setNewRepo({...newRepo, description: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                    rows="3"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Local Path</label>
                  <input
                    type="text"
                    value={newRepo.path}
                    onChange={(e) => setNewRepo({...newRepo, path: e.target.value})}
                    placeholder="/path/to/repository"
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                    required
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                >
                  {loading ? 'Creating...' : 'Create Repository'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateRepo(false)}
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Seal Artifact Modal */}
      {showSealArtifact && selectedRepo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span>🔒</span>
              Seal Artifact (Genesis Seal v1.4)
            </h3>
            <form onSubmit={sealArtifact}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Commit</label>
                  <select
                    value={sealForm.commitId}
                    onChange={(e) => setSealForm({...sealForm, commitId: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                    required
                  >
                    <option value="">Select Commit</option>
                    {commits.map(commit => (
                      <option key={commit.id} value={commit.id}>
                        {commit.commit_message} ({commit.commit_hash?.substring(0, 8)})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Artifact Name</label>
                  <input
                    type="text"
                    value={sealForm.artifactName}
                    onChange={(e) => setSealForm({...sealForm, artifactName: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Artifact Type</label>
                  <select
                    value={sealForm.artifactType}
                    onChange={(e) => setSealForm({...sealForm, artifactType: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                  >
                    <option value="wasm">WebAssembly (WASM)</option>
                    <option value="binary">Native Binary</option>
                    <option value="library">Library</option>
                    <option value="module">Module</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Version</label>
                  <input
                    type="text"
                    value={sealForm.version}
                    onChange={(e) => setSealForm({...sealForm, version: e.target.value})}
                    placeholder="1.0.0"
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                    required
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50"
                >
                  {loading ? 'Sealing...' : 'Seal Artifact'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSealArtifact(false)}
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default EdubaLibrary;