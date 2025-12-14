const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'accredible.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // Create external_profiles table
    db.run(`CREATE TABLE IF NOT EXISTS external_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        wallet_url TEXT NOT NULL,
        platform TEXT DEFAULT 'accredible',
        auto_sync BOOLEAN DEFAULT 0,
        last_synced_at TIMESTAMP,
        status TEXT DEFAULT 'active',
        UNIQUE(user_id, wallet_url)
    )`);

    // Create credentials table
    db.run(`CREATE TABLE IF NOT EXISTS credentials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        credential_uuid TEXT NOT NULL,
        issuer_domain TEXT,
        credential_url TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, credential_uuid)
    )`);
});

module.exports = db;
