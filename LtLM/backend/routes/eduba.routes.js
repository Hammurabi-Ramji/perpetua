const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../auth/middleware');
const edubaScribe = require('../services/eduba-scribe.service');
const edubaKiln = require('../services/eduba-kiln.service');
const edubaLabyrinth = require('../services/eduba-labyrinth.service');

// Apply authentication to all routes
router.use(authenticateToken);

// === EDUBA CODE VAULT ROUTES ===

// Get all repositories for user
router.get('/repositories', async (req, res) => {
  try {
    const repositories = await edubaScribe.listRepositories(req.user.id);
    res.json(repositories);
  } catch (error) {
    console.error('Failed to get repositories:', error);
    res.status(500).json({ error: 'Failed to retrieve repositories' });
  }
});

// Create new repository
router.post('/repositories', async (req, res) => {
  try {
    const { name, description, path } = req.body;

    if (!name || !path) {
      return res.status(400).json({ error: 'Repository name and path are required' });
    }

    // Check for honey traps before creating repository
    const trapCheck = await edubaLabyrinth.checkHoneyTraps(req.user.id, 'repository_creation', {
      repositoryName: name,
      repositoryPath: path
    });

    if (trapCheck.triggered) {
      return res.status(403).json({
        error: 'Access denied - security protocol activated',
        decoy: trapCheck.decoyData
      });
    }

    const repository = await edubaScribe.initializeRepository(
      req.user.id,
      name,
      description,
      path
    );

    res.status(201).json(repository);
  } catch (error) {
    console.error('Failed to create repository:', error);
    res.status(500).json({ error: 'Failed to create repository' });
  }
});

// Get specific repository
router.get('/repositories/:id', async (req, res) => {
  try {
    const repository = await edubaScribe.getRepository(req.params.id);

    if (!repository || repository.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    res.json(repository);
  } catch (error) {
    console.error('Failed to get repository:', error);
    res.status(500).json({ error: 'Failed to retrieve repository' });
  }
});

// Create commit in repository
router.post('/repositories/:id/commits', async (req, res) => {
  try {
    const { message, authorName, branchName } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Commit message is required' });
    }

    // Verify repository ownership
    const repository = await edubaScribe.getRepository(req.params.id);
    if (!repository || repository.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    const commit = await edubaScribe.createCommit(
      req.params.id,
      message,
      authorName,
      branchName
    );

    res.status(201).json(commit);
  } catch (error) {
    console.error('Failed to create commit:', error);
    res.status(500).json({ error: 'Failed to create commit' });
  }
});

// Get commits for repository
router.get('/repositories/:id/commits', async (req, res) => {
  try {
    const limit = Number.parseInt(req.query.limit) || 50;

    // Verify repository ownership
    const repository = await edubaScribe.getRepository(req.params.id);
    if (!repository || repository.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    const commits = await edubaScribe.getCommits(req.params.id, limit);
    res.json(commits);
  } catch (error) {
    console.error('Failed to get commits:', error);
    res.status(500).json({ error: 'Failed to retrieve commits' });
  }
});

// === THE KILN - ARTIFACT SEALING ROUTES ===

// Seal artifact from commit
router.post('/repositories/:id/artifacts', async (req, res) => {
  try {
    const { commitId, artifactName, artifactType, buildMetadata } = req.body;

    if (!commitId || !artifactName || !artifactType) {
      return res.status(400).json({ error: 'Commit ID, artifact name, and type are required' });
    }

    // Verify repository ownership
    const repository = await edubaScribe.getRepository(req.params.id);
    if (!repository || repository.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    const artifact = await edubaKiln.sealArtifact(
      req.params.id,
      commitId,
      artifactName,
      artifactType,
      buildMetadata || {}
    );

    res.status(201).json(artifact);
  } catch (error) {
    console.error('Failed to seal artifact:', error);
    res.status(500).json({ error: 'Failed to seal artifact' });
  }
});

// Get artifacts for repository
router.get('/repositories/:id/artifacts', async (req, res) => {
  try {
    // Verify repository ownership
    const repository = await edubaScribe.getRepository(req.params.id);
    if (!repository || repository.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    const artifacts = await edubaKiln.listArtifacts(req.params.id);
    res.json(artifacts);
  } catch (error) {
    console.error('Failed to get artifacts:', error);
    res.status(500).json({ error: 'Failed to retrieve artifacts' });
  }
});

// Get specific artifact
router.get('/artifacts/:id', async (req, res) => {
  try {
    const artifact = await edubaKiln.getArtifact(req.params.id);

    if (!artifact) {
      return res.status(404).json({ error: 'Artifact not found' });
    }

    // Verify repository ownership through artifact
    const repository = await edubaScribe.getRepository(artifact.repository_id);
    if (!repository || repository.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Artifact not found' });
    }

    res.json(artifact);
  } catch (error) {
    console.error('Failed to get artifact:', error);
    res.status(500).json({ error: 'Failed to retrieve artifact' });
  }
});

// Export artifact (air-gapped)
router.post('/artifacts/:id/export', async (req, res) => {
  try {
    const { exportPath } = req.body;

    if (!exportPath) {
      return res.status(400).json({ error: 'Export path is required' });
    }

    const artifact = await edubaKiln.getArtifact(req.params.id);

    if (!artifact) {
      return res.status(404).json({ error: 'Artifact not found' });
    }

    // Verify repository ownership
    const repository = await edubaScribe.getRepository(artifact.repository_id);
    if (!repository || repository.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Artifact not found' });
    }

    const exportResult = await edubaKiln.exportArtifact(req.params.id, exportPath);

    res.json({
      success: true,
      message: 'Artifact exported successfully',
      path: exportResult
    });
  } catch (error) {
    console.error('Failed to export artifact:', error);
    res.status(500).json({ error: 'Failed to export artifact' });
  }
});

// Prepare artifact for replication
router.post('/artifacts/:id/replicate', async (req, res) => {
  try {
    const { replicationKey } = req.body;

    if (!replicationKey) {
      return res.status(400).json({ error: 'Replication key is required' });
    }

    const artifact = await edubaKiln.getArtifact(req.params.id);

    if (!artifact) {
      return res.status(404).json({ error: 'Artifact not found' });
    }

    // Verify repository ownership
    const repository = await edubaScribe.getRepository(artifact.repository_id);
    if (!repository || repository.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Artifact not found' });
    }

    const replicationData = await edubaKiln.prepareForReplication(req.params.id, replicationKey);

    res.json(replicationData);
  } catch (error) {
    console.error('Failed to prepare replication:', error);
    res.status(500).json({ error: 'Failed to prepare replication' });
  }
});

// === HYPERDIMENSIONAL CONTEXT SEARCH ===

// Helper function to search commits
async function searchCommits(query, repositories, repositoryId) {
  const results = [];
  for (const repo of repositories) {
    if (repositoryId && repo.id !== Number.parseInt(repositoryId)) {
      continue;
    }

    const commits = await edubaScribe.getCommits(repo.id, 100);
    for (const commit of commits) {
      if (commit.commit_message.toLowerCase().includes(query.toLowerCase())) {
        results.push({
          id: `commit-${commit.id}`,
          type: 'commit',
          repository: repo.name,
          context_name: commit.commit_message,
          context_type: 'commit',
          context_description: `Commit in ${repo.name}`,
          code_snippet: commit.commit_message,
          repository_id: repo.id
        });
      }
    }
  }
  return results;
}

// Helper function to search artifacts
async function searchArtifacts(query, repositories, repositoryId) {
  const results = [];
  for (const repo of repositories) {
    if (repositoryId && repo.id !== Number.parseInt(repositoryId)) {
      continue;
    }

    const artifacts = await edubaKiln.listArtifacts(repo.id);
    for (const artifact of artifacts) {
      if (artifact.artifact_name.toLowerCase().includes(query.toLowerCase())) {
        results.push({
          id: `artifact-${artifact.id}`,
          type: 'artifact',
          repository: repo.name,
          context_name: artifact.artifact_name,
          context_type: 'artifact',
          context_description: `Sealed artifact in ${repo.name}`,
          code_snippet: `Version ${artifact.version} - ${artifact.artifact_type}`,
          repository_id: repo.id
        });
      }
    }
  }
  return results;
}

// Semantic search across all repositories
router.get('/search', async (req, res) => {
  try {
    const { q: query, repositoryId } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    // For now, implement basic text search
    // In a full implementation, this would use semantic embeddings
    const repositories = await edubaScribe.listRepositories(req.user.id);

    const [commitResults, artifactResults] = await Promise.all([
      searchCommits(query, repositories, repositoryId),
      searchArtifacts(query, repositories, repositoryId)
    ]);

    const searchResults = [...commitResults, ...artifactResults];

    // Limit results
    const limitedResults = searchResults.slice(0, 50);

    res.json(limitedResults);
  } catch (error) {
    console.error('Failed to perform search:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// === THE LABYRINTH - HONEY TRAP MANAGEMENT ===

// Get honey trap statistics
router.get('/security/stats', async (req, res) => {
  try {
    const stats = await edubaLabyrinth.getTrapStatistics(req.user.id);
    res.json(stats);
  } catch (error) {
    console.error('Failed to get security stats:', error);
    res.status(500).json({ error: 'Failed to retrieve security statistics' });
  }
});

// Initialize labyrinth defenses
router.post('/security/initialize', async (req, res) => {
  try {
    const defenses = await edubaLabyrinth.initializeDefenses(req.user.id);
    res.json(defenses);
  } catch (error) {
    console.error('Failed to initialize defenses:', error);
    res.status(500).json({ error: 'Failed to initialize security defenses' });
  }
});

// Check for active honey traps (internal use)
router.post('/security/check-traps', async (req, res) => {
  try {
    const { accessType, context } = req.body;
    const trapCheck = await edubaLabyrinth.checkHoneyTraps(req.user.id, accessType, context);

    if (trapCheck.triggered) {
      res.json({
        triggered: true,
        message: 'Security protocol activated',
        decoy: trapCheck.decoyData
      });
    } else {
      res.json({ triggered: false });
    }
  } catch (error) {
    console.error('Failed to check traps:', error);
    res.status(500).json({ error: 'Security check failed' });
  }
});

module.exports = router;