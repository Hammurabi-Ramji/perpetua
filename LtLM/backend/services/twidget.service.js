const { getDatabase } = require('../database');

class TwidgetService {
  async createApi(userId, apiData) {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const { name, description, method, path, config } = apiData;

      db.run(
        `INSERT INTO twidget_apis (user_id, name, description, method, path, config) VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, name, description, method, path, JSON.stringify(config)],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, ...apiData });
        }
      );
    });
  }

  async getUserApis(userId) {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      db.all(
        'SELECT * FROM twidget_apis WHERE user_id = ? ORDER BY created_at DESC',
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else {
            // Parse config JSON
            const apis = rows.map(row => ({
              ...row,
              config: JSON.parse(row.config)
            }));
            resolve(apis);
          }
        }
      );
    });
  }

  async updateApi(userId, apiId, updates) {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const fields = [];
      const values = [];

      if (updates.name) {
        fields.push('name = ?');
        values.push(updates.name);
      }
      if (updates.description !== undefined) {
        fields.push('description = ?');
        values.push(updates.description);
      }
      if (updates.method) {
        fields.push('method = ?');
        values.push(updates.method);
      }
      if (updates.path) {
        fields.push('path = ?');
        values.push(updates.path);
      }
      if (updates.config) {
        fields.push('config = ?');
        values.push(JSON.stringify(updates.config));
      }
      if (updates.enabled !== undefined) {
        fields.push('enabled = ?');
        values.push(updates.enabled);
      }

      fields.push('updated_at = CURRENT_TIMESTAMP');

      const sql = `UPDATE twidget_apis SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`;
      values.push(apiId, userId);

      db.run(sql, values, function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  }

  async deleteApi(userId, apiId) {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      db.run(
        'DELETE FROM twidget_apis WHERE id = ? AND user_id = ?',
        [apiId, userId],
        function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes });
        }
      );
    });
  }

  async executeApi(userId, apiId, params = {}) {
    // Get the API config
    const apis = await this.getUserApis(userId);
    const api = apis.find(a => a.id === parseInt(apiId));

    if (!api || !api.enabled) {
      throw new Error('API not found or disabled');
    }

    // Execute based on config
    const result = await this.executeApiLogic(api.config, params);
    return result;
  }

  async executeApiLogic(config, params) {
    // Simple execution engine for Twidget APIs
    // This is a basic implementation - in real Twidget, this would be more complex

    const { type, source, filters, transformations } = config;

    switch (type) {
      case 'license_query':
        return await this.executeLicenseQuery(source, filters, transformations, params);
      case 'license_stats':
        return await this.executeLicenseStats();
      case 'custom_logic':
        return await this.executeCustomLogic(config.logic, params);
      default:
        throw new Error('Unsupported API type');
    }
  }

  async executeLicenseQuery(source, filters, transformations, params) {
    const db = getDatabase();
    let query = 'SELECT * FROM licenses WHERE user_id = ?';
    const values = [params.userId];

    // Apply filters
    if (filters) {
      if (filters.status) {
        query += ' AND status = ?';
        values.push(filters.status);
      }
      if (filters.action_required) {
        query += ' AND action_required = 1';
      }
    }

    query += ' ORDER BY created_at DESC';

    return new Promise((resolve, reject) => {
      db.all(query, values, (err, rows) => {
        if (err) reject(err);
        else {
          let result = rows;
          // Apply transformations
          if (transformations) {
            result = this.applyTransformations(result, transformations);
          }
          resolve(result);
        }
      });
    });
  }

  async executeLicenseStats() {
    const db = getDatabase();
    return new Promise((resolve, reject) => {
      db.get(`
        SELECT
          COUNT(*) as total_licenses,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active_licenses,
          COUNT(CASE WHEN action_required = 1 THEN 1 END) as action_required,
          COUNT(CASE WHEN is_lifetime = 1 THEN 1 END) as lifetime_licenses
        FROM licenses WHERE user_id = ?
      `, [params.userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async executeCustomLogic(logic, params) {
    // Simple custom logic executor
    // In real Twidget, this would be a visual programming language
    try {
      // For now, just return the logic config
      return { result: 'Custom logic executed', logic, params };
    } catch (error) {
      throw new Error('Custom logic execution failed');
    }
  }

  applyTransformations(data, transformations) {
    let result = [...data];

    if (transformations.limit) {
      result = result.slice(0, transformations.limit);
    }

    if (transformations.fields) {
      result = result.map(item => {
        const filtered = {};
        transformations.fields.forEach(field => {
          if (item[field] !== undefined) {
            filtered[field] = item[field];
          }
        });
        return filtered;
      });
    }

    return result;
  }
}

module.exports = new TwidgetService();