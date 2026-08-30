const sqlite3 = require('sqlite3').verbose();
const path = require('node:path');

let db;
let currentDbPath;

function getDatabasePath() {
  return path.resolve(process.env.DATABASE_PATH || path.join(__dirname, 'licensevault.db'));
}

function closeDatabase() {
  return new Promise((resolve, reject) => {
    if (!db) {
      currentDbPath = undefined;
      resolve();
      return;
    }

    db.close((err) => {
      if (err) {
        reject(err);
        return;
      }

      db = undefined;
      currentDbPath = undefined;
      resolve();
    });
  });
}

function addColumnIfNotExists(tableName, columnDef) {
  return new Promise((resolve) => {
    const columnName = columnDef.split(' ')[0];
    db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnDef}`, (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error(`Error adding ${columnName} column to ${tableName}:`, err);
      }
      resolve();
    });
  });
}

async function initializeDatabase(dbPath = getDatabasePath()) {
  const resolvedPath = path.resolve(dbPath);

  if (db && currentDbPath === resolvedPath) {
    return;
  }

  if (db) {
    await closeDatabase();
  }

  return new Promise(async (resolve, reject) => {
    db = new sqlite3.Database(resolvedPath, async (err) => {
      if (err) {
        reject(err);
        return;
      }

      currentDbPath = resolvedPath;

      try {
        await createTables();
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function createTables() {
  // Create users table
  await runQuery(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
  )`);

  // Add missing columns to users table
  await addColumnIfNotExists('users', 'last_login DATETIME');
  await addColumnIfNotExists('users', 'notification_email TEXT');
  await addColumnIfNotExists('users', 'email_notifications BOOLEAN DEFAULT 1');

  // Create connected_sites table
  await runQuery(`CREATE TABLE IF NOT EXISTS connected_sites (
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
  )`);

  // Create licenses table
  await runQuery(`CREATE TABLE IF NOT EXISTS licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    site_id INTEGER,
    license_key TEXT,
    license_key_encrypted TEXT,
    product_name TEXT NOT NULL DEFAULT "",
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
  )`);

  // Create reminders table
  await runQuery(`CREATE TABLE IF NOT EXISTS reminders (
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
  )`);

  // Create scraper_configs table
  await runQuery(`CREATE TABLE IF NOT EXISTS scraper_configs (
    site_name TEXT PRIMARY KEY,
    base_url TEXT NOT NULL,
    login_selector TEXT,
    orders_url TEXT,
    license_selectors TEXT
  )`);

  // Create greta_conversations table
  await runQuery(`CREATE TABLE IF NOT EXISTS greta_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    session_id TEXT NOT NULL,
    message TEXT NOT NULL,
    response TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  // Create twidget_apis table
  await runQuery(`CREATE TABLE IF NOT EXISTS twidget_apis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    config TEXT NOT NULL, -- JSON config for the API logic
    enabled BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, path, method)
  )`);

  // Create pickaxe_agents table
  await runQuery(`CREATE TABLE IF NOT EXISTS pickaxe_agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    system_prompt TEXT NOT NULL,
    model TEXT DEFAULT 'llama2',
    knowledge_base TEXT, -- JSON array of knowledge items
    personality TEXT,
    enabled BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  // Create pickaxe_conversations table
  await runQuery(`CREATE TABLE IF NOT EXISTS pickaxe_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    session_id TEXT NOT NULL,
    message TEXT NOT NULL,
    response TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (agent_id) REFERENCES pickaxe_agents(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  // Create storage_services table
  await runQuery(`CREATE TABLE IF NOT EXISTS storage_services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    service_name TEXT NOT NULL, -- 'koofr', 'icedrive', 'degoo'
    service_type TEXT NOT NULL, -- 'aggregator', 'encrypted_vault', 'media_archive'
    account_email TEXT,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at DATETIME,
    api_key TEXT,
    api_secret TEXT,
    credentials_encrypted TEXT, -- AES-256 encrypted credentials
    base_url TEXT,
    webdav_url TEXT,
    mount_path TEXT,
    enabled BOOLEAN DEFAULT 1,
    last_synced DATETIME,
    sync_status TEXT DEFAULT 'disconnected',
    storage_used_bytes INTEGER DEFAULT 0,
    storage_limit_bytes INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, service_name)
  )`);

  // Create storage_files table
  await runQuery(`CREATE TABLE IF NOT EXISTS storage_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    storage_service_id INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size_bytes INTEGER,
    mime_type TEXT,
    checksum TEXT,
    remote_id TEXT, -- Provider-specific file ID
    remote_url TEXT,
    sync_status TEXT DEFAULT 'pending', -- 'pending', 'synced', 'failed'
    last_synced DATETIME,
    is_encrypted BOOLEAN DEFAULT 0,
    encryption_key_id TEXT,
    backup_priority INTEGER DEFAULT 1, -- 1=low, 2=medium, 3=high
    retention_days INTEGER, -- For Degoo archival
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (storage_service_id) REFERENCES storage_services(id) ON DELETE CASCADE,
    UNIQUE(storage_service_id, file_path)
  )`);

  // Create storage_sync_logs table
  await runQuery(`CREATE TABLE IF NOT EXISTS storage_sync_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    storage_service_id INTEGER,
    operation TEXT NOT NULL, -- 'upload', 'download', 'delete', 'sync'
    file_path TEXT,
    status TEXT NOT NULL, -- 'success', 'failed', 'in_progress'
    error_message TEXT,
    bytes_transferred INTEGER DEFAULT 0,
    duration_ms INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (storage_service_id) REFERENCES storage_services(id) ON DELETE SET NULL
  )`);

  // === EDUBA CODE VAULT TABLES ===

  // Create eduba_repositories table (The Vault's repository registry)
  await runQuery(`CREATE TABLE IF NOT EXISTS eduba_repositories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    repository_path TEXT NOT NULL, -- Local path to the repository
    is_encrypted BOOLEAN DEFAULT 1,
    encryption_key_id TEXT, -- Reference to encryption key
    forge_manifest TEXT, -- SHA-3-256 hash of the entire repository state
    repository_type TEXT DEFAULT 'code', -- 'code', 'artifact', 'library'
    is_sealed BOOLEAN DEFAULT 0, -- Whether repository is locked/immutable
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, name)
  )`);

  // Create eduba_commits table (The Scribe's ledger)
  await runQuery(`CREATE TABLE IF NOT EXISTS eduba_commits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repository_id INTEGER NOT NULL,
    commit_hash TEXT NOT NULL, -- SHA-3-256 hash of the commit
    parent_commit_hash TEXT, -- For branching/merging
    author_name TEXT, -- Anonymous by default (no email/IP tracking)
    commit_message TEXT NOT NULL,
    commit_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    forge_manifest TEXT NOT NULL, -- SHA-3-256 hash of all files in this commit
    is_signed BOOLEAN DEFAULT 0, -- Whether commit is cryptographically signed
    signature_data TEXT, -- Digital signature if signed
    commit_size_bytes INTEGER, -- Size of all files in commit
    file_count INTEGER, -- Number of files in commit
    branch_name TEXT DEFAULT 'main',
    tags TEXT, -- JSON array of tags
    metadata TEXT, -- JSON metadata (time-spiral coordinates, etc.)
    FOREIGN KEY (repository_id) REFERENCES eduba_repositories(id) ON DELETE CASCADE,
    UNIQUE(repository_id, commit_hash)
  )`);

  // Create eduba_files table (File tracking within commits)
  await runQuery(`CREATE TABLE IF NOT EXISTS eduba_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    commit_id INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    file_hash TEXT NOT NULL, -- SHA-3-256 hash of file content
    file_size_bytes INTEGER,
    mime_type TEXT,
    is_binary BOOLEAN DEFAULT 0,
    permissions TEXT DEFAULT '644', -- Unix-style permissions
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (commit_id) REFERENCES eduba_commits(id) ON DELETE CASCADE,
    UNIQUE(commit_id, file_path)
  )`);

  // Create eduba_artifacts table (The Kiln's sealed artifacts)
  await runQuery(`CREATE TABLE IF NOT EXISTS eduba_artifacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repository_id INTEGER NOT NULL,
    artifact_name TEXT NOT NULL,
    artifact_type TEXT NOT NULL, -- 'wasm', 'binary', 'library', 'module'
    version TEXT NOT NULL,
    forge_manifest TEXT NOT NULL, -- Genesis Seal v1.4 hash
    artifact_path TEXT NOT NULL, -- Path to sealed artifact file
    artifact_size_bytes INTEGER,
    build_metadata TEXT, -- JSON: compiler version, dependencies, etc.
    is_replicable BOOLEAN DEFAULT 0, -- For Genesis Self-Replication
    replication_key TEXT, -- Key for replication if enabled
    sealed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (repository_id) REFERENCES eduba_repositories(id) ON DELETE CASCADE,
    UNIQUE(repository_id, artifact_name, version)
  )`);

  // Create eduba_dependencies table (Local crate registry cache)
  await runQuery(`CREATE TABLE IF NOT EXISTS eduba_dependencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    source TEXT NOT NULL, -- 'crates.io', 'local', 'git'
    source_url TEXT,
    checksum TEXT, -- SHA-3-256 of the dependency
    cached_path TEXT, -- Local path where dependency is cached
    metadata TEXT, -- JSON: license, authors, etc.
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, version, source)
  )`);

  // Create eduba_semantic_index table (Hyperdimensional Context Web)
  await runQuery(`CREATE TABLE IF NOT EXISTS eduba_semantic_index (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repository_id INTEGER,
    file_id INTEGER,
    semantic_hash TEXT NOT NULL, -- Semantic fingerprint of code
    context_type TEXT NOT NULL, -- 'function', 'class', 'module', 'pattern'
    context_name TEXT,
    context_description TEXT,
    code_snippet TEXT, -- Relevant code excerpt
    tags TEXT, -- JSON array of semantic tags
    embedding_vector TEXT, -- For future AI semantic search
    indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (repository_id) REFERENCES eduba_repositories(id) ON DELETE CASCADE,
    FOREIGN KEY (file_id) REFERENCES eduba_files(id) ON DELETE CASCADE
  )`);

  // Create eduba_sync_peers table (Fractal CRDT peer registry)
  await runQuery(`CREATE TABLE IF NOT EXISTS eduba_sync_peers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    peer_id TEXT NOT NULL, -- Unique peer identifier
    peer_name TEXT,
    public_key TEXT NOT NULL, -- For encryption verification
    last_seen DATETIME,
    sync_status TEXT DEFAULT 'disconnected', -- 'connected', 'syncing', 'disconnected'
    capabilities TEXT, -- JSON: supported CRDT operations
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, peer_id)
  )`);

  // Create eduba_honey_traps table (The Labyrinth's decoy system)
  await runQuery(`CREATE TABLE IF NOT EXISTS eduba_honey_traps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    trap_type TEXT NOT NULL, -- 'repository', 'commit', 'artifact'
    trap_path TEXT NOT NULL, -- Path to the decoy
    trigger_condition TEXT, -- When to activate (e.g., 'brute_force_attempt')
    decoy_data TEXT, -- JSON: fake repository/commit data
    activation_count INTEGER DEFAULT 0,
    last_activated DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
}

function runQuery(sql) {
  return new Promise((resolve, reject) => {
    db.run(sql, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function getDatabase() {
  return db;
}

module.exports = { initializeDatabase, getDatabase, closeDatabase };
