const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('node:path');
const fs = require('node:fs').promises;
const StorageManager = require('../services/storage-manager.service');

// Initialize storage manager
const storageManager = new StorageManager();

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Configure multer for file uploads
const upload = multer({
  dest: path.join(__dirname, '../temp'),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Initialize user storage services
router.use(authenticateToken, async (req, res, next) => {
  try {
    await storageManager.initializeServices(req.user.id);
    next();
  } catch (error) {
    console.error('Failed to initialize storage services:', error);
    next();
  }
});

// Get all storage services for user
router.get('/services', async (req, res) => {
  try {
    const services = await storageManager.getUserStorageServices(req.user.id);
    res.json(services);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Configure a storage service
router.post('/services', async (req, res) => {
  try {
    const { service_name, service_type, ...config } = req.body;

    if (!service_name || !service_type) {
      return res.status(400).json({ error: 'service_name and service_type are required' });
    }

    const result = await storageManager.configureService(req.user.id, {
      service_name,
      service_type,
      ...config
    });

    res.json({ success: true, serviceId: result.serviceId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test connection to a storage service
router.post('/services/:serviceName/test', async (req, res) => {
  try {
    const { serviceName } = req.params;
    const result = await storageManager.testServiceConnection(req.user.id, serviceName);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get storage overview
router.get('/overview', async (req, res) => {
  try {
    const overview = await storageManager.getStorageOverview(req.user.id);
    res.json(overview);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload file to storage
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { serviceName, remotePath, priority, retentionDays, encrypted } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const options = {
      priority: Number.parseInt(priority) || 1,
      retentionDays: Number.parseInt(retentionDays) || 365,
      encrypted: encrypted === 'true'
    };

    if (serviceName) {
      // Upload to specific service
      const service = storageManager.getService(req.user.id, serviceName);
      if (!service) {
        return res.status(404).json({ error: `Service ${serviceName} not configured` });
      }

      const finalRemotePath = remotePath || `/${file.originalname}`;
      const result = await service.uploadFile(file.path, finalRemotePath, options);
      res.json(result);
    } else {
      // Auto-determine service
      const result = await storageManager.uploadFile(req.user.id, file.path, {
        ...options,
        remotePath: remotePath || `/${file.originalname}`
      });
      res.json(result);
    }

    // Clean up temp file
    await fs.unlink(file.path);
  } catch (error) {
    // Clean up temp file on error
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    res.status(500).json({ error: error.message });
  }
});

// Download file from storage
router.get('/download/:serviceName/*', async (req, res) => {
  try {
    const { serviceName } = req.params;
    const remotePath = '/' + req.params[0]; // Get the wildcard path

    // Create temp file for download
    const tempDir = path.join(__dirname, '../temp');
    await fs.mkdir(tempDir, { recursive: true });
    const tempFile = path.join(tempDir, `download_${Date.now()}_${path.basename(remotePath)}`);

    await storageManager.downloadFile(req.user.id, serviceName, remotePath, tempFile);

    // Stream file to response
    const fileStream = require('node:fs').createReadStream(tempFile);
    const fileName = path.basename(remotePath);

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');

    fileStream.pipe(res);

    // Clean up temp file after streaming
    fileStream.on('end', () => {
      fs.unlink(tempFile).catch(() => {});
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List files in storage service
router.get('/files/:serviceName/*?', async (req, res) => {
  try {
    const { serviceName } = req.params;
    const remotePath = req.params[0] ? '/' + req.params[0] : '';
    const { limit, offset } = req.query;

    const options = {
      limit: Number.parseInt(limit) || 100,
      offset: Number.parseInt(offset) || 0
    };

    const result = await storageManager.listFiles(req.user.id, serviceName, remotePath, options);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete file from storage
router.delete('/files/:serviceName/*', async (req, res) => {
  try {
    const { serviceName } = req.params;
    const remotePath = '/' + req.params[0];

    const result = await storageManager.deleteFile(req.user.id, serviceName, remotePath);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Backup license data to storage
router.post('/backup/licenses', async (req, res) => {
  try {
    const { serviceName, encrypted } = req.body;

    // Get user's license data
    const { getDatabase } = require('../database');
    const db = getDatabase();

    const licenses = await new Promise((resolve, reject) => {
      const sql = `SELECT * FROM licenses WHERE user_id = ?`;
      db.all(sql, [req.user.id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    // Create backup file
    const backupData = {
      timestamp: new Date().toISOString(),
      userId: req.user.id,
      licenses: licenses
    };

    const tempDir = path.join(__dirname, '../temp');
    await fs.mkdir(tempDir, { recursive: true });
    const backupFile = path.join(tempDir, `licenses_backup_${Date.now()}.json`);

    await fs.writeFile(backupFile, JSON.stringify(backupData, null, 2));

    // Upload to storage
    const options = {
      priority: 3, // High priority for backups
      encrypted: encrypted === 'true'
    };

    const targetService = serviceName || 'icedrive'; // Default to IceDrive for encrypted backups
    const service = storageManager.getService(req.user.id, targetService);

    if (!service) {
      return res.status(404).json({ error: `Service ${targetService} not configured` });
    }

    const remotePath = `/backups/licenses_${Date.now()}.json`;
    const result = await service.uploadFile(backupFile, remotePath, options);

    // Clean up temp file
    await fs.unlink(backupFile);

    res.json({
      success: true,
      service: targetService,
      backupPath: remotePath,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get sync logs
router.get('/logs', async (req, res) => {
  try {
    const { limit, offset, serviceName } = req.query;
    const { getDatabase } = require('../database');
    const db = getDatabase();

    let sql = `SELECT * FROM storage_sync_logs WHERE user_id = ?`;
    const params = [req.user.id];

    if (serviceName) {
      sql += ` AND storage_service_id IN (SELECT id FROM storage_services WHERE service_name = ?)`;
      params.push(serviceName);
    }

    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(Number.parseInt(limit) || 50, Number.parseInt(offset) || 0);

    const logs = await new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;