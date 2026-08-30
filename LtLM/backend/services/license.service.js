const { getDatabase } = require('../database');
const { decrypt } = require('../utils/encryption');

class LicenseService {
  getUserLicenses(userId, filters = {}) {
    return new Promise((resolve, reject) => {
      const db = getDatabase();

      let query = `
        SELECT l.*, cs.site_name as source_site
        FROM licenses l
        LEFT JOIN connected_sites cs ON l.site_id = cs.id
        WHERE l.user_id = ?
      `;
      const params = [userId];

      if (filters.status) {
        query += ` AND l.status = ?`;
        params.push(filters.status);
      }

      if (filters.action_required) {
        query += ` AND l.action_required = 1`;
      }

      query += ` ORDER BY l.purchase_date DESC`;

      db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  getLicenseById(userId, licenseId) {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const query = `
        SELECT l.*, cs.site_name, cs.credentials_encrypted
        FROM licenses l
        LEFT JOIN connected_sites cs ON l.site_id = cs.id
        WHERE l.id = ? AND l.user_id = ?
      `;

      db.get(query, [licenseId, userId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          if (row?.license_key_encrypted) {
            // Decrypt key on demand with master password
            row.license_key = decrypt(row.license_key_encrypted);
          }
          resolve(row);
        }
      });
    });
  }

  updateLicenseAction(userId, licenseId, actionData) {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const query = `
        UPDATE licenses
        SET action_required = 1,
            action_description = ?,
            action_deadline = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `;

      db.run(query, [actionData.description, actionData.deadline, licenseId, userId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  markActionComplete(userId, licenseId) {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const query = `
        UPDATE licenses
        SET action_required = 0,
            action_description = NULL,
            action_deadline = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `;

      db.run(query, [licenseId, userId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  getExpiringSoon(userId, days = 30) {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const date = new Date();
      date.setDate(date.getDate() + days);

      const query = `
        SELECT * FROM licenses
        WHERE user_id = ?
          AND action_required = 1
          AND action_deadline <= ?
        ORDER BY action_deadline ASC
      `;

      db.all(query, [userId, date.toISOString().split('T')[0]], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  analyzeLicenseForActions(license) {
    const actions = [];
    
    // Parse common action patterns
    if (license.redemption_url && !license.verified) {
      actions.push({
        type: 'redeem',
        description: 'License not yet redeemed. Complete redemption to activate.',
        urgency: 'high',
        deadline: this.calculateDeadline(license.purchase_date, 30)
      });
    }

    // Check for SaaS products that might require periodic login
    if (license.product_name.toLowerCase().includes('saas') || 
        license.product_name.toLowerCase().includes('subscription')) {
      actions.push({
        type: 'periodic_login',
        description: 'Login required every 30 days to maintain active status',
        urgency: 'medium',
        deadline: this.calculateDeadline(null, 30)
      });
    }

    // StackSocial/AppSumo common: codes must be redeemed within 60 days
    if (!license.redemption_url && !license.license_key) {
      actions.push({
        type: 'claim_code',
        description: 'Product code must be claimed from purchase page',
        urgency: 'high',
        deadline: this.calculateDeadline(license.purchase_date, 60)
      });
    }

    return actions;
  }

  calculateDeadline(fromDate, days) {
    const date = fromDate ? new Date(fromDate) : new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  }

  addLicense(userId, licenseData) {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      
      const {
        product_name,
        license_key,
        purchase_date,
        expiry_date,
        product_url,
        redemption_url,
        download_url,
        notes,
        is_lifetime = true
      } = licenseData;

      const query = `
        INSERT INTO licenses (
          user_id, product_name, license_key, purchase_date, expiry_date,
          product_url, redemption_url, download_url, notes, is_lifetime,
          status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
      `;

      const params = [
        userId, product_name, license_key, purchase_date, expiry_date,
        product_url, redemption_url, download_url, notes, is_lifetime
      ];

      db.run(query, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID });
        }
      });
    });
  }

  updateLicense(userId, licenseId, licenseData) {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      
      const {
        product_name,
        license_key,
        purchase_date,
        expiry_date,
        product_url,
        notes,
        status
      } = licenseData;

      const query = `
        UPDATE licenses
        SET product_name = ?, license_key = ?, purchase_date = ?, expiry_date = ?,
            product_url = ?, notes = ?, status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `;

      const params = [
        product_name, license_key, purchase_date, expiry_date,
        product_url, notes, status, licenseId, userId
      ];

      db.run(query, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  deleteLicense(userId, licenseId) {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const query = `DELETE FROM licenses WHERE id = ? AND user_id = ?`;

      db.run(query, [licenseId, userId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }
}

module.exports = new LicenseService();