const axios = require('axios');
const crypto = require('node:crypto');
const fs = require('node:fs').promises;
const path = require('node:path');
const BaseStorageService = require('./base-storage.service');

class IceDriveStorageService extends BaseStorageService {
  constructor(serviceConfig) {
    super(serviceConfig);
    this.baseUrl = serviceConfig.base_url || 'https://api.icerdrive.com/v1';
    this.apiKey = serviceConfig.api_key;
    this.apiSecret = serviceConfig.api_secret;
    this.twofishKey = crypto.scryptSync(this.apiSecret, 'salt', 32); // Derive Twofish key
  }

  // Test connection to IceDrive
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
          message: 'IceDrive connection successful'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to connect to IceDrive'
      };
    }
  }

  // Encrypt file with Twofish before upload
  async encryptFile(fileBuffer) {
    const cipher = crypto.createCipher('aes-256-cbc', this.twofishKey); // Using AES as Twofish isn't in Node.js crypto
    let encrypted = cipher.update(fileBuffer);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return encrypted;
  }

  // Decrypt file with Twofish after download
  async decryptFile(encryptedBuffer) {
    const decipher = crypto.createDecipher('aes-256-cbc', this.twofishKey);
    let decrypted = decipher.update(encryptedBuffer);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted;
  }

  // Upload encrypted file to IceDrive
  async uploadFile(localPath, remotePath, options = {}) {
    const startTime = Date.now();

    try {
      const fileBuffer = await fs.readFile(localPath);
      const fileStats = await this.getFileStats(localPath);
      const checksum = await this.calculateChecksum(localPath);

      // Encrypt file with Twofish
      const encryptedBuffer = await this.encryptFile(fileBuffer);

      const formData = new FormData();
      formData.append('file', new Blob([encryptedBuffer]), path.basename(remotePath));
      formData.append('path', remotePath);

      const response = await axios.post(`${this.baseUrl}/files/upload`, formData, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'multipart/form-data'
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
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
          is_encrypted: true,
          backup_priority: options.priority || 3 // High priority for encrypted vault
        });

        await this.logSyncOperation('upload', remotePath, 'success', null, fileStats.size, Date.now() - startTime);

        return {
          success: true,
          remotePath: remotePath,
          size: fileStats.size,
          checksum: checksum,
          encrypted: true
        };
      }
    } catch (error) {
      await this.logSyncOperation('upload', remotePath, 'failed', error.message, 0, Date.now() - startTime);
      throw new Error(`IceDrive upload failed: ${error.message}`);
    }
  }

  // Download and decrypt file from IceDrive
  async downloadFile(remotePath, localPath, options = {}) {
    const startTime = Date.now();

    try {
      // First get file info to get the file ID
      const fileMetadata = await this.getFileMetadata(remotePath);
      if (!fileMetadata?.remote_id) {
        throw new Error('File metadata not found');
      }

      const response = await axios.get(`${this.baseUrl}/files/${fileMetadata.remote_id}/download`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        responseType: 'arraybuffer',
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      if (response.status === 200) {
        // Decrypt file
        const decryptedBuffer = await this.decryptFile(Buffer.from(response.data));
        await fs.writeFile(localPath, decryptedBuffer);

        const fileStats = await this.getFileStats(localPath);
        await this.logSyncOperation('download', remotePath, 'success', null, fileStats.size, Date.now() - startTime);

        return {
          success: true,
          localPath: localPath,
          size: fileStats.size,
          decrypted: true
        };
      }
    } catch (error) {
      await this.logSyncOperation('download', remotePath, 'failed', error.message, 0, Date.now() - startTime);
      throw new Error(`IceDrive download failed: ${error.message}`);
    }
  }

  // List files in IceDrive
  async listFiles(remotePath = '') {
    try {
      const response = await axios.get(`${this.baseUrl}/files`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        params: {
          path: remotePath
        }
      });

      if (response.status === 200) {
        const files = response.data.files.map(file => ({
          path: file.path,
          name: file.name,
          size: file.size,
          type: file.type,
          encrypted: true,
          lastModified: file.modified
        }));

        return {
          success: true,
          files: files
        };
      }
    } catch (error) {
      throw new Error(`IceDrive list files failed: ${error.message}`);
    }
  }

  // Delete file from IceDrive
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
      throw new Error(`IceDrive delete failed: ${error.message}`);
    }
  }

  // Get storage information from IceDrive
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
          limit: data.limit,
          available: data.limit - data.used,
          percentage: (data.used / data.limit) * 100,
          encrypted: true
        };
      }
    } catch (error) {
      throw new Error(`Failed to get IceDrive storage info: ${error.message}`);
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
      '.zip': 'application/zip',
      '.tar': 'application/x-tar',
      '.gz': 'application/gzip',
      '.db': 'application/octet-stream',
      '.sqlite': 'application/octet-stream'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
}

module.exports = IceDriveStorageService;