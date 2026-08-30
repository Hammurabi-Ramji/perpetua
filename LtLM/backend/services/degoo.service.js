const axios = require('axios');
const fs = require('node:fs').promises;
const path = require('node:path');
const BaseStorageService = require('./base-storage.service');

class DegooStorageService extends BaseStorageService {
  constructor(serviceConfig) {
    super(serviceConfig);
    this.baseUrl = serviceConfig.base_url || 'https://api.degoo.com/v1';
    this.apiKey = serviceConfig.api_key;
    this.apiSecret = serviceConfig.api_secret;
  }

  // Test connection to Degoo
  async testConnection() {
    try {
      const response = await axios.get(`${this.baseUrl}/user/info`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 200) {
        return {
          success: true,
          user: response.data,
          message: 'Degoo connection successful'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to connect to Degoo'
      };
    }
  }

  // Upload file to Degoo (optimized for large files)
  async uploadFile(localPath, remotePath, options = {}) {
    const startTime = Date.now();

    try {
      const fileStats = await this.getFileStats(localPath);
      const checksum = await this.calculateChecksum(localPath);

      // For large files, use streaming upload
      const fileStream = require('node:fs').createReadStream(localPath);

      const formData = new FormData();
      formData.append('file', fileStream, { filename: path.basename(remotePath) });
      formData.append('path', remotePath);
      formData.append('retention_days', options.retentionDays || 365); // Default 1 year retention

      const response = await axios.post(`${this.baseUrl}/files/upload`, formData, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'multipart/form-data'
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 300000 // 5 minutes for large files
      });

      if (response.status === 200) {
        // Save file metadata
        await this.saveFileMetadata({
          file_path: remotePath,
          file_name: path.basename(remotePath),
          file_size_bytes: fileStats.size,
          mime_type: this.getMimeType(localPath),
          checksum: checksum,
          remote_id: response.data.file_id,
          remote_url: response.data.url,
          sync_status: 'synced',
          backup_priority: options.priority || 1, // Low priority for archive
          retention_days: options.retentionDays || 365
        });

        await this.logSyncOperation('upload', remotePath, 'success', null, fileStats.size, Date.now() - startTime);

        return {
          success: true,
          remotePath: remotePath,
          size: fileStats.size,
          checksum: checksum,
          retentionDays: options.retentionDays || 365
        };
      }
    } catch (error) {
      await this.logSyncOperation('upload', remotePath, 'failed', error.message, 0, Date.now() - startTime);
      throw new Error(`Degoo upload failed: ${error.message}`);
    }
  }

  // Download file from Degoo
  async downloadFile(remotePath, localPath, options = {}) {
    const startTime = Date.now();

    try {
      const fileMetadata = await this.getFileMetadata(remotePath);
      if (!fileMetadata?.remote_id) {
        throw new Error('File metadata not found');
      }

      const response = await axios.get(`${this.baseUrl}/files/${fileMetadata.remote_id}/download`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        responseType: 'stream',
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 300000 // 5 minutes for large files
      });

      if (response.status === 200) {
        const writer = require('node:fs').createWriteStream(localPath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
          writer.on('finish', async () => {
            try {
              const fileStats = await this.getFileStats(localPath);
              await this.logSyncOperation('download', remotePath, 'success', null, fileStats.size, Date.now() - startTime);

              resolve({
                success: true,
                localPath: localPath,
                size: fileStats.size
              });
            } catch (error) {
              reject(error);
            }
          });

          writer.on('error', (error) => {
            this.logSyncOperation('download', remotePath, 'failed', error.message, 0, Date.now() - startTime);
            reject(new Error(`Degoo download failed: ${error.message}`));
          });
        });
      }
    } catch (error) {
      await this.logSyncOperation('download', remotePath, 'failed', error.message, 0, Date.now() - startTime);
      throw new Error(`Degoo download failed: ${error.message}`);
    }
  }

  // List files in Degoo (with pagination for large storage)
  async listFiles(remotePath = '', options = {}) {
    try {
      const params = {
        path: remotePath,
        limit: options.limit || 100,
        offset: options.offset || 0
      };

      const response = await axios.get(`${this.baseUrl}/files`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        params: params
      });

      if (response.status === 200) {
        const files = response.data.files.map(file => ({
          path: file.path,
          name: file.name,
          size: file.size,
          type: file.type,
          lastModified: file.modified,
          retentionDays: file.retention_days,
          archived: true
        }));

        return {
          success: true,
          files: files,
          total: response.data.total,
          hasMore: response.data.has_more
        };
      }
    } catch (error) {
      throw new Error(`Degoo list files failed: ${error.message}`);
    }
  }

  // Delete file from Degoo
  async deleteFile(remotePath) {
    const startTime = Date.now();

    try {
      const fileMetadata = await this.getFileMetadata(remotePath);
      if (!fileMetadata?.remote_id) {
        throw new Error('File metadata not found');
      }

      const response = await axios.delete(`${this.baseUrl}/files/${fileMetadata.remote_id}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      if (response.status === 200) {
        await this.logSyncOperation('delete', remotePath, 'success', null, 0, Date.now() - startTime);
        return { success: true };
      }
    } catch (error) {
      await this.logSyncOperation('delete', remotePath, 'failed', error.message, 0, Date.now() - startTime);
      throw new Error(`Degoo delete failed: ${error.message}`);
    }
  }

  // Get storage information from Degoo (high capacity focus)
  async getStorageInfo() {
    try {
      const response = await axios.get(`${this.baseUrl}/user/storage`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 200) {
        const data = response.data;
        return {
          success: true,
          used: data.used,
          limit: data.limit || 1000000000000, // 1TB default for high capacity
          available: (data.limit || 1000000000000) - data.used,
          percentage: (data.used / (data.limit || 1000000000000)) * 100,
          archived: true,
          highCapacity: true
        };
      }
    } catch (error) {
      throw new Error(`Failed to get Degoo storage info: ${error.message}`);
    }
  }

  // Get MIME type from file extension
  getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.mp4': 'video/mp4',
      '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime',
      '.wmv': 'video/x-ms-wmv',
      '.flv': 'video/x-flv',
      '.webm': 'video/webm',
      '.mkv': 'video/x-matroska',
      '.zip': 'application/zip',
      '.tar': 'application/x-tar',
      '.gz': 'application/gzip',
      '.7z': 'application/x-7z-compressed'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
}

module.exports = DegooStorageService;