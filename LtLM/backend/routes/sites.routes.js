const express = require('express');
const { authenticateToken } = require('../auth/middleware');
const { getDatabase } = require('../database');
const { encrypt, decrypt } = require('../utils/encryption');
const GenericScraper = require('../bridges/generic.scraper');

const router = express.Router();
const db = getDatabase();

// Get connected sites
router.get('/connections', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const connections = await new Promise((resolve, reject) => {
      db.all(
        'SELECT site_name, site_domain, last_synced, sync_status, created_at FROM connected_sites WHERE user_id = ?',
        [userId],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });

    res.json(connections || []);
  } catch (error) {
    console.error('Error fetching connections:', error);
    res.status(500).json({ error: 'Failed to fetch connections' });
  }
});

// Connect site with credentials
router.post('/:site/connect', authenticateToken, async (req, res) => {
  try {
    const { site } = req.params;
    const { username, password } = req.body;
    
    // Encrypt credentials
    const encryptedCreds = encrypt(JSON.stringify({ username, password }));
    
    // Store connection
    db.prepare(`
      INSERT OR REPLACE INTO connected_sites 
      (user_id, site_name, site_domain, credentials_encrypted, sync_status)
      VALUES (?, ?, ?, ?, 'pending')
    `).run(req.user.id, site, `https://${site}.com`, encryptedCreds);
    
    // Try to start sync (don't fail if it doesn't work)
    try {
      const scraper = new GenericScraper(site);
      await scraper.scrapeLicenses(req.user.id, { username, password });
      
      // Update status to success if sync worked
      db.prepare(`
        UPDATE connected_sites 
        SET sync_status = 'completed', last_synced = CURRENT_TIMESTAMP
        WHERE user_id = ? AND site_name = ?
      `).run(req.user.id, site);
    } catch (syncErr) {
      console.error('Sync failed but connection stored:', syncErr);
      // Update status to error but keep the connection
      db.prepare(`
        UPDATE connected_sites 
        SET sync_status = 'error' 
        WHERE user_id = ? AND site_name = ?
      `).run(req.user.id, site);
    }
    
    res.json({ success: true, message: 'Site connected successfully' });
  } catch (err) {
    console.error('Connect site error:', err);
    res.status(500).json({ error: 'Failed to connect site' });
  }
});

// Sync site
router.post('/:site/sync', authenticateToken, async (req, res) => {
  try {
    const { site } = req.params;
    
    // Get stored credentials
    const connection = db.prepare(`
      SELECT credentials_encrypted FROM connected_sites 
      WHERE user_id = ? AND site_name = ?
    `).get(req.user.id, site);
    
    if (!connection) {
      return res.status(404).json({ error: 'Site not connected' });
    }
    
    const credentials = JSON.parse(decrypt(connection.credentials_encrypted));
    
    // Start sync
    const scraper = new GenericScraper(site);
    await scraper.scrapeLicenses(req.user.id, credentials);
    
    res.json({ success: true, message: 'Sync completed' });
  } catch (err) {
    console.error('Sync site error:', err);
    res.status(500).json({ error: 'Failed to sync site' });
  }
});

// Disconnect site
router.delete('/:site', authenticateToken, (req, res) => {
  try {
    const { site } = req.params;
    
    db.prepare(`
      DELETE FROM connected_sites 
      WHERE user_id = ? AND site_name = ?
    `).run(req.user.id, site);
    
    res.json({ success: true, message: 'Site disconnected' });
  } catch (err) {
    console.error('Disconnect site error:', err);
    res.status(500).json({ error: 'Failed to disconnect site' });
  }
});

module.exports = router;