const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { getDatabase } = require('../database');

class EdubaKiln {
  constructor() {
    this.db = getDatabase();
    this.algorithm = 'sha3-256';
    this.genesisSealVersion = '1.4';
  }

  /**
   * Seal a commit into an immutable artifact (Genesis Seal v1.4)
   * @param {number} repositoryId - Repository ID
   * @param {number} commitId - Commit ID to seal
   * @param {string} artifactName - Name for the artifact
   * @param {string} artifactType - Type: 'wasm', 'binary', 'library', 'module'
   * @param {Object} buildMetadata - Build information
   * @returns {Promise<Object>} Sealed artifact data
   */
  async sealArtifact(repositoryId, commitId, artifactName, artifactType, buildMetadata = {}) {
    try {
      // Get repository and commit information
      const repo = await this.runQuery(
        'SELECT * FROM eduba_repositories WHERE id = ?',
        [repositoryId],
        true
      );

      const commit = await this.runQuery(
        'SELECT * FROM eduba_commits WHERE id = ? AND repository_id = ?',
        [commitId, repositoryId],
        true
      );

      if (!repo || !commit) {
        throw new Error('Repository or commit not found');
      }

      // Get all files in the commit
      const files = await this.runQuery(
        'SELECT * FROM eduba_files WHERE commit_id = ?',
        [commitId],
        false,
        true
      );

      // Generate Genesis Seal v1.4
      const genesisSeal = await this.generateGenesisSeal(commit, files, buildMetadata);

      // Create artifact directory
      const artifactsDir = path.join(repo.repository_path, '.eduba', 'artifacts');
      await fs.mkdir(artifactsDir, { recursive: true });

      // Generate artifact filename
      const version = buildMetadata.version || '1.0.0';
      const artifactFileName = `${artifactName}-v${version}-${genesisSeal.hash.substring(0, 8)}.${this.getArtifactExtension(artifactType)}`;
      const artifactPath = path.join(artifactsDir, artifactFileName);

      // Create the sealed artifact (for now, just a manifest file)
      // In a full implementation, this would compile to WASM or create binaries
      const artifactContent = {
        genesis_seal: this.genesisSealVersion,
        repository_id: repositoryId,
        commit_hash: commit.commit_hash,
        artifact_name: artifactName,
        artifact_type: artifactType,
        version: version,
        forge_manifest: genesisSeal.hash,
        build_metadata: buildMetadata,
        sealed_at: new Date().toISOString(),
        file_manifest: genesisSeal.fileManifest,
        cryptographic_proof: genesisSeal.proof
      };

      await fs.writeFile(artifactPath, JSON.stringify(artifactContent, null, 2));

      // Store artifact in database
      const artifact = await this.runQuery(
        `INSERT INTO eduba_artifacts
         (repository_id, artifact_name, artifact_type, version, forge_manifest,
          artifact_path, artifact_size_bytes, build_metadata, sealed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [repositoryId, artifactName, artifactType, version, genesisSeal.hash,
         artifactPath, genesisSeal.size, JSON.stringify(buildMetadata)]
      );

      // Mark repository as sealed if this is a major artifact
      if (artifactType === 'wasm' || artifactType === 'binary') {
        await this.runQuery(
          'UPDATE eduba_repositories SET is_sealed = 1 WHERE id = ?',
          [repositoryId]
        );
      }

      return {
        id: artifact.lastID,
        name: artifactName,
        type: artifactType,
        version: version,
        forgeManifest: genesisSeal.hash,
        path: artifactPath,
        size: genesisSeal.size,
        genesisSeal: this.genesisSealVersion
      };
    } catch (error) {
      console.error('Failed to seal artifact:', error);
      throw error;
    }
  }

  /**
   * Generate Genesis Seal v1.4 for an artifact
   * @param {Object} commit - Commit data
   * @param {Array} files - File data array
   * @param {Object} buildMetadata - Build metadata
   * @returns {Promise<Object>} Genesis seal data
   */
  async generateGenesisSeal(commit, files, buildMetadata) {
    const hash = crypto.createHash(this.algorithm);

    // Include commit metadata in seal
    hash.update('GENESIS_SEAL_v1.4');
    hash.update(commit.commit_hash);
    hash.update(commit.forge_manifest);
    hash.update(commit.commit_message);
    hash.update(commit.commit_timestamp.toISOString());

    // Include build metadata
    hash.update(JSON.stringify(buildMetadata));

    // Include file manifest
    const fileManifest = [];
    let totalSize = 0;

    for (const file of files) {
      const fileData = {
        path: file.file_path,
        hash: file.file_hash,
        size: file.file_size_bytes,
        mime_type: file.mime_type,
        permissions: file.permissions
      };

      fileManifest.push(fileData);
      totalSize += file.file_size_bytes;

      // Include file data in seal
      hash.update(file.file_path);
      hash.update(file.file_hash);
      hash.update(file.file_size_bytes.toString());
    }

    // Generate cryptographic proof (additional entropy)
    const proof = crypto.randomBytes(32).toString('hex');
    hash.update(proof);

    const sealHash = hash.digest('hex');

    return {
      hash: sealHash,
      fileManifest,
      size: totalSize,
      proof,
      version: this.genesisSealVersion
    };
  }

  /**
   * Verify Genesis Seal integrity
   * @param {string} artifactPath - Path to sealed artifact
   * @returns {Promise<boolean>} True if seal is valid
   */
  async verifyGenesisSeal(artifactPath) {
    try {
      const artifactContent = JSON.parse(await fs.readFile(artifactPath, 'utf8'));

      // Recalculate the seal
      const hash = crypto.createHash(this.algorithm);
      hash.update('GENESIS_SEAL_v1.4');
      hash.update(artifactContent.commit_hash);
      hash.update(artifactContent.forge_manifest);
      hash.update(artifactContent.build_metadata || {});

      for (const file of artifactContent.file_manifest) {
        hash.update(file.path);
        hash.update(file.hash);
        hash.update(file.size.toString());
      }

      hash.update(artifactContent.cryptographic_proof);

      const recalculatedHash = hash.digest('hex');

      return recalculatedHash === artifactContent.forge_manifest;
    } catch (error) {
      console.error('Failed to verify Genesis Seal:', error);
      return false;
    }
  }

  /**
   * Prepare artifact for Genesis Self-Replication
   * @param {number} artifactId - Artifact ID
   * @param {string} replicationKey - Replication key
   * @returns {Promise<Object>} Replication data
   */
  async prepareForReplication(artifactId, replicationKey) {
    try {
      const artifact = await this.runQuery(
        'SELECT * FROM eduba_artifacts WHERE id = ?',
        [artifactId],
        true
      );

      if (!artifact) {
        throw new Error('Artifact not found');
      }

      // Generate replication manifest
      const replicationManifest = {
        artifact_id: artifactId,
        artifact_name: artifact.artifact_name,
        version: artifact.version,
        forge_manifest: artifact.forge_manifest,
        replication_key: replicationKey,
        replication_timestamp: new Date().toISOString(),
        genesis_seal: this.genesisSealVersion
      };

      // Encrypt replication key
      const encryptedKey = crypto.createCipher('aes-256-gcm', replicationKey)
        .update(replicationKey, 'utf8', 'hex') + crypto.createCipher('aes-256-gcm', replicationKey).final('hex');

      // Update artifact as replicable
      await this.runQuery(
        'UPDATE eduba_artifacts SET is_replicable = 1, replication_key = ? WHERE id = ?',
        [encryptedKey, artifactId]
      );

      return {
        artifactId,
        replicationManifest,
        encryptedKey
      };
    } catch (error) {
      console.error('Failed to prepare artifact for replication:', error);
      throw error;
    }
  }

  /**
   * Get artifact extension based on type
   * @param {string} artifactType - Artifact type
   * @returns {string} File extension
   */
  getArtifactExtension(artifactType) {
    switch (artifactType) {
      case 'wasm':
        return 'wasm';
      case 'binary':
        return 'bin';
      case 'library':
        return 'lib';
      case 'module':
        return 'mod';
      default:
        return 'artifact';
    }
  }

  /**
   * List sealed artifacts for a repository
   * @param {number} repositoryId - Repository ID
   * @returns {Promise<Array>} Array of artifacts
   */
  async listArtifacts(repositoryId) {
    return await this.runQuery(
      'SELECT * FROM eduba_artifacts WHERE repository_id = ? ORDER BY sealed_at DESC',
      [repositoryId],
      false,
      true
    );
  }

  /**
   * Get artifact information
   * @param {number} artifactId - Artifact ID
   * @returns {Promise<Object>} Artifact data
   */
  async getArtifact(artifactId) {
    return await this.runQuery(
      'SELECT * FROM eduba_artifacts WHERE id = ?',
      [artifactId],
      true
    );
  }

  /**
   * Export artifact for distribution (air-gapped)
   * @param {number} artifactId - Artifact ID
   * @param {string} exportPath - Path to export to
   * @returns {Promise<string>} Export path
   */
  async exportArtifact(artifactId, exportPath) {
    try {
      const artifact = await this.getArtifact(artifactId);
      if (!artifact) {
        throw new Error('Artifact not found');
      }

      // Verify seal before export
      const isValid = await this.verifyGenesisSeal(artifact.artifact_path);
      if (!isValid) {
        throw new Error('Genesis Seal verification failed - artifact may be corrupted');
      }

      // Copy artifact to export location
      const exportFileName = path.basename(artifact.artifact_path);
      const fullExportPath = path.join(exportPath, exportFileName);

      await fs.copyFile(artifact.artifact_path, fullExportPath);

      // Create export manifest
      const exportManifest = {
        artifact_name: artifact.artifact_name,
        version: artifact.version,
        forge_manifest: artifact.forge_manifest,
        exported_at: new Date().toISOString(),
        exported_by: 'Eduba Kiln',
        genesis_seal_verified: true
      };

      await fs.writeFile(
        path.join(exportPath, `${artifact.artifact_name}-manifest.json`),
        JSON.stringify(exportManifest, null, 2)
      );

      return fullExportPath;
    } catch (error) {
      console.error('Failed to export artifact:', error);
      throw error;
    }
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

module.exports = new EdubaKiln();