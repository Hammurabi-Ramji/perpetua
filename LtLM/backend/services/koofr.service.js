const axios = require('axios');
const fs = require('node:fs').promises;
const path = require('node:path');
const BaseStorageService = require('./base-storage.service');

class KoofrStorageService extends BaseStorageService {
  constructor(serviceConfig) {
    super(serviceConfig);
    this.baseUrl = serviceConfig.base_url || 'https://app.koofr.net';
    this.webdavUrl = serviceConfig.webdav_url || 'https://webdav.koofr.net';
    this.apiToken = serviceConfig.access_token;
  }

  // Test connection to Koofr
  async testConnection() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/v2/user`, {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 200) {
        return {
          success: true,
          user: response.data,
          message: 'Koofr connection successful'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to connect to Koofr'
      };
    }
  }

  // Upload file to Koofr using WebDAV
  async uploadFile(localPath, remotePath, options = {}) {
    const startTime = Date.now();

    try {
      const fileBuffer = await fs.readFile(localPath);
      const fileStats = await this.getFileStats(localPath);
      const checksum = await this.calculateChecksum(localPath);

      const response = await axios.put(`${this.webdavUrl}${remotePath}`, fileBuffer, {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/octet-stream',
          'Content-Length': fileStats.size
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      if (response.status === 201 || response.status === 204) {
        // Save file metadata
        await this.saveFileMetadata({
          file_path: remotePath,
          file_name: path.basename(remotePath),
          file_size_bytes: fileStats.size,
          mime_type: this.getMimeType(localPath),
          checksum: checksum,
          remote_id: remotePath,
          remote_url: `${this.webdavUrl}${remotePath}`,
          sync_status: 'synced',
          backup_priority: options.priority || 1
        });

        await this.logSyncOperation('upload', remotePath, 'success', null, fileStats.size, Date.now() - startTime);

        return {
          success: true,
          remotePath: remotePath,
          size: fileStats.size,
          checksum: checksum
        };
      }
    } catch (error) {
      await this.logSyncOperation('upload', remotePath, 'failed', error.message, 0, Date.now() - startTime);
      throw new Error(`Koofr upload failed: ${error.message}`);
    }
  }

  // Download file from Koofr using WebDAV
  async downloadFile(remotePath, localPath, options = {}) {
    const startTime = Date.now();

    try {
      const response = await axios.get(`${this.webdavUrl}${remotePath}`, {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`
        },
        responseType: 'arraybuffer',
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      if (response.status === 200) {
        await fs.writeFile(localPath, Buffer.from(response.data));

        const fileStats = await this.getFileStats(localPath);
        await this.logSyncOperation('download', remotePath, 'success', null, fileStats.size, Date.now() - startTime);

        return {
          success: true,
          localPath: localPath,
          size: fileStats.size
        };
      }
    } catch (error) {
      await this.logSyncOperation('download', remotePath, 'failed', error.message, 0, Date.now() - startTime);
      throw new Error(`Koofr download failed: ${error.message}`);
    }
  }

  // List files in Koofr directory using WebDAV PROPFIND
  async listFiles(remotePath = '') {
    try {
      const response = await axios.request({
        method: 'PROPFIND',
        url: `${this.webdavUrl}${remotePath}`,
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Depth': '1',
          'Content-Type': 'application/xml'
        }
      });

      if (response.status === 207) {
        // Parse WebDAV multistatus response
        const files = this.parseWebDAVResponse(response.data);
        return {
          success: true,
          files: files
        };
      }
    } catch (error) {
      throw new Error(`Koofr list files failed: ${error.message}`);
    }
  }

  // Delete file from Koofr using WebDAV
  async deleteFile(remotePath) {
    const startTime = Date.now();

    try {
      const response = await axios.delete(`${this.webdavUrl}${remotePath}`, {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`
        }
      });

      if (response.status === 204) {
        await this.logSyncOperation('delete', remotePath, 'success', null, 0, Date.now() - startTime);
        return { success: true };
      }
    } catch (error) {
      await this.logSyncOperation('delete', remotePath, 'failed', error.message, 0, Date.now() - startTime);
      throw new Error(`Koofr delete failed: ${error.message}`);
    }
  }

  // Get storage information from Koofr API
  async getStorageInfo() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/v2/user/storage`, {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 200) {
        const data = response.data;
        return {
          success: true,
          used: data.used,
          limit: data.limit,
          available: data.limit - data.used,
          percentage: (data.used / data.limit) * 100
        };
      }
    } catch (error) {
      throw new Error(`Failed to get Koofr storage info: ${error.message}`);
    }
  }

  // Parse WebDAV PROPFIND response
  parseWebDAVResponse(xmlData) {
    // Simple XML parsing for WebDAV response
    // In production, use a proper XML parser
    const files = [];
    const hrefMatches = xmlData.toString().match(/<D:href>(.*?)<\/D:href>/g);

    if (hrefMatches) {
      hrefMatches.forEach(match => {
        const href = match.replace(/<\/?D:href>/g, '');
        if (href && !href.endsWith('/')) {
          files.push({
            path: decodeURIComponent(href),
            name: path.basename(href),
            type: 'file'
          });
        }
      });
    }

    return files;
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
      '.zip': 'application/zip',
      '.tar': 'application/x-tar',
      '.gz': 'application/gzip'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
}

module.exports = KoofrStorageService;