const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { getDatabase } = require('../database');

class EdubaScribe {
  constructor() {
    this.db = getDatabase();
    this.algorithm = 'sha3-256'; // Sovereign hashing algorithm
  }

  /**
   * Initialize a new Eduba repository (The Vault)
   * @param {number} userId - User ID
   * @param {string} name - Repository name
   * @param {string} description - Repository description
   * @param {string} localPath - Local path for the repository
   * @returns {Promise<Object>} Repository data
   */
  async initializeRepository(userId, name, description, localPath) {
    try {
      // Generate encryption key for the repository
      const encryptionKey = crypto.randomBytes(32).toString('hex');

      // Create repository directory if it doesn't exist
      await fs.mkdir(localPath, { recursive: true });

      // Initialize .eduba directory structure
      const edubaPath = path.join(localPath, '.eduba');
      await fs.mkdir(edubaPath, { recursive: true });

      // Create initial forge manifest
      const forgeManifest = this.generateForgeManifest([]);

      const repository = await this.runQuery(
        `INSERT INTO eduba_repositories
         (user_id, name, description, repository_path, encryption_key_id, forge_manifest)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, name, description, localPath, encryptionKey, forgeManifest]
      );

      // Create initial commit (empty repository state)
      await this.createInitialCommit(repository.lastID);

      return {
        id: repository.lastID,
        name,
        description,
        path: localPath,
        encryptionKey,
        forgeManifest
      };
    } catch (error) {
      console.error('Failed to initialize Eduba repository:', error);
      throw error;
    }
  }

  /**
   * Create initial commit for a new repository
   * @param {number} repositoryId - Repository ID
   * @returns {Promise<Object>} Commit data
   */
  async createInitialCommit(repositoryId) {
    const commitHash = this.generateCommitHash([], 'Initial repository state');
    const forgeManifest = this.generateForgeManifest([]);

    return await this.runQuery(
      `INSERT INTO eduba_commits
       (repository_id, commit_hash, commit_message, forge_manifest, file_count, commit_size_bytes)
       VALUES (?, ?, ?, ?, 0, 0)`,
      [repositoryId, commitHash, 'Initial repository state', forgeManifest]
    );
  }

  /**
   * Create a new commit from current working directory
   * @param {number} repositoryId - Repository ID
   * @param {string} message - Commit message
   * @param {string} authorName - Author name (anonymous by default)
   * @param {string} branchName - Branch name
   * @returns {Promise<Object>} Commit data
   */
  async createCommit(repositoryId, message, authorName = 'Anonymous Scribe', branchName = 'main') {
    try {
      // Get repository info
      const repo = await this.runQuery(
        'SELECT * FROM eduba_repositories WHERE id = ?',
        [repositoryId],
        true
      );

      if (!repo) {
        throw new Error('Repository not found');
      }

      // Get current working directory files
      const files = await this.scanWorkingDirectory(repo.repository_path);

      // Generate file hashes and metadata
      const fileData = [];
      let totalSize = 0;

      for (const file of files) {
        const content = await fs.readFile(file.path);
        const fileHash = crypto.createHash(this.algorithm).update(content).digest('hex');

        fileData.push({
          path: file.relativePath,
          hash: fileHash,
          size: file.size,
          mimeType: this.getMimeType(file.relativePath),
          isBinary: this.isBinaryFile(file.relativePath)
        });

        totalSize += file.size;
      }

      // Generate commit hash
      const commitHash = this.generateCommitHash(fileData, message);

      // Generate forge manifest
      const forgeManifest = this.generateForgeManifest(fileData);

      // Get parent commit
      const parentCommit = await this.runQuery(
        'SELECT commit_hash FROM eduba_commits WHERE repository_id = ? ORDER BY id DESC LIMIT 1',
        [repositoryId],
        true
      );

      // Insert commit
      const commit = await this.runQuery(
        `INSERT INTO eduba_commits
         (repository_id, commit_hash, parent_commit_hash, author_name, commit_message,
          forge_manifest, file_count, commit_size_bytes, branch_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [repositoryId, commitHash, parentCommit?.commit_hash || null, authorName, message,
         forgeManifest, fileData.length, totalSize, branchName]
      );

      // Insert file records
      for (const file of fileData) {
        await this.runQuery(
          `INSERT INTO eduba_files
           (commit_id, file_path, file_hash, file_size_bytes, mime_type, is_binary)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [commit.lastID, file.path, file.hash, file.size, file.mimeType, file.isBinary]
        );

        // Update semantic index
        await this.updateSemanticIndex(commit.lastID, file);
      }

      // Update repository forge manifest
      await this.runQuery(
        'UPDATE eduba_repositories SET forge_manifest = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [forgeManifest, repositoryId]
      );

      return {
        id: commit.lastID,
        hash: commitHash,
        message,
        fileCount: fileData.length,
        totalSize,
        forgeManifest
      };
    } catch (error) {
      console.error('Failed to create commit:', error);
      throw error;
    }
  }

  /**
   * Scan working directory for files to commit
   * @param {string} repoPath - Repository path
   * @returns {Promise<Array>} Array of file objects
   */
  async scanWorkingDirectory(repoPath) {
    const files = [];
    const edubaPath = path.join(repoPath, '.eduba');

    async function scanDir(dirPath) {
      const items = await fs.readdir(dirPath, { withFileTypes: true });

      for (const item of items) {
        const fullPath = path.join(dirPath, item.name);
        const relativePath = path.relative(repoPath, fullPath);

        // Skip .eduba directory and hidden files
        if (relativePath.startsWith('.eduba') || item.name.startsWith('.')) {
          continue;
        }

        if (item.isDirectory()) {
          await scanDir(fullPath);
        } else if (item.isFile()) {
          const stats = await fs.stat(fullPath);
          files.push({
            path: fullPath,
            relativePath,
            size: stats.size,
            mtime: stats.mtime
          });
        }
      }
    }

    await scanDir(repoPath);
    return files;
  }

  /**
   * Generate commit hash using SHA-3-256
   * @param {Array} files - File data array
   * @param {string} message - Commit message
   * @returns {string} Commit hash
   */
  generateCommitHash(files, message) {
    const hash = crypto.createHash(this.algorithm);
    hash.update(message);

    // Sort files by path for consistent hashing
    files.sort((a, b) => a.path.localeCompare(b.path));

    for (const file of files) {
      hash.update(file.path);
      hash.update(file.hash);
    }

    return hash.digest('hex');
  }

  /**
   * Generate forge manifest (Genesis Seal)
   * @param {Array} files - File data array
   * @returns {string} Forge manifest hash
   */
  generateForgeManifest(files) {
    const hash = crypto.createHash(this.algorithm);

    // Sort files for consistent manifest generation
    files.sort((a, b) => a.path.localeCompare(b.path));

    for (const file of files) {
      hash.update(file.path);
      hash.update(file.hash);
      hash.update(file.size.toString());
    }

    return hash.digest('hex');
  }

  /**
   * Update semantic index for code intelligence
   * @param {number} commitId - Commit ID
   * @param {Object} file - File data
   */
  async updateSemanticIndex(commitId, file) {
    // This is a simplified semantic indexing
    // In a full implementation, this would use AST parsing and AI embeddings
    const semanticHash = crypto.createHash(this.algorithm)
      .update(file.path)
      .update(file.hash)
      .digest('hex');

    const contextType = this.inferContextType(file.path);
    const contextName = path.basename(file.path, path.extname(file.path));

    await this.runQuery(
      `INSERT INTO eduba_semantic_index
       (file_id, semantic_hash, context_type, context_name, tags)
       VALUES (?, ?, ?, ?, ?)`,
      [commitId, semanticHash, contextType, contextName, JSON.stringify(['code'])]
    );
  }

  /**
   * Infer context type from file path
   * @param {string} filePath - File path
   * @returns {string} Context type
   */
  inferContextType(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
      case '.js':
      case '.ts':
      case '.jsx':
      case '.tsx':
        return 'javascript';
      case '.py':
        return 'python';
      case '.rs':
        return 'rust';
      case '.java':
        return 'java';
      case '.cpp':
      case '.cc':
      case '.cxx':
        return 'cpp';
      case '.c':
        return 'c';
      case '.go':
        return 'go';
      case '.php':
        return 'php';
      case '.rb':
        return 'ruby';
      case '.html':
        return 'html';
      case '.css':
        return 'css';
      case '.json':
        return 'json';
      case '.md':
        return 'markdown';
      default:
        return 'file';
    }
  }

  /**
   * Get MIME type from file extension
   * @param {string} filePath - File path
   * @returns {string} MIME type
   */
  getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    const mimeTypes = {
      '.js': 'application/javascript',
      '.ts': 'application/typescript',
      '.jsx': 'application/javascript',
      '.tsx': 'application/typescript',
      '.py': 'text/x-python',
      '.rs': 'text/rust',
      '.java': 'text/x-java-source',
      '.cpp': 'text/x-c++src',
      '.c': 'text/x-csrc',
      '.go': 'text/x-go',
      '.php': 'application/x-php',
      '.rb': 'text/x-ruby',
      '.html': 'text/html',
      '.css': 'text/css',
      '.json': 'application/json',
      '.md': 'text/markdown',
      '.txt': 'text/plain'
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Check if file is binary
   * @param {string} filePath - File path
   * @returns {boolean} True if binary
   */
  isBinaryFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico',
                             '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.zip',
                             '.tar', '.gz', '.exe', '.dll', '.so', '.dylib'];

    return binaryExtensions.includes(ext);
  }

  /**
   * Get repository commits
   * @param {number} repositoryId - Repository ID
   * @param {number} limit - Maximum number of commits
   * @returns {Promise<Array>} Array of commits
   */
  async getCommits(repositoryId, limit = 50) {
    return await this.runQuery(
      `SELECT c.*, COUNT(f.id) as file_count
       FROM eduba_commits c
       LEFT JOIN eduba_files f ON c.id = f.commit_id
       WHERE c.repository_id = ?
       GROUP BY c.id
       ORDER BY c.commit_timestamp DESC
       LIMIT ?`,
      [repositoryId, limit],
      false,
      true
    );
  }

  /**
   * Get repository information
   * @param {number} repositoryId - Repository ID
   * @returns {Promise<Object>} Repository data
   */
  async getRepository(repositoryId) {
    return await this.runQuery(
      'SELECT * FROM eduba_repositories WHERE id = ?',
      [repositoryId],
      true
    );
  }

  /**
   * List user repositories
   * @param {number} userId - User ID
   * @returns {Promise<Array>} Array of repositories
   */
  async listRepositories(userId) {
    return await this.runQuery(
      `SELECT r.*,
       (SELECT COUNT(*) FROM eduba_commits WHERE repository_id = r.id) as commit_count,
       (SELECT COUNT(*) FROM eduba_artifacts WHERE repository_id = r.id) as artifact_count
       FROM eduba_repositories r
       WHERE r.user_id = ?
       ORDER BY r.updated_at DESC`,
      [userId],
      false,
      true
    );
  }

  /**
   * Run database query
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @param {boolean} single - Return single result
   * @param {boolean} all - Return all results
   * @returns {Promise} Query result
   */
  runQuery(sql, params = [], single = false, all = false) {
    return new Promise((resolve, reject) => {
      if (single) {
        this.db.get(sql, params, (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      } else if (all) {
        this.db.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      } else {
        this.db.run(sql, params, function(err) {
          if (err) reject(err);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      }
    });
  }
}

module.exports = new EdubaScribe();