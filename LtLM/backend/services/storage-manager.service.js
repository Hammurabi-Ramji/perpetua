const path = require('node:path');
const { getDatabase } = require('../database');
const KoofrStorageService = require('./koofr.service');
const IceDriveStorageService = require('./icedrive.service');
const DegooStorageService = require('./degoo.service');

class StorageManager {
  constructor() {
    this.services = new Map();
    this.db = getDatabase();
    this.serviceClasses = {
      'koofr': KoofrStorageService,
      'icedrive': IceDriveStorageService,
      'degoo': DegooStorageService
    };
  }

  // Initialize storage services from database
  async initializeServices(userId) {
    try {
      const services = await this.getUserStorageServices(userId);

      for (const serviceConfig of services) {
        if (serviceConfig.enabled) {
          await this.loadService(serviceConfig);
        }
      }
    } catch (error) {
      console.error('Failed to initialize storage services:', error);
    }
  }

  // Load a specific storage service
  async loadService(serviceConfig) {
    try {
      const ServiceClass = this.serviceClasses[serviceConfig.service_name];
      if (!ServiceClass) {
        throw new Error(`Unknown storage service: ${serviceConfig.service_name}`);
      }

      // Decrypt credentials if they exist
      if (serviceConfig.credentials_encrypted) {
        const credentials = this.decryptCredentials(serviceConfig.credentials_encrypted);
        serviceConfig = { ...serviceConfig, ...credentials };
      }

      const service = new ServiceClass(serviceConfig);
      this.services.set(`${serviceConfig.user_id}_${serviceConfig.service_name}`, service);

      return service;
    } catch (error) {
      console.error(`Failed to load ${serviceConfig.service_name} service:`, error);
      throw error;
    }
  }

  // Get storage service instance
  getService(userId, serviceName) {
    return this.services.get(`${userId}_${serviceName}`);
  }

  // Add or update storage service configuration
  async configureService(userId, serviceConfig) {
    try {
      // Encrypt sensitive credentials
      const credentialsToEncrypt = {};
      if (serviceConfig.api_key) credentialsToEncrypt.api_key = serviceConfig.api_key;
      if (serviceConfig.api_secret) credentialsToEncrypt.api_secret = serviceConfig.api_secret;
      if (serviceConfig.access_token) credentialsToEncrypt.access_token = serviceConfig.access_token;
      if (serviceConfig.refresh_token) credentialsToEncrypt.refresh_token = serviceConfig.refresh_token;

      const encryptedCredentials = Object.keys(credentialsToEncrypt).length > 0
        ? this.encryptCredentials(credentialsToEncrypt)
        : null;

      const sql = `INSERT OR REPLACE INTO storage_services
        (user_id, service_name, service_type, account_email, access_token, refresh_token, token_expires_at,
         api_key, api_secret, credentials_encrypted, base_url, webdav_url, mount_path, enabled,
         storage_used_bytes, storage_limit_bytes, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`;

      const result = await this.runQuery(sql, [
        userId,
        serviceConfig.service_name,
        serviceConfig.service_type,
        serviceConfig.account_email || null,
        serviceConfig.access_token || null,
        serviceConfig.refresh_token || null,
        serviceConfig.token_expires_at || null,
        serviceConfig.api_key || null,
        serviceConfig.api_secret || null,
        encryptedCredentials,
        serviceConfig.base_url || null,
        serviceConfig.webdav_url || null,
        serviceConfig.mount_path || null,
        serviceConfig.enabled !== false,
        serviceConfig.storage_used_bytes || 0,
        serviceConfig.storage_limit_bytes || 0
      ]);

      // Reload the service if it was updated
      if (this.services.has(`${userId}_${serviceConfig.service_name}`)) {
        this.services.delete(`${userId}_${serviceConfig.service_name}`);
      }

      if (serviceConfig.enabled !== false) {
        await this.loadService({ ...serviceConfig, user_id: userId, id: result.lastID });
      }

      return { success: true, serviceId: result.lastID };
    } catch (error) {
      throw new Error(`Failed to configure storage service: ${error.message}`);
    }
  }

  // Get all storage services for a user
  async getUserStorageServices(userId) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM storage_services WHERE user_id = ? ORDER BY service_name`;
      this.db.all(sql, [userId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Test connection to a storage service
  async testServiceConnection(userId, serviceName) {
    try {
      const service = this.getService(userId, serviceName);
      if (!service) {
        throw new Error(`Service ${serviceName} not configured or disabled`);
      }

      return await service.testConnection();
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: `Failed to test ${serviceName} connection`
      };
    }
  }

  // Upload file to appropriate storage service based on file type and requirements
  async uploadFile(userId, localPath, options = {}) {
    try {
      const serviceName = this.determineStorageService(localPath, options);
      const service = this.getService(userId, serviceName);

      if (!service) {
        throw new Error(`Storage service ${serviceName} not available`);
      }

      const remotePath = options.remotePath || `/${path.basename(localPath)}`;
      return await service.uploadFile(localPath, remotePath, options);
    } catch (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }
  }

  // Download file from storage service
  async downloadFile(userId, serviceName, remotePath, localPath, options = {}) {
    try {
      const service = this.getService(userId, serviceName);
      if (!service) {
        throw new Error(`Service ${serviceName} not configured`);
      }

      return await service.downloadFile(remotePath, localPath, options);
    } catch (error) {
      throw new Error(`Download failed: ${error.message}`);
    }
  }

  // List files from storage service
  async listFiles(userId, serviceName, remotePath = '', options = {}) {
    try {
      const service = this.getService(userId, serviceName);
      if (!service) {
        throw new Error(`Service ${serviceName} not configured`);
      }

      return await service.listFiles(remotePath, options);
    } catch (error) {
      throw new Error(`List files failed: ${error.message}`);
    }
  }

  // Delete file from storage service
  async deleteFile(userId, serviceName, remotePath) {
    try {
      const service = this.getService(userId, serviceName);
      if (!service) {
        throw new Error(`Service ${serviceName} not configured`);
      }

      return await service.deleteFile(remotePath);
    } catch (error) {
      throw new Error(`Delete failed: ${error.message}`);
    }
  }

  // Get storage information for all services
  async getStorageOverview(userId) {
    const services = await this.getUserStorageServices(userId);
    const overview = {
      total: { used: 0, limit: 0, available: 0 },
      services: []
    };

    for (const serviceConfig of services) {
      if (!serviceConfig.enabled) continue;

      try {
        const service = this.getService(userId, serviceConfig.service_name);
        if (service) {
          const info = await service.getStorageInfo();
          overview.services.push({
            name: serviceConfig.service_name,
            type: serviceConfig.service_type,
            ...info
          });

          overview.total.used += info.used || 0;
          overview.total.limit += info.limit || 0;
        }
      } catch (error) {
        overview.services.push({
          name: serviceConfig.service_name,
          type: serviceConfig.service_type,
          error: error.message
        });
      }
    }

    overview.total.available = overview.total.limit - overview.total.used;
    return overview;
  }

  // Determine which storage service to use based on file characteristics
  determineStorageService(filePath, options = {}) {
    const fileName = path.basename(filePath).toLowerCase();
    const fileExt = path.extname(filePath).toLowerCase();

    // High-security files (databases, keys, encrypted data) -> IceDrive
    if (options.encrypted || fileExt === '.db' || fileExt === '.sqlite' || fileName.includes('key') || fileName.includes('secret')) {
      return 'icedrive';
    }

    // Large media files -> Degoo
    if (options.largeFile || ['.mp4', '.avi', '.mov', '.mkv', '.zip', '.tar', '.gz'].includes(fileExt)) {
      return 'degoo';
    }

    // Documentation and small files -> Koofr
    return 'koofr';
  }

  // Encrypt credentials using AES-256-CBC
  encryptCredentials(credentials) {
    const crypto = require('node:crypto');
    const key = process.env.STORAGE_ENCRYPTION_KEY || 'default-key-change-in-production';
    const cipher = crypto.createCipher('aes-256-cbc', key);
    let encrypted = cipher.update(JSON.stringify(credentials), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  // Decrypt credentials using AES-256-CBC
  decryptCredentials(encryptedCredentials) {
    const crypto = require('node:crypto');
    const key = process.env.STORAGE_ENCRYPTION_KEY || 'default-key-change-in-production';
    const decipher = crypto.createDecipher('aes-256-cbc', key);
    let decrypted = decipher.update(encryptedCredentials, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  }

  // Helper method to run database queries
  runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }
}

module.exports = StorageManager;