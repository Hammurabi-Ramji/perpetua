const crypto = require('node:crypto');
const fs = require('node:fs').promises;
const path = require('node:path');
const axios = require('axios');
const { getDatabase } = require('../database');

class BaseStorageService {
  constructor(serviceConfig) {
    this.config = serviceConfig;
    this.db = getDatabase();
    this.encryptionKey = process.env.STORAGE_ENCRYPTION_KEY || 'default-key-change-in-production';
  }

  // Encrypt sensitive credentials
  encryptCredentials(credentials) {
    const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
    let encrypted = cipher.update(JSON.stringify(credentials), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  // Decrypt sensitive credentials
  decryptCredentials(encryptedCredentials) {
    const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
    let decrypted = decipher.update(encryptedCredentials, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  }

  // Test connection to storage service
  async testConnection() {
    throw new Error('testConnection must be implemented by subclass');
  }

  // Upload file to storage service
  async uploadFile(localPath, remotePath, options = {}) {
    throw new Error('uploadFile must be implemented by subclass');
  }

  // Download file from storage service
  async downloadFile(remotePath, localPath, options = {}) {
    throw new Error('downloadFile must be implemented by subclass');
  }

  // List files in storage service
  async listFiles(remotePath = '') {
    throw new Error('listFiles must be implemented by subclass');
  }

  // Delete file from storage service
  async deleteFile(remotePath) {
    throw new Error('deleteFile must be implemented by subclass');
  }

  // Get storage usage information
  async getStorageInfo() {
    throw new Error('getStorageInfo must be implemented by subclass');
  }

  // Log sync operation
  async logSyncOperation(operation, filePath, status, errorMessage = null, bytesTransferred = 0, durationMs = 0) {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO storage_sync_logs
        (user_id, storage_service_id, operation, file_path, status, error_message, bytes_transferred, duration_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

      this.db.run(sql, [
        this.config.user_id,
        this.config.id,
        operation,
        filePath,
        status,
        errorMessage,
        bytesTransferred,
        durationMs
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  // Update file sync status
  async updateFileSyncStatus(filePath, status, remoteId = null, remoteUrl = null) {
    return new Promise((resolve, reject) => {
      const sql = `UPDATE storage_files SET
        sync_status = ?, remote_id = ?, remote_url = ?, last_synced = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE storage_service_id = ? AND file_path = ?`;

      this.db.run(sql, [status, remoteId, remoteUrl, this.config.id, filePath], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  // Get file metadata from database
  async getFileMetadata(filePath) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM storage_files WHERE storage_service_id = ? AND file_path = ?`;
      this.db.get(sql, [this.config.id, filePath], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  // Save file metadata to database
  async saveFileMetadata(fileData) {
    return new Promise((resolve, reject) => {
      const sql = `INSERT OR REPLACE INTO storage_files
        (user_id, storage_service_id, file_path, file_name, file_size_bytes, mime_type, checksum, remote_id, remote_url, sync_status, is_encrypted, backup_priority, retention_days)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      this.db.run(sql, [
        this.config.user_id,
        this.config.id,
        fileData.file_path,
        fileData.file_name,
        fileData.file_size_bytes,
        fileData.mime_type,
        fileData.checksum,
        fileData.remote_id,
        fileData.remote_url,
        fileData.sync_status || 'pending',
        fileData.is_encrypted || false,
        fileData.backup_priority || 1,
        fileData.retention_days
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  // Calculate file checksum
  async calculateChecksum(filePath) {
    try {
      const fileBuffer = await fs.readFile(filePath);
      return crypto.createHash('sha256').update(fileBuffer).digest('hex');
    } catch (error) {
      throw new Error(`Failed to calculate checksum: ${error.message}`);
    }
  }

  // Get file stats
  async getFileStats(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return {
        size: stats.size,
        mtime: stats.mtime,
        isDirectory: stats.isDirectory()
      };
    } catch (error) {
      throw new Error(`Failed to get file stats: ${error.message}`);
    }
  }
}

module.exports = BaseStorageService;