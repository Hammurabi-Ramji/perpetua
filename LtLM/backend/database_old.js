const sqlite3 = require('sqlite3').verbose();
const path = require('node:path');

const DB_PATH = path.join(__dirname, 'licensevault.db');
let db;

async function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, async (err) => {
      if (err) {
        reject(err);
        return;
      }

      try {
        // Create basic tables
        await createTables();
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function createTables() {
  return new Promise((resolve, reject) => {
    db.serialize(async () => {
      try {

        db.run(`
          CREATE TABLE IF NOT EXISTS connected_sites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            site_name TEXT NOT NULL,
            site_domain TEXT NOT NULL,
            access_token TEXT,
            refresh_token TEXT,
            token_expires_at DATETIME,
            credentials_encrypted TEXT,
            last_synced DATETIME,
            sync_status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, site_name)
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS licenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            site_id INTEGER,
            license_key TEXT,
            license_key_encrypted TEXT,
            product_name TEXT NOT NULL,
            product_url TEXT,
            purchase_date DATE,
            expiry_date DATE,
            status TEXT DEFAULT 'active',
            redemption_url TEXT,
            download_url TEXT,
            notes TEXT,
            is_lifetime BOOLEAN DEFAULT 1,
            action_required BOOLEAN DEFAULT 0,
            action_description TEXT,
            action_deadline DATE,
            verified BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (site_id) REFERENCES connected_sites(id) ON DELETE SET NULL
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            license_id INTEGER,
            reminder_type TEXT NOT NULL,
            remind_at DATETIME NOT NULL,
            message TEXT,
            sent BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE
          )
        `, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    });
  });
}

function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

module.exports = { initializeDatabase, getDatabase };